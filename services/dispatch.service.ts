import "server-only";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import { isFreshLocation } from "@/lib/courier-location";
import { rankCouriers, rulesSuggestions, type CourierStats, type DispatchShipment, type HubRef } from "@/lib/dispatch/scoring";
import type { DispatchContext } from "@/services/ai/dispatch-suggestions.service";

const CLOSED: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELLED"];
const ASSIGNABLE: ShipmentStatus[] = ["CREATED", "FAILED"];
const HISTORY_DAYS = 30;
const MAX_COURIERS = 200;
export const QUEUE_LIMIT = 10;

// A paid, open shipment with no courier that the assign endpoint would accept.
const waitingWhere: Prisma.ShipmentWhereInput = {
  deletedAt: null,
  courierId: null,
  paymentStatus: "PAID",
  status: { in: ASSIGNABLE },
};

const hubSelect = { select: { id: true, name: true, zoneCode: true } } as const;
const shipmentSelect = {
  id: true,
  trackingNumber: true,
  status: true,
  paymentStatus: true,
  courierId: true,
  parcelWeightKg: true,
  createdAt: true,
  originHub: hubSelect,
  destinationHub: hubSelect,
} as const;

type ShipmentRow = Prisma.ShipmentGetPayload<{ select: typeof shipmentSelect }>;

function toDispatchShipment(row: ShipmentRow, now: Date): DispatchShipment {
  return {
    id: row.id,
    trackingNumber: row.trackingNumber,
    status: row.status,
    weightKg: Number(row.parcelWeightKg),
    waitingHours: Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 3_600_000)),
    originHub: (row.originHub as HubRef | null) ?? null,
    destinationHub: (row.destinationHub as HubRef | null) ?? null,
  };
}

// Workload, recent hubs and zones, live location and 30-day delivery record for every
// active courier, read in one snapshot.
export async function loadCourierStats(now = new Date()): Promise<CourierStats[]> {
  const since = new Date(now.getTime() - HISTORY_DAYS * 24 * 3_600_000);
  const couriers = await prisma.user.findMany({
    where: { role: "COURIER", isActive: true, deletedAt: null },
    select: { id: true, name: true, courierLocation: { select: { updatedAt: true } } },
    orderBy: { id: "asc" },
    take: MAX_COURIERS,
  });
  const ids = couriers.map((courier) => courier.id);
  if (ids.length === 0) return [];
  const [open, recent, delivered, failed] = await prisma.$transaction([
    prisma.shipment.groupBy({
      by: ["courierId", "status"],
      where: { courierId: { in: ids }, deletedAt: null, status: { notIn: CLOSED } },
      orderBy: { courierId: "asc" },
      _count: { _all: true },
    }),
    prisma.shipment.findMany({
      where: { courierId: { in: ids }, deletedAt: null, updatedAt: { gte: since } },
      select: { courierId: true, originHub: { select: { id: true, zoneCode: true } }, destinationHub: { select: { id: true, zoneCode: true } } },
      take: 5000,
    }),
    prisma.shipment.groupBy({
      by: ["courierId"],
      where: { courierId: { in: ids }, status: "DELIVERED", deliveredAt: { gte: since } },
      orderBy: { courierId: "asc" },
      _count: { _all: true },
    }),
    prisma.shipment.groupBy({
      by: ["courierId"],
      where: { courierId: { in: ids }, status: { in: ["FAILED", "RETURNED"] }, updatedAt: { gte: since } },
      orderBy: { courierId: "asc" },
      _count: { _all: true },
    }),
  ]);

  const count = (group: { _count?: true | { _all?: number } } | undefined) =>
    group && typeof group._count === "object" ? group._count._all ?? 0 : 0;

  return couriers.map((courier) => {
    const mine = open.filter((group) => group.courierId === courier.id);
    const hubs = new Set<string>();
    const zones = new Set<string>();
    for (const shipment of recent) {
      if (shipment.courierId !== courier.id) continue;
      for (const hub of [shipment.originHub, shipment.destinationHub]) {
        if (hub) {
          hubs.add(hub.id);
          zones.add(hub.zoneCode);
        }
      }
    }
    return {
      id: courier.id,
      name: courier.name,
      openShipments: mine.reduce((sum, group) => sum + count(group), 0),
      outForDelivery: count(mine.find((group) => group.status === "OUT_FOR_DELIVERY")),
      recentHubIds: [...hubs],
      recentZoneCodes: [...zones],
      liveLocation: Boolean(courier.courierLocation && isFreshLocation(courier.courierLocation.updatedAt, now.getTime())),
      delivered30d: count(delivered.find((group) => group.courierId === courier.id)),
      failed30d: count(failed.find((group) => group.courierId === courier.id)),
    };
  });
}

export async function loadDispatchContext(actor: AuthenticatedUser, shipmentId: string, now = new Date()): Promise<DispatchContext> {
  requireRole(actor, "ADMIN");
  const row = await prisma.shipment.findFirst({ where: { id: shipmentId, deletedAt: null }, select: shipmentSelect });
  if (!row) throw new AppError(404, "Shipment not found", "SHIPMENT_NOT_FOUND");
  if (row.courierId) throw new AppError(409, "This shipment already has a courier", "SHIPMENT_CONFLICT");
  if (row.paymentStatus !== "PAID") throw new AppError(409, "Only paid shipments can be dispatched", "SHIPMENT_CONFLICT");
  if (!ASSIGNABLE.includes(row.status)) throw new AppError(409, "This shipment can no longer be assigned", "SHIPMENT_CONFLICT");
  return { shipment: toDispatchShipment(row, now), couriers: await loadCourierStats(now) };
}

// The oldest waiting shipments, each with its rule-based top suggestion. No AI here: the
// dashboard loads this often, and the AI ranking is one click away on the shipment.
export async function getDispatchQueue(actor: AuthenticatedUser, now = new Date()) {
  requireRole(actor, "ADMIN");
  const [rows, total] = await prisma.$transaction([
    prisma.shipment.findMany({ where: waitingWhere, select: shipmentSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: QUEUE_LIMIT }),
    prisma.shipment.count({ where: waitingWhere }),
  ]);
  const couriers = rows.length ? await loadCourierStats(now) : [];
  return {
    total,
    shipments: rows.map((row) => {
      const shipment = toDispatchShipment(row, now);
      const [top] = rulesSuggestions(shipment, rankCouriers(shipment, couriers));
      return {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        weightKg: shipment.weightKg,
        waitingHours: shipment.waitingHours,
        originHub: shipment.originHub?.name ?? null,
        destinationHub: shipment.destinationHub?.name ?? null,
        suggestion: top ?? null,
      };
    }),
  };
}
