import "server-only";

import type { Prisma } from "@prisma/client";

// Called inside a shipment transaction when a delivery leaves OUT_FOR_DELIVERY. Once
// the courier has none left, their last position is deleted rather than left to go
// stale. Kept apart from courier-location.service so shipment.service can use it
// without a circular import.
export async function releaseCourierLocationIfIdle(tx: Prisma.TransactionClient, courierId: string) {
  const remaining = await tx.shipment.count({ where: { courierId, status: "OUT_FOR_DELIVERY", deletedAt: null } });
  if (remaining === 0) await tx.courierLocation.deleteMany({ where: { courierId } });
}
