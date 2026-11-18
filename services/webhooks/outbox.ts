import "server-only";
import { after } from "next/server";
import type { Prisma, Shipment, ShipmentEvent, ShipmentStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { decryptSecret, webhookEncryptionKey } from "@/lib/merchant/secret-box";
import { safePost } from "@/lib/net/safe-url";
import { dispatchWebhooks, type ClaimedDelivery, type WebhookDispatchDeps } from "@/services/webhooks/dispatch";
import { shipmentWebhookData, webhookEnvelope, webhookEventId, webhookEventsFor } from "@/services/webhooks/events";

// Called inside the transaction that wrote the shipment event, so a delivery exists
// only if the change commits. The unique (endpoint, event id) key makes repeats no-ops.
export async function enqueueShipmentWebhooks(
  tx: Prisma.TransactionClient,
  shipment: Shipment,
  event: Pick<ShipmentEvent, "id" | "type" | "toStatus" | "occurredAt">,
  previousStatus: ShipmentStatus | null = null,
) {
  const types = webhookEventsFor(event.type, event.toStatus);
  if (!types.length) return;
  const endpoints = await tx.webhookEndpoint.findMany({
    where: { userId: shipment.customerId, active: true, events: { hasSome: types } },
    select: { id: true, events: true },
  });
  if (!endpoints.length) return;
  const data = shipmentWebhookData(shipment, previousStatus);
  const rows = endpoints.flatMap((endpoint) => types
    .filter((type) => endpoint.events.includes(type))
    .map((type) => {
      const eventId = webhookEventId(event.id, type);
      return {
        endpointId: endpoint.id,
        eventId,
        eventType: type,
        shipmentId: shipment.id,
        payload: webhookEnvelope(eventId, type, event.occurredAt, data) as Prisma.InputJsonValue,
      };
    }));
  await tx.webhookDelivery.createMany({ data: rows, skipDuplicates: true });
}

// Same claim pattern as the email outbox: SKIP LOCKED gives concurrent dispatchers
// different rows, and the lease hides claimed rows until it runs out.
async function claim(limit: number, now: Date, leaseUntil: Date) {
  return prisma.$queryRaw<ClaimedDelivery[]>`
    UPDATE "webhook_deliveries"
    SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${leaseUntil}, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "webhook_deliveries"
      WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now}
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "endpointId", "eventId", "eventType", "attempts", "payload"`;
}

export function webhookDeps(overrides: Partial<WebhookDispatchDeps> = {}): WebhookDispatchDeps {
  return {
    claim,
    async loadEndpoint(endpointId) {
      const key = webhookEncryptionKey();
      const endpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: endpointId },
        select: { url: true, active: true, encryptedSecret: true, user: { select: { isActive: true, deletedAt: true } } },
      });
      if (!endpoint || !key) return null;
      try {
        return {
          url: endpoint.url,
          active: endpoint.active && endpoint.user.isActive && !endpoint.user.deletedAt,
          secret: decryptSecret(endpoint.encryptedSecret, key),
        };
      } catch {
        console.error("Webhook secret could not be decrypted", { endpointId });
        return null;
      }
    },
    post: (url, body, headers) => safePost(url, body, headers),
    async markSent(id, { now, statusCode }) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: "SENT", deliveredAt: now, lastStatusCode: statusCode, lastError: null },
      });
    },
    async markFailed(id, { dead, nextAttemptAt, error, statusCode }) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: dead ? "DEAD" : "FAILED", nextAttemptAt, lastError: error, lastStatusCode: statusCode },
      });
    },
    ...overrides,
  };
}

export function dispatchPendingWebhooks(limit?: number) {
  return dispatchWebhooks(webhookDeps(), limit);
}

// Sends right after the response is finished. Failures are retried by the sweeper.
export function scheduleWebhookDispatch() {
  try {
    after(async () => {
      try {
        await dispatchPendingWebhooks();
      } catch (error) {
        console.error("Webhook dispatch failed", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Outside a request there is nothing to run after; rows wait for the sweeper.
  }
}
