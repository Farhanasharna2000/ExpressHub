import "server-only";
import { after } from "next/server";
import type { Prisma, Shipment, ShipmentEvent } from "@prisma/client";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { paginateTransaction } from "@/lib/db/pagination";
import { AppError } from "@/lib/http/errors";
import prisma from "@/lib/prisma";
import {
  dispatchNotifications,
  notificationTypeFor,
  type ClaimedNotification,
  type DispatchDeps,
} from "@/services/notifications/dispatch";
import { configuredSender } from "@/services/notifications/sender";
import type { ListDeadNotificationsInput } from "@/validators/notification";

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

function cleanUrl(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// The site address put in emails and label QR codes, which open on customers' phones.
// On Vercel a localhost or private-network value can never be used (a copied local .env
// would otherwise print QR codes that open the phone itself); Vercel's production domain
// is the fallback there. Locally the configured value is used as is.
export function appUrl(env: Record<string, string | undefined> = process.env) {
  const onVercel = Boolean(env.VERCEL);
  const candidates = [env.APP_URL, onVercel ? env.VERCEL_PROJECT_PRODUCTION_URL : undefined, env.ALLOWED_ORIGIN];
  for (const candidate of candidates) {
    const url = cleanUrl(candidate);
    if (url && !(onVercel && LOCAL_HOST.test(url.hostname))) return url.origin;
  }
  return "http://localhost:3000";
}

// Called inside the transaction that wrote the event, so the email exists only if
// the shipment change commits. The unique key makes a repeated call a no-op.
export async function enqueueShipmentNotification(
  tx: Prisma.TransactionClient,
  shipment: Pick<Shipment, "id" | "customerId" | "trackingNumber">,
  event: Pick<ShipmentEvent, "id" | "type" | "toStatus" | "occurredAt">,
) {
  const type = notificationTypeFor(event.type, event.toStatus);
  if (!type) return;
  const customer = await tx.user.findUnique({
    where: { id: shipment.customerId },
    select: { emailNotifications: true },
  });
  if (!customer?.emailNotifications) return;
  await tx.notificationOutbox.createMany({
    data: [{
      type,
      shipmentId: shipment.id,
      eventId: event.id,
      recipientUserId: shipment.customerId,
      payload: { trackingNumber: shipment.trackingNumber, status: event.toStatus, occurredAt: event.occurredAt.toISOString() },
    }],
    skipDuplicates: true,
  });
}

// One statement claims due rows: SKIP LOCKED lets concurrent dispatchers take
// different rows, and moving nextAttemptAt to the lease hides them until it ends.
async function claim(limit: number, now: Date, leaseUntil: Date) {
  return prisma.$queryRaw<ClaimedNotification[]>`
    UPDATE "notification_outbox"
    SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${leaseUntil}, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "notification_outbox"
      WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now}
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type"::text AS "type", "attempts", "payload"`;
}

export function notificationDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    sender: configuredSender(),
    appUrl: appUrl(),
    claim,
    async loadRecipient(id) {
      const row = await prisma.notificationOutbox.findUnique({
        where: { id },
        select: { recipient: { select: { name: true, email: true, emailNotifications: true, isActive: true, deletedAt: true } } },
      });
      if (!row) return null;
      const { recipient } = row;
      return { name: recipient.name, email: recipient.email, emailNotifications: recipient.emailNotifications, active: recipient.isActive && !recipient.deletedAt };
    },
    async markSent(id, now) {
      await prisma.notificationOutbox.update({ where: { id }, data: { status: "SENT", sentAt: now, lastError: null } });
    },
    async markSkipped(id, reason) {
      await prisma.notificationOutbox.update({ where: { id }, data: { status: "SKIPPED", lastError: reason } });
    },
    async markFailed(id, { dead, nextAttemptAt, error }) {
      await prisma.notificationOutbox.update({
        where: { id },
        data: { status: dead ? "DEAD" : "FAILED", nextAttemptAt, lastError: error },
      });
    },
    ...overrides,
  };
}

export function dispatchPendingNotifications(limit?: number) {
  return dispatchNotifications(notificationDeps(), limit);
}

// Sends right after the response is finished so the request isn't slowed down.
// Rows that fail here are retried by the scheduled sweeper.
export function scheduleNotificationDispatch() {
  try {
    after(async () => {
      try {
        await dispatchPendingNotifications();
      } catch (error) {
        console.error("Notification dispatch failed", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Outside a request (scripts, direct route calls in tests) there is nothing to
    // run after; the rows stay PENDING for the sweeper.
  }
}

const deadSelect = {
  id: true,
  type: true,
  attempts: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  shipment: { select: { id: true, trackingNumber: true } },
  recipient: { select: { id: true, name: true, email: true } },
} satisfies Prisma.NotificationOutboxSelect;

async function requireAdmin(actor: AuthenticatedUser) {
  const current = await prisma.user.findFirst({
    where: { id: actor.id, isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!current) throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
  requireRole(current, "ADMIN");
  return current;
}

export async function listDeadNotifications(actor: AuthenticatedUser, input: ListDeadNotificationsInput) {
  await requireAdmin(actor);
  const where = { status: "DEAD" } satisfies Prisma.NotificationOutboxWhereInput;
  const result = await paginateTransaction(
    ({ skip, take }) => [
      prisma.notificationOutbox.findMany({ where, select: deadSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }),
      prisma.notificationOutbox.count({ where }),
    ],
    input,
  );
  return { notifications: result.items, pagination: result.pagination };
}

// Removes a DEAD email from the admin list without sending it. DISMISSED rows are never
// claimed by the dispatcher, and the audit log keeps who dismissed what.
export async function dismissNotification(actor: AuthenticatedUser, id: string) {
  const admin = await requireAdmin(actor);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.notificationOutbox.updateMany({ where: { id, status: "DEAD" }, data: { status: "DISMISSED" } });
    if (updated.count !== 1) {
      const exists = await tx.notificationOutbox.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new AppError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
      throw new AppError(409, "Only failed notifications can be dismissed", "NOTIFICATION_CONFLICT");
    }
    const notification = await tx.notificationOutbox.findUniqueOrThrow({ where: { id }, select: deadSelect });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        entityType: "SHIPMENT",
        entityId: notification.shipment.id,
        shipmentId: notification.shipment.id,
        action: "NOTIFICATION_DISMISSED",
        details: { notificationId: id, type: notification.type },
      },
    });
    return notification;
  });
}

export async function dismissAllDeadNotifications(actor: AuthenticatedUser) {
  const admin = await requireAdmin(actor);
  return prisma.$transaction(async (tx) => {
    const dead = await tx.notificationOutbox.findMany({ where: { status: "DEAD" }, select: { id: true } });
    if (dead.length === 0) return { dismissed: 0 };
    const ids = dead.map((row) => row.id);
    const updated = await tx.notificationOutbox.updateMany({ where: { id: { in: ids }, status: "DEAD" }, data: { status: "DISMISSED" } });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        entityType: "USER",
        entityId: admin.id,
        action: "NOTIFICATIONS_DISMISSED",
        details: { count: updated.count, notificationIds: ids.slice(0, 200) },
      },
    });
    return { dismissed: updated.count };
  });
}

export async function retryNotification(actor: AuthenticatedUser, id: string) {
  const admin = await requireAdmin(actor);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.notificationOutbox.updateMany({
      where: { id, status: "DEAD" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    if (updated.count !== 1) {
      const exists = await tx.notificationOutbox.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new AppError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
      throw new AppError(409, "Only failed notifications can be retried", "NOTIFICATION_CONFLICT");
    }
    const notification = await tx.notificationOutbox.findUniqueOrThrow({ where: { id }, select: deadSelect });
    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        entityType: "SHIPMENT",
        entityId: notification.shipment.id,
        shipmentId: notification.shipment.id,
        action: "NOTIFICATION_RETRIED",
        details: { notificationId: id, type: notification.type },
      },
    });
    return notification;
  });
}
