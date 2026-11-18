import "server-only";
import type { Prisma, Shipment, ShipmentStatus } from "@prisma/client";
import { enqueueShipmentNotification } from "@/services/notifications/outbox";
import { enqueueShipmentWebhooks } from "@/services/webhooks/outbox";
import { releaseCourierLocationIfIdle } from "@/services/courier-location-release";

export type RecordedEventType = "CREATED" | "COURIER_ASSIGNED" | "STATUS_CHANGED" | "CUSTOMER_CANCELLED";

// The one place a shipment event is written. Customer emails, merchant webhooks and
// the audit row are queued in the caller's transaction, so they exist only if the
// change commits. A null actor means the change came from a system (e.g. Stripe).
export async function recordShipmentEvent(
  tx: Prisma.TransactionClient,
  actorId: string | null,
  shipment: Shipment,
  type: RecordedEventType,
  action: string,
  details: Prisma.InputJsonObject,
  fromStatus?: ShipmentStatus,
  note?: string,
) {
  const event = await tx.shipmentEvent.create({
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
  await enqueueShipmentNotification(tx, shipment, event);
  await enqueueShipmentWebhooks(tx, shipment, event, fromStatus ?? null);
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
  // A courier's live location is only kept while they still have a delivery out.
  if (fromStatus === "OUT_FOR_DELIVERY" && shipment.courierId) {
    await releaseCourierLocationIfIdle(tx, shipment.courierId);
  }
  return event;
}
