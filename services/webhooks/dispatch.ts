import { EVENT_ID_HEADER, EVENT_TYPE_HEADER, SIGNATURE_HEADER, signatureHeader } from "@/lib/merchant/webhook-signature";
import { UnsafeUrlError } from "@/lib/net/safe-url";
import { CLAIM_LEASE_MS, retryDelayMs } from "@/services/notifications/dispatch";

export const MAX_WEBHOOK_ATTEMPTS = 8;
export const WEBHOOK_BATCH_SIZE = 20;
export { CLAIM_LEASE_MS };

export interface ClaimedDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  attempts: number;
  payload: unknown;
}

export interface DeliveryEndpoint {
  url: string;
  active: boolean;
  secret: string;
}

export interface WebhookDispatchDeps {
  now?: () => Date;
  random?: () => number;
  claim(limit: number, now: Date, leaseUntil: Date): Promise<ClaimedDelivery[]>;
  // null when the endpoint was removed or its secret cannot be decrypted.
  loadEndpoint(endpointId: string): Promise<DeliveryEndpoint | null>;
  post(url: string, body: string, headers: Record<string, string>): Promise<{ status: number }>;
  markSent(id: string, update: { now: Date; statusCode: number }): Promise<void>;
  markFailed(id: string, update: { dead: boolean; nextAttemptAt: Date; error: string; statusCode: number | null }): Promise<void>;
}

export interface WebhookDispatchSummary {
  claimed: number;
  sent: number;
  retrying: number;
  dead: number;
}

const clip = (message: string) => message.replace(/\s+/g, " ").slice(0, 300);

export async function dispatchWebhooks(deps: WebhookDispatchDeps, limit = WEBHOOK_BATCH_SIZE): Promise<WebhookDispatchSummary> {
  const now = deps.now?.() ?? new Date();
  const claimed = await deps.claim(limit, now, new Date(now.getTime() + CLAIM_LEASE_MS));
  const summary: WebhookDispatchSummary = { claimed: claimed.length, sent: 0, retrying: 0, dead: 0 };

  for (const delivery of claimed) {
    const fail = async (error: string, statusCode: number | null, permanent = false) => {
      const dead = permanent || delivery.attempts >= MAX_WEBHOOK_ATTEMPTS;
      const nextAttemptAt = dead ? now : new Date(now.getTime() + retryDelayMs(delivery.attempts, deps.random));
      await deps.markFailed(delivery.id, { dead, nextAttemptAt, error: clip(error), statusCode });
      if (dead) summary.dead += 1;
      else summary.retrying += 1;
    };

    const endpoint = await deps.loadEndpoint(delivery.endpointId);
    if (!endpoint || !endpoint.active) {
      await fail("Endpoint is disabled or removed", null, true);
      continue;
    }

    // The body is signed exactly as sent; receivers verify against the raw bytes.
    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(now.getTime() / 1000);
    const headers = {
      "content-type": "application/json",
      "user-agent": "ExpressHub-Webhooks/1.0",
      [SIGNATURE_HEADER]: signatureHeader(endpoint.secret, timestamp, body),
      [EVENT_ID_HEADER]: delivery.eventId,
      [EVENT_TYPE_HEADER]: delivery.eventType,
    };

    try {
      const { status } = await deps.post(endpoint.url, body, headers);
      if (status >= 200 && status < 300) {
        await deps.markSent(delivery.id, { now, statusCode: status });
        summary.sent += 1;
      } else {
        // 410 Gone means the receiver has retired this endpoint for good.
        await fail(status >= 300 && status < 400 ? `Redirects are not followed (HTTP ${status})` : `HTTP ${status}`, status, status === 410);
      }
    } catch (error) {
      // An address that became private (for example DNS rebinding) never gets retried.
      const permanent = error instanceof UnsafeUrlError;
      await fail(error instanceof Error ? error.message : "Delivery failed", null, permanent);
    }
  }
  return summary;
}
