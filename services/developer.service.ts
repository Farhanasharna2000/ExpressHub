import "server-only";
import type { Prisma } from "@prisma/client";
import { requireRole, requireSession, type AuthenticatedUser } from "@/lib/auth/require-user";
import { paginateTransaction } from "@/lib/db/pagination";
import { AppError } from "@/lib/http/errors";
import { generateApiKey, MAX_ACTIVE_API_KEYS } from "@/lib/merchant/api-keys";
import { MAX_WEBHOOK_ENDPOINTS } from "@/lib/merchant/scopes";
import { encryptSecret, webhookEncryptionKey } from "@/lib/merchant/secret-box";
import { generateSigningSecret } from "@/lib/merchant/webhook-signature";
import { parseWebhookUrl, resolvePublicAddress, UnsafeUrlError, type Resolver } from "@/lib/net/safe-url";
import prisma from "@/lib/prisma";
import { TEST_EVENT_TYPE, webhookEnvelope } from "@/services/webhooks/events";
import type { CreateApiKeyInput, CreateWebhookInput, ListDeliveriesInput, UpdateWebhookInput } from "@/validators/developer";

const DAY_MS = 24 * 60 * 60 * 1000;

const apiKeySelect = {
  id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
} satisfies Prisma.ApiKeySelect;

const endpointSelect = {
  id: true, url: true, description: true, events: true, active: true, createdAt: true, updatedAt: true,
} satisfies Prisma.WebhookEndpointSelect;

const deliverySelect = {
  id: true, eventId: true, eventType: true, shipmentId: true, status: true, attempts: true,
  nextAttemptAt: true, lastStatusCode: true, lastError: true, deliveredAt: true, createdAt: true,
} satisfies Prisma.WebhookDeliverySelect;

function requireCustomer(actor: AuthenticatedUser) {
  return requireRole(actor, "CUSTOMER");
}

async function audit(
  db: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  action: string,
  details: Prisma.InputJsonObject,
) {
  await db.auditLog.create({
    data: { actorId: actor.id, entityType: "USER", entityId: actor.id, action, details: { ...details, via: actor.via ?? "session" } },
  });
}

// ---- API keys: managed only from a signed-in session, never with a key ----

export async function listApiKeys(actor: AuthenticatedUser) {
  requireCustomer(requireSession(actor));
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: actor.id },
    select: apiKeySelect,
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 50,
  });
  return { apiKeys };
}

export async function createApiKey(actor: AuthenticatedUser, input: CreateApiKeyInput) {
  requireCustomer(requireSession(actor));
  const now = new Date();
  const { key, prefix, hash } = generateApiKey();
  const apiKey = await prisma.$transaction(async (tx) => {
    const active = await tx.apiKey.count({
      where: { userId: actor.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
    if (active >= MAX_ACTIVE_API_KEYS) {
      throw new AppError(409, `You can have up to ${MAX_ACTIVE_API_KEYS} active API keys. Revoke one first.`, "API_KEY_LIMIT");
    }
    const created = await tx.apiKey.create({
      data: {
        userId: actor.id,
        name: input.name,
        prefix,
        keyHash: hash,
        scopes: input.scopes,
        expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * DAY_MS) : null,
      },
      select: apiKeySelect,
    });
    await audit(tx, actor, "API_KEY_CREATED", { apiKeyId: created.id, prefix, scopes: input.scopes });
    return created;
  }, { isolationLevel: "Serializable" });
  // The full key is returned once and never stored or logged.
  return { apiKey, key };
}

export async function revokeApiKey(actor: AuthenticatedUser, id: string) {
  requireCustomer(requireSession(actor));
  return prisma.$transaction(async (tx) => {
    const existing = await tx.apiKey.findFirst({ where: { id, userId: actor.id }, select: { id: true, prefix: true, revokedAt: true } });
    if (!existing) throw new AppError(404, "API key not found", "API_KEY_NOT_FOUND");
    if (existing.revokedAt) return tx.apiKey.findUniqueOrThrow({ where: { id }, select: apiKeySelect });
    const apiKey = await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() }, select: apiKeySelect });
    await audit(tx, actor, "API_KEY_REVOKED", { apiKeyId: id, prefix: existing.prefix });
    return apiKey;
  });
}

// ---- Webhook endpoints: session or an API key with webhooks:manage ----

function requireEncryptionKey() {
  const key = webhookEncryptionKey();
  if (!key) throw new AppError(503, "Webhooks are not configured on this server", "WEBHOOKS_UNAVAILABLE");
  return key;
}

async function vetUrl(raw: string, resolve?: Resolver) {
  try {
    const url = parseWebhookUrl(raw);
    await resolvePublicAddress(url, resolve);
    return url.toString();
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw new AppError(400, error.message, "WEBHOOK_URL_INVALID", [{ path: "url", message: error.message }]);
    }
    throw error;
  }
}

async function ownEndpoint(db: Prisma.TransactionClient, actor: AuthenticatedUser, id: string) {
  const endpoint = await db.webhookEndpoint.findFirst({ where: { id, userId: actor.id }, select: { id: true } });
  if (!endpoint) throw new AppError(404, "Webhook endpoint not found", "WEBHOOK_NOT_FOUND");
  return endpoint;
}

export async function listWebhooks(actor: AuthenticatedUser) {
  requireCustomer(actor);
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: actor.id },
    select: endpointSelect,
    orderBy: { createdAt: "desc" },
  });
  return { endpoints, available: webhookEncryptionKey() !== null };
}

export async function createWebhook(actor: AuthenticatedUser, input: CreateWebhookInput, resolve?: Resolver) {
  requireCustomer(actor);
  const key = requireEncryptionKey();
  const url = await vetUrl(input.url, resolve);
  const secret = generateSigningSecret();
  const endpoint = await prisma.$transaction(async (tx) => {
    const count = await tx.webhookEndpoint.count({ where: { userId: actor.id } });
    if (count >= MAX_WEBHOOK_ENDPOINTS) {
      throw new AppError(409, `You can have up to ${MAX_WEBHOOK_ENDPOINTS} webhook endpoints.`, "WEBHOOK_LIMIT");
    }
    const created = await tx.webhookEndpoint.create({
      data: { userId: actor.id, url, description: input.description || null, events: input.events, encryptedSecret: encryptSecret(secret, key) },
      select: endpointSelect,
    });
    await audit(tx, actor, "WEBHOOK_ENDPOINT_CREATED", { endpointId: created.id, host: new URL(url).host, events: input.events });
    return created;
  }, { isolationLevel: "Serializable" });
  // The signing secret is returned once; afterwards it can only be rotated.
  return { endpoint, secret };
}

export async function updateWebhook(actor: AuthenticatedUser, id: string, input: UpdateWebhookInput, resolve?: Resolver) {
  requireCustomer(actor);
  const url = input.url !== undefined ? await vetUrl(input.url, resolve) : undefined;
  return prisma.$transaction(async (tx) => {
    await ownEndpoint(tx, actor, id);
    const endpoint = await tx.webhookEndpoint.update({
      where: { id },
      data: {
        ...(url !== undefined ? { url } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.events ? { events: input.events } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      select: endpointSelect,
    });
    await audit(tx, actor, "WEBHOOK_ENDPOINT_UPDATED", { endpointId: id, fields: Object.keys(input) });
    return endpoint;
  });
}

export async function deleteWebhook(actor: AuthenticatedUser, id: string) {
  requireCustomer(actor);
  await prisma.$transaction(async (tx) => {
    await ownEndpoint(tx, actor, id);
    await tx.webhookEndpoint.delete({ where: { id } });
    await audit(tx, actor, "WEBHOOK_ENDPOINT_DELETED", { endpointId: id });
  });
}

export async function rotateWebhookSecret(actor: AuthenticatedUser, id: string) {
  requireCustomer(actor);
  const key = requireEncryptionKey();
  const secret = generateSigningSecret();
  const endpoint = await prisma.$transaction(async (tx) => {
    await ownEndpoint(tx, actor, id);
    const updated = await tx.webhookEndpoint.update({ where: { id }, data: { encryptedSecret: encryptSecret(secret, key) }, select: endpointSelect });
    await audit(tx, actor, "WEBHOOK_SECRET_ROTATED", { endpointId: id });
    return updated;
  });
  return { endpoint, secret };
}

export async function sendTestEvent(actor: AuthenticatedUser, id: string) {
  requireCustomer(actor);
  requireEncryptionKey();
  await ownEndpoint(prisma, actor, id);
  const now = new Date();
  const eventId = `evt_test_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId: id,
      eventId,
      eventType: TEST_EVENT_TYPE,
      payload: webhookEnvelope(eventId, TEST_EVENT_TYPE, now, { message: "This is a test event from ExpressHub." }) as Prisma.InputJsonValue,
    },
    select: deliverySelect,
  });
  return { delivery };
}

export async function listDeliveries(actor: AuthenticatedUser, id: string, input: ListDeliveriesInput) {
  requireCustomer(actor);
  await ownEndpoint(prisma, actor, id);
  const where = { endpointId: id, ...(input.status ? { status: input.status } : {}) } satisfies Prisma.WebhookDeliveryWhereInput;
  const result = await paginateTransaction(
    ({ skip, take }) => [
      prisma.webhookDelivery.findMany({ where, select: deliverySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
      prisma.webhookDelivery.count({ where }),
    ],
    input,
  );
  return { deliveries: result.items, pagination: result.pagination };
}

export async function retryDelivery(actor: AuthenticatedUser, endpointId: string, deliveryId: string) {
  requireCustomer(actor);
  return prisma.$transaction(async (tx) => {
    await ownEndpoint(tx, actor, endpointId);
    const updated = await tx.webhookDelivery.updateMany({
      where: { id: deliveryId, endpointId, status: "DEAD" },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    if (updated.count !== 1) {
      const exists = await tx.webhookDelivery.findFirst({ where: { id: deliveryId, endpointId }, select: { id: true } });
      if (!exists) throw new AppError(404, "Delivery not found", "WEBHOOK_DELIVERY_NOT_FOUND");
      throw new AppError(409, "Only deliveries that failed every retry can be retried", "WEBHOOK_DELIVERY_CONFLICT");
    }
    return { delivery: await tx.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, select: deliverySelect }) };
  });
}
