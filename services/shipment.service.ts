import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, ShipmentStatus, type Shipment } from "@prisma/client";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import prisma from "@/lib/prisma";
import { paginateTransaction } from "@/lib/db/pagination";
import type { PaymentGateway } from "@/lib/payments/stripe";
import { applyRefund, reserveRefund, sendRefund } from "@/services/payment.service";
import type {
  AssignCourierInput,
  CreateShipmentInput,
  ListShipmentsInput,
  ShipmentStatusInput,
} from "@/validators/shipment";

const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  CREATED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  FAILED: ["IN_TRANSIT", "RETURNED"],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};
const missing = () =>
  new AppError(404, "Shipment not found", "SHIPMENT_NOT_FOUND");
const conflict = (message: string) =>
  new AppError(409, message, "SHIPMENT_CONFLICT");

function scope(actor: AuthenticatedUser): Prisma.ShipmentWhereInput {
  return {
    deletedAt: null,
    ...(actor.role === "CUSTOMER"
      ? { customerId: actor.id }
      : actor.role === "COURIER"
        ? { courierId: actor.id }
        : {}),
  };
}

async function transaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  trackingRetry = false,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          (trackingRetry &&
            error.code === "P2002" &&
            Array.isArray(error.meta?.target) &&
            error.meta.target.includes("trackingNumber")))
      ) {
        if (attempt < 2) continue;
        throw conflict("Concurrent shipment change; please retry");
      }
      throw error;
    }
  }
  throw new Error("Unreachable transaction retry state");
}

async function currentActor(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
) {
  const user = await tx.user.findFirst({
    where: { id: actor.id, isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user)
    throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
  return user;
}

async function record(
  tx: Prisma.TransactionClient,
  actorId: string,
  shipment: Shipment,
  type:
    | "CREATED"
    | "COURIER_ASSIGNED"
    | "STATUS_CHANGED"
    | "CUSTOMER_CANCELLED",
  action: string,
  details: Prisma.InputJsonObject,
  fromStatus?: ShipmentStatus,
  note?: string,
) {
  await tx.shipmentEvent.create({
    data: {
      shipmentId: shipment.id,
      actorId,
      type,
      fromStatus,
      toStatus: shipment.status,
      // Operator notes can contain recipient details; never expose them to customers.
      internalNote: note,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      entityType: "SHIPMENT",
      entityId: shipment.id,
      shipmentId: shipment.id,
      action,
      details,
    },
  });
}

export async function createShipment(
  actor: AuthenticatedUser,
  input: CreateShipmentInput,
) {
  return transaction(async (tx) => {
    const user = await currentActor(tx, actor);
    requireRole(user, "CUSTOMER");
    const now = new Date();
    const weight = new Prisma.Decimal(input.parcelWeightKg);
    const rules = await tx.pricingRule.findMany({
      where: {
        isActive: true,
        minWeightKg: { lte: weight },
        maxWeightKg: { gte: weight },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      take: 2,
    });
    if (rules.length !== 1)
      throw new AppError(
        503,
        "A unique active pricing rule is required for this weight",
        "PRICING_UNAVAILABLE",
      );
    const rule = rules[0];
    const extraKg = Prisma.Decimal.max(
      weight.minus(rule.minWeightKg),
      0,
    ).ceil();
    const price = rule.baseFee
      .plus(extraKg.times(rule.additionalPerKgFee))
      .toDecimalPlaces(2);
    if (
      rule.baseFee.isNegative() ||
      rule.additionalPerKgFee.isNegative() ||
      price.lte(0) ||
      price.gt("9999999999.99") ||
      !/^[A-Z]{3}$/.test(rule.currency)
    ) {
      throw new AppError(503, "Pricing rule is invalid", "PRICING_UNAVAILABLE");
    }
    const shipment = await tx.shipment.create({
      data: {
        ...input,
        pickupScheduledAt: input.pickupScheduledAt
          ? new Date(input.pickupScheduledAt)
          : undefined,
        customerId: user.id,
        trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
        price,
        currency: rule.currency,
        status: "CREATED",
        paymentStatus: "PENDING",
      },
    });
    await record(tx, user.id, shipment, "CREATED", "SHIPMENT_CREATED", {
      pricingRuleId: rule.id,
      price: price.toFixed(2),
      currency: rule.currency,
    });
    return shipment;
  }, true);
}

export async function getShipment(actor: AuthenticatedUser, id: string) {
  const shipment = await prisma.shipment.findFirst({
    where: { ...scope(actor), id },
    include: {
      events: {
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true, type: true, fromStatus: true, toStatus: true,
          publicNote: true, occurredAt: true,
          // Customers must never receive internal notes or operator identities.
          ...(actor.role !== "CUSTOMER" ? { internalNote: true, actorId: true } : {}),
        },
      },
    },
  });
  if (!shipment) throw missing();
  return shipment;
}

export async function listShipments(
  actor: AuthenticatedUser,
  input: ListShipmentsInput,
  mine = false,
) {
  const where: Prisma.ShipmentWhereInput = {
    ...scope(actor),
    ...(mine && actor.role === "ADMIN" ? { customerId: actor.id } : {}),
    status: input.status,
    paymentStatus: input.paymentStatus,
    createdAt: {
      gte: input.from ? new Date(input.from) : undefined,
      lte: input.to ? new Date(input.to) : undefined,
    },
    ...(input.q
      ? {
          OR: [
            "trackingNumber",
            "pickupContactName",
            "deliveryContactName",
            "pickupAddress",
            "deliveryAddress",
          ].map((field) => ({
            [field]: { contains: input.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
  const { items: shipments, pagination } = await paginateTransaction(
    (bounds) => [
      prisma.shipment.findMany({
        where,
        ...bounds,
        orderBy: [{ [input.sortBy]: input.order }, { id: "asc" }],
      }),
      prisma.shipment.count({ where }),
    ],
    input,
  );
  return {
    shipments,
    pagination,
  };
}

export async function assignCourier(
  actor: AuthenticatedUser,
  id: string,
  input: AssignCourierInput,
) {
  return transaction(async (tx) => {
    const user = await currentActor(tx, actor);
    requireRole(user, "ADMIN");
    const before = await tx.shipment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) throw missing();
    if (before.courierId !== input.expectedCourierId)
      throw conflict("Courier assignment changed; reload the shipment");
    if (!["CREATED", "FAILED"].includes(before.status))
      throw conflict(
        "Courier assignment is allowed only before pickup or after failure",
      );
    const courier = await tx.user.findFirst({
      where: {
        id: input.courierId,
        role: "COURIER",
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!courier)
      throw new AppError(400, "Choose an active Courier", "INVALID_COURIER");
    if (before.courierId === courier.id) return before;
    const shipment = await tx.shipment.update({
      where: { id },
      data: { courierId: courier.id },
    });
    await record(
      tx,
      user.id,
      shipment,
      "COURIER_ASSIGNED",
      "SHIPMENT_COURIER_ASSIGNED",
      {
        before: { courierId: before.courierId },
        after: { courierId: courier.id },
      },
      before.status,
    );
    return shipment;
  });
}

export async function updateShipmentStatus(
  actor: AuthenticatedUser,
  id: string,
  input: ShipmentStatusInput,
  gateway?: PaymentGateway,
) {
  const outcome = await transaction(async (tx) => {
    const user = await currentActor(tx, actor);
    const before = await tx.shipment.findFirst({
      where: { ...scope(user), id },
    });
    if (!before) throw missing();
    if (user.role === "CUSTOMER" && input.status !== "CANCELLED") {
      throw new AppError(
        403,
        "Customers can only cancel their own shipment before pickup",
        "FORBIDDEN",
      );
    }
    if (
      user.role === "COURIER" &&
      (input.status === "CANCELLED" || before.status === "FAILED")
    ) {
      throw new AppError(
        403,
        "Cancellation, retry and return require an Admin",
        "FORBIDDEN",
      );
    }
    if (before.status !== input.expectedStatus)
      throw conflict("Shipment status changed; reload the shipment");
    if (!transitions[before.status].includes(input.status))
      throw conflict("Invalid shipment status transition");
    if (
      input.status === "CANCELLED" &&
      (await tx.payment.findFirst({
        where: { shipmentId: id, status: "PENDING" },
      }))
    ) {
      throw conflict(
        "Resolve or expire the pending Stripe checkout before cancelling the shipment",
      );
    }
    if (input.status === "CANCELLED") {
      const paidPayment = await tx.payment.findFirst({
        where: { shipmentId: id, status: "PAID" },
      });
      if (paidPayment) {
        // The refund is reserved here and sent to Stripe after this transaction.
        return {
          refund: await reserveRefund(tx, paidPayment),
          before,
          role: user.role,
        };
      } else if (before.paymentStatus === "PAID") {
        throw conflict(
          "Paid shipment requires an active payment record for refund reconciliation",
        );
      }
    }
    if (!["CANCELLED", "RETURNED"].includes(input.status)) {
      if (before.paymentStatus !== "PAID")
        throw conflict(
          "Confirmed payment is required before pickup or dispatch",
        );
      const courier =
        before.courierId &&
        (await tx.user.findFirst({
          where: {
            id: before.courierId,
            role: "COURIER",
            isActive: true,
            deletedAt: null,
          },
          select: { id: true },
        }));
      if (!courier) throw conflict("An active assigned Courier is required");
    }
    return { shipment: await applyStatus(tx, user, before, input) };
  });
  if ("shipment" in outcome) return outcome.shipment;

  const reason = input.note ?? "Shipment cancelled by user";
  const result = await sendRefund(outcome.refund, reason, gateway);
  return transaction(async (tx) => {
    await applyRefund(tx, outcome.refund.payment.id, result, actor.id, reason);
    // The reservation keeps the payment out of PAID, so nothing else can move
    // this shipment between the two transactions.
    const before = await tx.shipment.findUniqueOrThrow({ where: { id } });
    if (before.status === "CANCELLED") return before;
    if (before.status !== outcome.before.status)
      throw conflict("Shipment status changed; reload the shipment");
    return applyStatus(tx, { id: actor.id, role: outcome.role }, before, input);
  });
}

async function applyStatus(
  tx: Prisma.TransactionClient,
  user: { id: string; role: string },
  before: Shipment,
  input: ShipmentStatusInput,
) {
  const shipment = await tx.shipment.update({
    where: { id: before.id },
    data: {
      status: input.status,
      ...(input.status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
    },
  });
  await record(
    tx,
    user.id,
    shipment,
    user.role === "CUSTOMER" ? "CUSTOMER_CANCELLED" : "STATUS_CHANGED",
    "SHIPMENT_STATUS_UPDATED",
    { before: { status: before.status }, after: { status: shipment.status } },
    before.status,
    input.note,
  );
  return shipment;
}

export async function softDeleteShipment(
  actor: AuthenticatedUser,
  id: string,
  reason: string,
) {
  requireRole(actor, "ADMIN");
  return transaction(async (tx) => {
    requireRole(await currentActor(tx, actor), "ADMIN");
    const before = await tx.shipment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) throw missing();
    if (!["DELIVERED", "RETURNED", "CANCELLED"].includes(before.status)) {
      throw conflict(
        "Complete, return or cancel this shipment before deleting it",
      );
    }
    if (
      before.paymentStatus === "REFUND_PENDING" ||
      (await tx.payment.findFirst({
        where: {
          shipmentId: id,
          status: { in: ["PENDING", "REFUND_PENDING"] },
        },
        select: { id: true },
      }))
    )
      throw conflict(
        "Resolve pending payments or refunds before deleting this shipment",
      );
    const deletedAt = new Date();
    await tx.shipment.update({ where: { id }, data: { deletedAt } });
    // Deletion archives the record, not a delivery-state transition. Keep the
    // existing shipment timeline intact and record the administrative action.
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        entityType: "SHIPMENT",
        entityId: id,
        shipmentId: id,
        action: "SHIPMENT_SOFT_DELETED",
        details: {
          reason,
          before: { deletedAt: null, status: before.status },
          after: { deletedAt: deletedAt.toISOString(), status: before.status },
        },
      },
    });
    return { id, deletedAt };
  });
}
