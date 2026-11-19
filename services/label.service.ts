import "server-only";
import type { Prisma } from "@prisma/client";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import { renderShippingLabel, shippingLabelData } from "@/lib/labels/shipping-label";
import prisma from "@/lib/prisma";
import { appUrl } from "@/services/notifications/outbox";

const missing = () => new AppError(404, "Shipment not found", "SHIPMENT_NOT_FOUND");

// Same visibility as shipment details: the owning customer, the assigned courier, any admin.
// Everyone else gets 404, so other people's shipments cannot be confirmed to exist.
function visibleTo(actor: AuthenticatedUser): Prisma.ShipmentWhereInput {
  return {
    deletedAt: null,
    ...(actor.role === "CUSTOMER" ? { customerId: actor.id } : actor.role === "COURIER" ? { courierId: actor.id } : {}),
  };
}

export async function getShippingLabel(actor: AuthenticatedUser, shipmentId: string) {
  const shipment = await prisma.shipment.findFirst({
    where: { ...visibleTo(actor), id: shipmentId },
    select: {
      trackingNumber: true,
      status: true,
      pickupContactName: true,
      pickupContactPhone: true,
      pickupAddress: true,
      deliveryContactName: true,
      deliveryContactPhone: true,
      deliveryAddress: true,
      parcelWeightKg: true,
      createdAt: true,
      originHub: { select: { name: true } },
      destinationHub: { select: { name: true } },
    },
  });
  if (!shipment) throw missing();
  if (shipment.status === "CANCELLED") {
    throw new AppError(409, "Cancelled shipments have no shipping label", "LABEL_UNAVAILABLE");
  }
  const pdf = await renderShippingLabel(shippingLabelData(shipment, appUrl()));
  return { trackingNumber: shipment.trackingNumber, pdf };
}

// A courier's scan resolves only to their own deliveries; anything else is 404.
export async function findCourierShipmentByTracking(actor: AuthenticatedUser, trackingNumber: string) {
  requireRole(actor, "COURIER");
  const shipment = await prisma.shipment.findFirst({
    where: { courierId: actor.id, deletedAt: null, trackingNumber },
    select: { id: true, trackingNumber: true, status: true },
  });
  if (!shipment) throw missing();
  return shipment;
}
