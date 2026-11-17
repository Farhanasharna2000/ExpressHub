import "server-only";
import {
  Prisma,
  PaymentStatus,
  ShipmentStatus,
  UserRole,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { paginateTransaction } from "@/lib/db/pagination";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import type { ListAuditLogsInput } from "@/validators/admin";
import { delayedExamples, hoursSince } from "@/services/ai/ops-brief.service";

function zeroCounts<T extends string>(values: T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<
    T,
    number
  >;
}

export async function getDashboardStats(actor: AuthenticatedUser) {
  requireRole(actor, "ADMIN");
  // All aggregates share one database snapshot. Retained payment history includes
  // deleted shipments, while operational user/shipment counts exclude deletion.
  const [userGroups, shipmentGroups, paymentGroups] = await prisma.$transaction(
    [
      prisma.user.groupBy({
        by: ["role", "isActive"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.shipment.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ["currency", "status"],
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: [{ currency: "asc" }, { status: "asc" }],
      }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  const users = {
    total: 0,
    active: 0,
    inactive: 0,
    byRole: zeroCounts(Object.values(UserRole)),
  };
  for (const group of userGroups) {
    users.total += group._count._all;
    users[group.isActive ? "active" : "inactive"] += group._count._all;
    users.byRole[group.role] += group._count._all;
  }
  const shipments = {
    total: 0,
    active: 0,
    byStatus: zeroCounts(Object.values(ShipmentStatus)),
  };
  for (const group of shipmentGroups) {
    shipments.total += group._count._all;
    shipments.byStatus[group.status] += group._count._all;
    if (!["DELIVERED", "RETURNED", "CANCELLED"].includes(group.status))
      shipments.active += group._count._all;
  }
  const payments = {
    total: 0,
    byStatus: zeroCounts(Object.values(PaymentStatus)),
    amounts: paymentGroups.map((group) => ({
      currency: group.currency,
      status: group.status,
      count: group._count._all,
      amount: (group._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    })),
  };
  for (const group of paymentGroups) {
    payments.total += group._count._all;
    payments.byStatus[group.status] += group._count._all;
  }
  return { users, shipments, payments };
}

export async function listAuditLogs(
  actor: AuthenticatedUser,
  input: ListAuditLogsInput,
) {
  requireRole(actor, "ADMIN");
  const where: Prisma.AuditLogWhereInput = {
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    shipmentId: input.shipmentId,
    paymentId: input.paymentId,
    action: input.action,
    createdAt: {
      gte: input.from ? new Date(input.from) : undefined,
      lte: input.to ? new Date(input.to) : undefined,
    },
  };
  const { items: auditLogs, pagination } = await paginateTransaction(
    (bounds) => [
      prisma.auditLog.findMany({
        where,
        ...bounds,
        orderBy: [{ [input.sortBy]: input.order }, { id: "asc" }],
        // Do not join entire users/payments: they contain passwords and provider data.
        select: {
          id: true,
          actorId: true,
          entityType: true,
          entityId: true,
          shipmentId: true,
          paymentId: true,
          action: true,
          details: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ],
    input,
  );
  return {
    auditLogs,
    pagination,
  };
}

const IN_TRANSIT_STATUSES: ShipmentStatus[] = ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"];
const CLOSED_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELLED"];
const BRIEF_EXAMPLES = 5;
// Prisma can't order by a relation's latest date, so the oldest-created delayed shipments are
// ranked by last event in code. Bounded so a large backlog stays a cheap query.
const DELAYED_CANDIDATES = 100;

// Figures for the AI operations brief. Shipment examples carry only the tracking number,
// status and age, never customer names, phones or addresses.
export async function getOperationsFacts(
  actor: AuthenticatedUser,
  now: Date,
  day: { start: Date; label: string },
  delayThresholdHours: number,
) {
  requireRole(actor, "ADMIN");
  const stats = await getDashboardStats(actor);
  const delayedBefore = new Date(now.getTime() - delayThresholdHours * 60 * 60 * 1000);
  const live = { deletedAt: null };
  // Delay and "failed today" come from shipment events, not updatedAt, which also moves on
  // payment, refund and archive writes.
  const delayedWhere: Prisma.ShipmentWhereInput = {
    ...live,
    status: { in: IN_TRANSIT_STATUSES },
    events: { none: { occurredAt: { gte: delayedBefore } } },
  };
  const unassignedWhere: Prisma.ShipmentWhereInput = { ...live, paymentStatus: "PAID", courierId: null, status: { notIn: CLOSED_STATUSES } };
  const select = { id: true, trackingNumber: true, status: true, updatedAt: true } as const;

  const [createdToday, deliveredToday, failedToday, failedCount, recentFailed, delayedCount, delayed, unassignedCount, unassigned, activeCouriers] =
    await prisma.$transaction(
      [
        prisma.shipment.count({ where: { ...live, createdAt: { gte: day.start } } }),
        prisma.shipment.count({ where: { ...live, status: "DELIVERED", deliveredAt: { gte: day.start } } }),
        prisma.shipment.count({ where: { ...live, status: "FAILED", events: { some: { toStatus: "FAILED", occurredAt: { gte: day.start } } } } }),
        prisma.shipment.count({ where: { ...live, status: "FAILED" } }),
        prisma.shipment.findMany({ where: { ...live, status: "FAILED" }, select, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: BRIEF_EXAMPLES }),
        prisma.shipment.count({ where: delayedWhere }),
        prisma.shipment.findMany({
          where: delayedWhere,
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            createdAt: true,
            events: { select: { occurredAt: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1 },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: DELAYED_CANDIDATES,
        }),
        prisma.shipment.count({ where: unassignedWhere }),
        prisma.shipment.findMany({ where: unassignedWhere, select, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: BRIEF_EXAMPLES }),
        prisma.user.count({ where: { ...live, role: "COURIER", isActive: true } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

  const ref = (shipment: { id: string; trackingNumber: string; status: ShipmentStatus; updatedAt: Date }) => ({
    id: shipment.id,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    hoursSinceUpdate: hoursSince(now, shipment.updatedAt),
  });

  return {
    day: day.label,
    delayThresholdHours,
    shipments: { total: stats.shipments.total, active: stats.shipments.active, byStatus: stats.shipments.byStatus },
    today: { created: createdToday, delivered: deliveredToday, failed: failedToday },
    failed: { count: failedCount, recent: recentFailed.map(ref) },
    delayed: { count: delayedCount, oldest: delayedExamples(delayed, now, BRIEF_EXAMPLES) },
    unassignedPaid: { count: unassignedCount, oldest: unassigned.map(ref) },
    payments: { pending: stats.payments.byStatus.PENDING, paid: stats.payments.byStatus.PAID, failed: stats.payments.byStatus.FAILED },
    couriers: { active: activeCouriers },
  };
}
