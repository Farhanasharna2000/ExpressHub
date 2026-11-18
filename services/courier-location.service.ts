import "server-only";

import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { LOCATION_STALE_MS, isFreshLocation, publicCourierLocation, type PublicCourierLocation } from "@/lib/courier-location";
import { AppError } from "@/lib/http/errors";
import prisma from "@/lib/prisma";
import { getShipment } from "@/services/shipment.service";
import type { CourierLocationInput } from "@/validators/courier-location";

const outForDelivery = (courierId: string) => ({ courierId, status: "OUT_FOR_DELIVERY" as const, deletedAt: null });

// Sharing is only allowed while the courier has a delivery out; otherwise any stored
// position is removed and the app is told to stop.
export async function updateCourierLocation(actor: AuthenticatedUser, input: CourierLocationInput, now = new Date()) {
  requireRole(actor, "COURIER");
  const active = await prisma.shipment.count({ where: outForDelivery(actor.id) });
  if (active === 0) {
    await prisma.courierLocation.deleteMany({ where: { courierId: actor.id } });
    throw new AppError(409, "Location sharing is only available while a delivery is out", "LOCATION_SHARING_NOT_ALLOWED");
  }
  const data = {
    latitude: input.lat,
    longitude: input.lng,
    accuracy: input.accuracy,
    heading: input.heading ?? null,
    speed: input.speed ?? null,
    updatedAt: now,
  };
  await prisma.courierLocation.upsert({ where: { courierId: actor.id }, create: { courierId: actor.id, ...data }, update: data });
  return { activeDeliveries: active, updatedAt: now.toISOString() };
}

export async function stopCourierLocation(actor: AuthenticatedUser) {
  requireRole(actor, "COURIER");
  await prisma.courierLocation.deleteMany({ where: { courierId: actor.id } });
}

export type ShipmentCourierLocation =
  | (PublicCourierLocation & { exact: false })
  | { lat: number; lng: number; accuracy: number; updatedAt: string; exact: true };

// The map on a shipment's detail page. getShipment applies the usual ownership rules.
// Admins and the assigned courier get the exact position; the customer gets the same
// rounded position as the public tracking page.
export async function getShipmentCourierLocation(actor: AuthenticatedUser, shipmentId: string, now = Date.now()): Promise<ShipmentCourierLocation | null> {
  const shipment = await getShipment(actor, shipmentId);
  if (shipment.status !== "OUT_FOR_DELIVERY" || !shipment.courierId) return null;
  const location = await prisma.courierLocation.findUnique({ where: { courierId: shipment.courierId } });
  if (!location) return null;
  if (actor.role === "ADMIN" || actor.role === "COURIER") {
    if (!isFreshLocation(location.updatedAt, now)) return null;
    return { lat: location.latitude, lng: location.longitude, accuracy: location.accuracy, updatedAt: location.updatedAt.toISOString(), exact: true };
  }
  const rounded = publicCourierLocation({ status: shipment.status, hasCourier: true }, location, now);
  return rounded ? { ...rounded, exact: false } : null;
}

// Every courier with a fresh position, with the deliveries they have out, for the
// admin live map.
export async function listLiveCouriers(actor: AuthenticatedUser, now = new Date()) {
  requireRole(actor, "ADMIN");
  const rows = await prisma.courierLocation.findMany({
    where: { updatedAt: { gte: new Date(now.getTime() - LOCATION_STALE_MS) }, courier: { isActive: true, deletedAt: null } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      latitude: true, longitude: true, accuracy: true, updatedAt: true,
      courier: {
        select: {
          id: true, name: true,
          courierShipments: {
            where: { status: "OUT_FOR_DELIVERY", deletedAt: null },
            orderBy: { updatedAt: "asc" },
            take: 20,
            select: { id: true, trackingNumber: true },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    courierId: row.courier.id,
    name: row.courier.name,
    lat: row.latitude,
    lng: row.longitude,
    accuracy: row.accuracy,
    updatedAt: row.updatedAt.toISOString(),
    shipments: row.courier.courierShipments,
  }));
}
