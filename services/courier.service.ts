import "server-only";
import prisma from "@/lib/prisma";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { ShipmentStatus, type Prisma } from "@prisma/client";

export interface CourierStatsResult {
  total: number;
  readyPickup: number;
  inRoute: number;
  delivered: number;
  byStatus: Record<ShipmentStatus, number>;
}

export async function getCourierStats(actor: AuthenticatedUser): Promise<CourierStatsResult> {
  requireRole(actor, "COURIER", "ADMIN");
  const where: Prisma.ShipmentWhereInput = {
    deletedAt: null,
    ...(actor.role === "COURIER" ? { courierId: actor.id } : {}),
  };

  const groups = await prisma.shipment.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const byStatus: Record<ShipmentStatus, number> = {
    CREATED: 0,
    PICKED_UP: 0,
    IN_TRANSIT: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERED: 0,
    FAILED: 0,
    RETURNED: 0,
    CANCELLED: 0,
  };

  let total = 0;
  for (const group of groups) {
    byStatus[group.status] = group._count._all;
    total += group._count._all;
  }

  const readyPickup = byStatus.CREATED;
  const inRoute = byStatus.PICKED_UP + byStatus.IN_TRANSIT + byStatus.OUT_FOR_DELIVERY;
  const delivered = byStatus.DELIVERED;

  return {
    total,
    readyPickup,
    inRoute,
    delivered,
    byStatus,
  };
}
