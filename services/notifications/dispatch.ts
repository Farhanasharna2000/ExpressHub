import type { NotificationType, ShipmentEventType, ShipmentStatus } from "@prisma/client";
import { PermanentSendError, type NotificationSender } from "@/services/notifications/sender";
import { renderNotification } from "@/services/notifications/templates";

export const MAX_NOTIFICATION_ATTEMPTS = 5;
export const DISPATCH_BATCH_SIZE = 20;
// A claimed row is hidden from other dispatchers for this long. If the process dies
// mid-send, the row becomes due again once the lease runs out.
export const CLAIM_LEASE_MS = 5 * 60 * 1000;
const BASE_DELAY_MS = 60 * 1000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

const STATUS_NOTIFICATIONS: Partial<Record<ShipmentStatus, NotificationType>> = {
  PICKED_UP: "SHIPMENT_PICKED_UP",
  OUT_FOR_DELIVERY: "SHIPMENT_OUT_FOR_DELIVERY",
  DELIVERED: "SHIPMENT_DELIVERED",
  FAILED: "SHIPMENT_FAILED",
};

// Which shipment events email the customer. Courier assignment and cancellations do not.
export function notificationTypeFor(eventType: ShipmentEventType, toStatus: ShipmentStatus | null) {
  if (eventType === "CREATED") return "SHIPMENT_BOOKED" as const;
  if (eventType === "STATUS_CHANGED" && toStatus) return STATUS_NOTIFICATIONS[toStatus] ?? null;
  return null;
}

// Exponential backoff with equal jitter: 1, 2, 4, 8 minutes (capped at 6 hours),
// each randomised between half and the full delay so retries don't arrive together.
export function retryDelayMs(attempts: number, random: () => number = Math.random) {
  const delay = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
  return Math.round(delay / 2 + random() * (delay / 2));
}

export interface ClaimedNotification {
  id: string;
  type: NotificationType;
  attempts: number;
  payload: unknown;
}

export interface NotificationRecipient {
  name: string;
  email: string;
  emailNotifications: boolean;
  active: boolean;
}

export interface DispatchDeps {
  sender: NotificationSender;
  appUrl: string;
  now?: () => Date;
  random?: () => number;
  // Atomically marks up to `limit` due rows as claimed (attempts + 1, lease) and returns them.
  claim(limit: number, now: Date, leaseUntil: Date): Promise<ClaimedNotification[]>;
  loadRecipient(notificationId: string): Promise<NotificationRecipient | null>;
  markSent(id: string, now: Date): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markFailed(id: string, update: { dead: boolean; nextAttemptAt: Date; error: string }): Promise<void>;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retrying: number;
  dead: number;
}

function payloadFields(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const trackingNumber = typeof record.trackingNumber === "string" ? record.trackingNumber : null;
  const occurredAt = typeof record.occurredAt === "string" ? new Date(record.occurredAt) : null;
  return trackingNumber && occurredAt && !Number.isNaN(occurredAt.getTime()) ? { trackingNumber, occurredAt } : null;
}

export function trackingUrl(appUrl: string, trackingNumber: string) {
  return `${appUrl.replace(/\/+$/, "")}/track/${encodeURIComponent(trackingNumber)}`;
}

export async function dispatchNotifications(deps: DispatchDeps, limit = DISPATCH_BATCH_SIZE): Promise<DispatchSummary> {
  const now = deps.now?.() ?? new Date();
  const claimed = await deps.claim(limit, now, new Date(now.getTime() + CLAIM_LEASE_MS));
  const summary: DispatchSummary = { claimed: claimed.length, sent: 0, skipped: 0, retrying: 0, dead: 0 };

  for (const notification of claimed) {
    const fields = payloadFields(notification.payload);
    const recipient = await deps.loadRecipient(notification.id);
    if (!fields || !recipient || !recipient.active || !recipient.emailNotifications) {
      const reason = !fields ? "Invalid payload" : !recipient || !recipient.active ? "Recipient unavailable" : "Recipient opted out";
      await deps.markSkipped(notification.id, reason);
      summary.skipped += 1;
      continue;
    }

    const email = renderNotification(notification.type, {
      recipientName: recipient.name,
      trackingNumber: fields.trackingNumber,
      trackingUrl: trackingUrl(deps.appUrl, fields.trackingNumber),
      occurredAt: fields.occurredAt,
    });
    try {
      await deps.sender.send({ ...email, to: recipient.email, idempotencyKey: `expresshub:notification:${notification.id}` });
      await deps.markSent(notification.id, deps.now?.() ?? new Date());
      summary.sent += 1;
    } catch (error) {
      const permanent = error instanceof PermanentSendError;
      const dead = permanent || notification.attempts >= MAX_NOTIFICATION_ATTEMPTS;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await deps.markFailed(notification.id, {
        dead,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(notification.attempts, deps.random)),
        error: message,
      });
      if (dead) summary.dead += 1;
      else summary.retrying += 1;
    }
  }
  return summary;
}
