import type { ShipmentEventType, ShipmentStatus } from "@prisma/client";
import type { WebhookEventType } from "@/validators/developer";

export const TEST_EVENT_TYPE = "webhook.test";

// Which webhook events a shipment event produces. A delivery sends both
// shipment.status_changed and shipment.delivered so receivers can listen to either.
export function webhookEventsFor(eventType: ShipmentEventType, toStatus: ShipmentStatus | null): WebhookEventType[] {
  if (eventType === "CREATED") return ["shipment.created"];
  if ((eventType === "STATUS_CHANGED" || eventType === "CUSTOMER_CANCELLED") && toStatus) {
    return toStatus === "DELIVERED" ? ["shipment.status_changed", "shipment.delivered"] : ["shipment.status_changed"];
  }
  return [];
}

// Stable across retries and endpoints, so receivers can drop duplicates.
export function webhookEventId(shipmentEventId: string, type: string) {
  return `evt_${shipmentEventId}_${type.replace(/^shipment\./, "").replaceAll(".", "_")}`;
}

export type WebhookShipment = {
  id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  paymentStatus: string;
  price: { toString(): string };
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
};

// Only fields the merchant already sees for its own shipment: no contact names,
// phones, addresses, notes or courier identity.
export function shipmentWebhookData(shipment: WebhookShipment, previousStatus: ShipmentStatus | null) {
  return {
    shipment: {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      previousStatus,
      paymentStatus: shipment.paymentStatus,
      price: shipment.price.toString(),
      currency: shipment.currency,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
      deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    },
  };
}

export function webhookEnvelope(id: string, type: string, createdAt: Date, data: unknown) {
  return { id, type, createdAt: createdAt.toISOString(), data };
}
