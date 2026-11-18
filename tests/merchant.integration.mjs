import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Real PostgreSQL with isolated fixtures. Webhook HTTP calls go to an injected poster
// and DNS to an injected resolver, so nothing leaves the machine.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";
process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { default: prisma } = await import("../lib/prisma.ts");
const { requireUser } = await import("../lib/auth/require-user.ts");
const { verifyWebhookSignature } = await import("../lib/merchant/webhook-signature.ts");
const { decryptSecret, webhookEncryptionKey } = await import("../lib/merchant/secret-box.ts");
const developer = await import("../services/developer.service.ts");
const { updateShipmentStatus } = await import("../services/shipment.service.ts");
const { initiateRefund, processStripeEvent } = await import("../services/payment.service.ts");
const { recordShipmentEvent } = await import("../services/shipment-events.ts");
const { enqueueShipmentWebhooks, webhookDeps } = await import("../services/webhooks/outbox.ts");
const { dispatchWebhooks, MAX_WEBHOOK_ATTEMPTS } = await import("../services/webhooks/dispatch.ts");

const tag = randomBytes(6).toString("hex");
const users = [];
const shipments = [];
const stripeEventIds = [];
const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];
const privateDns = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.1.2.3", family: 4 }];

async function user(role, extra = {}) {
  const created = await prisma.user.create({
    data: { name: `Merchant ${role}`, email: `merchant-${role.toLowerCase()}-${tag}-${users.length}@example.com`, passwordHash: "x", role, ...extra },
    select: { id: true, name: true, email: true, role: true },
  });
  users.push(created.id);
  return { ...created, via: "session" };
}

async function shipment(customer, courier, status = "CREATED") {
  const created = await prisma.shipment.create({
    data: {
      trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: customer.id, courierId: courier.id, status, paymentStatus: "PAID",
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Pickup address",
      deliveryContactName: "Recipient", deliveryContactPhone: "01800000000", deliveryAddress: "Delivery address",
      parcelWeightKg: "1.000", price: "100.00",
    },
  });
  shipments.push(created.id);
  return created;
}

const asKey = (key, method, path) => requireUser(new Request(`http://localhost:3000${path}`, { method, headers: { authorization: `Bearer ${key}` } }));
const rejectsWith = (promise, status, code) => assert.rejects(promise, (error) => error.status === status && error.code === code);

// Only our fixtures: other due deliveries in a shared dev database are left alone.
function ownDeliveries(deps, endpointIds) {
  return {
    ...deps,
    async claim(limit, now, leaseUntil) {
      return prisma.$queryRaw`
        UPDATE "webhook_deliveries"
        SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${leaseUntil}, "updatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "webhook_deliveries"
          WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now} AND "endpointId" = ANY(${endpointIds})
          ORDER BY "nextAttemptAt" ASC LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "endpointId", "eventId", "eventType", "attempts", "payload"`;
    },
  };
}

try {
  const customer = await user("CUSTOMER");
  const other = await user("CUSTOMER");
  const courier = await user("COURIER");

  // Keys are created from a session, shown once and stored only as a hash.
  const { apiKey, key } = await developer.createApiKey(customer, { name: "Integration", scopes: ["shipments:read", "webhooks:manage"], expiresInDays: null });
  const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } });
  assert.notEqual(stored.keyHash, key);
  assert.equal(JSON.stringify(stored).includes(key), false);
  assert.equal(JSON.stringify((await developer.listApiKeys(customer)).apiKeys).includes(key), false);
  assert.equal((await prisma.auditLog.findFirst({ where: { actorId: customer.id, action: "API_KEY_CREATED" } })).details.apiKeyId, apiKey.id);

  // Allowed route and scope: acts as the customer, records last use.
  const actor = await asKey(key, "GET", "/api/v1/shipments");
  assert.equal(actor.id, customer.id);
  assert.equal(actor.role, "CUSTOMER");
  assert.equal(actor.via, "api_key");
  assert.ok((await prisma.apiKey.findUniqueOrThrow({ where: { id: apiKey.id } })).lastUsedAt);

  // Routes off the allowlist, missing scopes and key management are refused.
  for (const [method, path] of [["POST", "/api/v1/payments/initiate"], ["GET", "/api/v1/users/me"], ["POST", "/api/v1/ai/assistant"],
    ["GET", "/api/v1/admin/dashboard-stats"], ["GET", "/api/v1/developer/api-keys"], ["POST", "/api/v1/auth/refresh-token"]]) {
    await rejectsWith(asKey(key, method, path), 403, "API_KEY_NOT_ALLOWED");
  }
  await rejectsWith(asKey(key, "POST", "/api/v1/shipments"), 403, "API_KEY_SCOPE_MISSING");
  await rejectsWith(developer.createApiKey(actor, { name: "Escalate", scopes: ["shipments:write"], expiresInDays: null }), 403, "API_KEY_NOT_ALLOWED");
  await rejectsWith(developer.listApiKeys(actor), 403, "API_KEY_NOT_ALLOWED");
  await rejectsWith(asKey(`${key.slice(0, -2)}xx`, "GET", "/api/v1/shipments"), 401, "INVALID_API_KEY");
  await rejectsWith(asKey("eh_live_nothere1_" + "a".repeat(43), "GET", "/api/v1/shipments"), 401, "INVALID_API_KEY");
  await rejectsWith(developer.createApiKey(courier, { name: "Courier", scopes: ["shipments:read"], expiresInDays: null }), 403, "FORBIDDEN");

  // Expired keys, inactive owners and owners who are no longer customers are rejected.
  const expiring = await developer.createApiKey(customer, { name: "Expiring", scopes: ["shipments:read"], expiresInDays: 30 });
  await prisma.apiKey.update({ where: { id: expiring.apiKey.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await rejectsWith(asKey(expiring.key, "GET", "/api/v1/shipments"), 401, "INVALID_API_KEY");
  const ownerKey = await developer.createApiKey(other, { name: "Owner", scopes: ["shipments:read"], expiresInDays: null });
  await prisma.user.update({ where: { id: other.id }, data: { role: "ADMIN" } });
  await rejectsWith(asKey(ownerKey.key, "GET", "/api/v1/shipments"), 401, "INVALID_API_KEY");
  await prisma.user.update({ where: { id: other.id }, data: { role: "CUSTOMER", isActive: false } });
  await rejectsWith(asKey(ownerKey.key, "GET", "/api/v1/shipments"), 401, "INVALID_API_KEY");

  // At most ten active keys; revoked keys stop working immediately and are audited.
  // One key is active already and the expired key does not count: nine more reach the limit.
  for (let index = 0; index < 9; index++) await developer.createApiKey(customer, { name: `Bulk ${index}`, scopes: ["shipments:read"], expiresInDays: null });
  await rejectsWith(developer.createApiKey(customer, { name: "Eleventh", scopes: ["shipments:read"], expiresInDays: null }), 409, "API_KEY_LIMIT");
  await developer.revokeApiKey(customer, apiKey.id);
  await rejectsWith(asKey(key, "GET", "/api/v1/shipments"), 401, "INVALID_API_KEY");
  await rejectsWith(developer.revokeApiKey(other, apiKey.id), 404, "API_KEY_NOT_FOUND");
  assert.ok(await prisma.auditLog.findFirst({ where: { actorId: customer.id, action: "API_KEY_REVOKED" } }));

  // Endpoints: https and public addresses only, secret encrypted at rest and shown once.
  await rejectsWith(developer.createWebhook(customer, { url: "https://hooks.example.com/x", events: ["shipment.created"] }, privateDns), 400, "WEBHOOK_URL_INVALID");
  await rejectsWith(developer.createWebhook(customer, { url: "https://127.0.0.1/x", events: ["shipment.created"] }, publicDns), 400, "WEBHOOK_URL_INVALID");
  await rejectsWith(developer.createWebhook(customer, { url: "http://hooks.example.com/x", events: ["shipment.created"] }, publicDns), 400, "WEBHOOK_URL_INVALID");
  const { endpoint, secret } = await developer.createWebhook(customer, {
    url: "https://hooks.example.com/expresshub", events: ["shipment.status_changed", "shipment.delivered"],
  }, publicDns);
  const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
  assert.equal(row.encryptedSecret.includes(secret), false);
  assert.equal(decryptSecret(row.encryptedSecret, webhookEncryptionKey()), secret);
  assert.equal(JSON.stringify(await developer.listWebhooks(customer)).includes(secret), false);
  await rejectsWith(developer.updateWebhook(other, endpoint.id, { active: false }), 404, "WEBHOOK_NOT_FOUND");
  await rejectsWith(developer.updateWebhook(customer, endpoint.id, { url: "https://hooks.example.com/y" }, privateDns), 400, "WEBHOOK_URL_INVALID");

  // A committed status change writes a delivery for each subscribed event, in the same transaction.
  const parcel = await shipment(customer, courier);
  await updateShipmentStatus(courier, parcel.id, { status: "PICKED_UP", expectedStatus: "CREATED" });
  let deliveries = await prisma.webhookDelivery.findMany({ where: { endpointId: endpoint.id, shipmentId: parcel.id } });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].eventType, "shipment.status_changed");
  assert.equal(deliveries[0].payload.data.shipment.status, "PICKED_UP");
  assert.equal(deliveries[0].payload.data.shipment.previousStatus, "CREATED");
  assert.equal(JSON.stringify(deliveries[0].payload).includes("01800000000"), false);

  // Shipments of customers without endpoints, and unsubscribed events, write nothing.
  const quiet = await shipment(other, courier);
  await updateShipmentStatus(courier, quiet.id, { status: "PICKED_UP", expectedStatus: "CREATED" });
  assert.equal(await prisma.webhookDelivery.count({ where: { shipmentId: quiet.id } }), 0);

  // A rolled-back change leaves no delivery; a delivery event fans out to both events once.
  const rolledBack = await shipment(customer, courier, "OUT_FOR_DELIVERY");
  await assert.rejects(prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({ where: { id: rolledBack.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    const event = await tx.shipmentEvent.create({ data: { shipmentId: rolledBack.id, actorId: courier.id, type: "STATUS_CHANGED", fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" } });
    await enqueueShipmentWebhooks(tx, updated, event, "OUT_FOR_DELIVERY");
    assert.equal(await tx.webhookDelivery.count({ where: { shipmentId: rolledBack.id } }), 2);
    throw new Error("rollback");
  }), /rollback/);
  assert.equal(await prisma.webhookDelivery.count({ where: { shipmentId: rolledBack.id } }), 0);
  const delivered = await shipment(customer, courier, "DELIVERED");
  const deliveredEvent = await prisma.shipmentEvent.create({ data: { shipmentId: delivered.id, actorId: courier.id, type: "STATUS_CHANGED", fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" } });
  await prisma.$transaction((tx) => enqueueShipmentWebhooks(tx, delivered, deliveredEvent, "OUT_FOR_DELIVERY"));
  await prisma.$transaction((tx) => enqueueShipmentWebhooks(tx, delivered, deliveredEvent, "OUT_FOR_DELIVERY"));
  deliveries = await prisma.webhookDelivery.findMany({ where: { shipmentId: delivered.id }, orderBy: { eventType: "asc" } });
  assert.deepEqual(deliveries.map((delivery) => delivery.eventType), ["shipment.delivered", "shipment.status_changed"]);

  // Two dispatchers at once post each delivery exactly once, signed with the endpoint secret.
  for (let index = 0; index < 4; index++) {
    const item = await shipment(customer, courier, "PICKED_UP");
    const event = await prisma.shipmentEvent.create({ data: { shipmentId: item.id, actorId: courier.id, type: "STATUS_CHANGED", fromStatus: "PICKED_UP", toStatus: "IN_TRANSIT" } });
    await prisma.$transaction((tx) => enqueueShipmentWebhooks(tx, item, event, "PICKED_UP"));
  }
  const posted = [];
  const poster = async (url, body, headers) => { await delay(40); posted.push({ url, body, headers }); return { status: 204 }; };
  const deps = ownDeliveries(webhookDeps({ post: poster }), [endpoint.id]);
  const due = await prisma.webhookDelivery.count({ where: { endpointId: endpoint.id, status: "PENDING" } });
  const [first, second] = await Promise.all([dispatchWebhooks(deps, 4), dispatchWebhooks(deps, 4)]);
  const third = await dispatchWebhooks(deps, 20);
  assert.equal(first.sent + second.sent + third.sent, due);
  assert.equal(new Set(posted.map((post) => post.headers["ExpressHub-Event-Id"])).size, due);
  for (const post of posted) {
    assert.equal(post.url, "https://hooks.example.com/expresshub");
    assert.equal(verifyWebhookSignature(secret, post.headers["ExpressHub-Signature"], post.body), true);
  }
  assert.equal(await prisma.webhookDelivery.count({ where: { endpointId: endpoint.id, status: "SENT" } }), due);

  // Failing deliveries retry and become dead after the last attempt; dead ones can be retried.
  const { delivery: test } = await developer.sendTestEvent(customer, endpoint.id);
  assert.equal(test.eventType, "webhook.test");
  await prisma.webhookDelivery.update({ where: { id: test.id }, data: { attempts: MAX_WEBHOOK_ATTEMPTS - 1 } });
  const failing = ownDeliveries(webhookDeps({ post: async () => ({ status: 503 }) }), [endpoint.id]);
  assert.equal((await dispatchWebhooks(failing)).dead, 1);
  const dead = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: test.id } });
  assert.equal(dead.status, "DEAD");
  assert.equal(dead.lastStatusCode, 503);
  const page = await developer.listDeliveries(customer, endpoint.id, { page: 1, limit: 10, status: "DEAD" });
  assert.deepEqual(page.deliveries.map((delivery) => delivery.id), [test.id]);
  await rejectsWith(developer.retryDelivery(other, test.id), 404, "WEBHOOK_DELIVERY_NOT_FOUND");
  const retried = await developer.retryDelivery(customer, test.id);
  assert.equal(retried.delivery.status, "PENDING");
  await rejectsWith(developer.retryDelivery(customer, test.id), 409, "WEBHOOK_DELIVERY_CONFLICT");

  // Rotation changes the signing secret; deleting an endpoint removes its deliveries.
  const rotated = await developer.rotateWebhookSecret(customer, endpoint.id);
  assert.notEqual(rotated.secret, secret);
  assert.ok(await prisma.auditLog.findFirst({ where: { actorId: customer.id, action: "WEBHOOK_SECRET_ROTATED" } }));
  await developer.deleteWebhook(customer, endpoint.id);
  assert.equal(await prisma.webhookDelivery.count({ where: { endpointId: endpoint.id } }), 0);

  // A key with webhooks:manage manages endpoints; without the server key, endpoints are unavailable.
  // Revoking the first key freed a slot under the ten-key limit.
  const manager = await developer.createApiKey(customer, { name: "Hooks", scopes: ["webhooks:manage"], expiresInDays: null });
  const keyActor = await asKey(manager.key, "POST", "/api/v1/developer/webhooks");
  const viaKey = await developer.createWebhook(keyActor, { url: "https://hooks.example.com/key", events: ["shipment.created"] }, publicDns);
  assert.equal(viaKey.endpoint.url, "https://hooks.example.com/key");
  const saved = process.env.WEBHOOK_ENCRYPTION_KEY;
  process.env.WEBHOOK_ENCRYPTION_KEY = "";
  await rejectsWith(developer.createWebhook(customer, { url: "https://hooks.example.com/z", events: ["shipment.created"] }, publicDns), 503, "WEBHOOKS_UNAVAILABLE");
  process.env.WEBHOOK_ENCRYPTION_KEY = saved;

  // Refund-driven cancellations go through the same hook: one status_changed delivery each.
  const refundHook = await developer.createWebhook(customer, { url: "https://hooks.example.com/refunds", events: ["shipment.status_changed"] }, publicDns);
  const fakeStripe = new Map();
  const stripe = {
    async retrieve(id) { return structuredClone(fakeStripe.get(id).session); },
    async intent(id) { return structuredClone([...fakeStripe.values()].find((entry) => entry.intent.id === id).intent); },
    async refunds(id) { return structuredClone([...fakeStripe.values()].find((entry) => entry.intent.id === id).refunds); },
    async createRefund(params) {
      const entry = [...fakeStripe.values()].find((item) => item.intent.id === params.payment_intent);
      const refund = { id: `re_${randomUUID()}`, payment_intent: params.payment_intent, amount: 10000, currency: "bdt", status: "succeeded" };
      entry.refunds.push(refund);
      return structuredClone(refund);
    },
  };
  async function paidBooking() {
    const booking = await shipment(customer, courier);
    await prisma.shipment.update({ where: { id: booking.id }, data: { courierId: null } });
    const sessionId = `cs_test_${randomUUID()}`;
    const intentId = `pi_${randomUUID()}`;
    const payment = await prisma.payment.create({
      data: {
        shipmentId: booking.id, payerId: customer.id, provider: "STRIPE", idempotencyKey: `merchant-${randomUUID()}`,
        amount: "100.00", currency: "BDT", status: "PAID", paidAt: new Date(), providerReference: sessionId, providerIntentId: intentId,
      },
    });
    const metadata = { paymentId: payment.id, shipmentId: booking.id, payerId: customer.id };
    fakeStripe.set(sessionId, {
      session: { id: sessionId, mode: "payment", livemode: false, client_reference_id: payment.id, metadata, amount_total: 10000,
        currency: "bdt", status: "complete", payment_status: "paid", payment_intent: intentId },
      intent: { id: intentId, status: "succeeded", amount: 10000, amount_received: 10000, currency: "bdt", metadata, livemode: false },
      refunds: [],
    });
    return { booking, payment, intentId };
  }
  const refundDeliveries = (shipmentId) => prisma.webhookDelivery.findMany({ where: { endpointId: refundHook.endpoint.id, shipmentId } });

  const customerRefund = await paidBooking();
  await initiateRefund(customer, customerRefund.payment.id, "Changed my mind", stripe);
  let refundRows = await refundDeliveries(customerRefund.booking.id);
  assert.equal(refundRows.length, 1);
  assert.equal(refundRows[0].eventType, "shipment.status_changed");
  assert.equal(refundRows[0].payload.data.shipment.status, "CANCELLED");
  assert.equal(refundRows[0].payload.data.shipment.previousStatus, "CREATED");

  const stripeRefund = await paidBooking();
  fakeStripe.get(stripeRefund.payment.providerReference).refunds.push({ id: `re_${randomUUID()}`, payment_intent: stripeRefund.intentId, amount: 10000, currency: "bdt", status: "succeeded" });
  const refundEvent = { id: `evt_${randomUUID()}`, type: "charge.refunded", livemode: false, data: { object: { payment_intent: stripeRefund.intentId } } };
  stripeEventIds.push(refundEvent.id);
  await processStripeEvent(refundEvent, randomBytes(16).toString("hex"), stripe);
  assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: stripeRefund.booking.id } })).status, "CANCELLED");
  refundRows = await refundDeliveries(stripeRefund.booking.id);
  assert.equal(refundRows.length, 1);
  assert.equal(refundRows[0].payload.data.shipment.status, "CANCELLED");

  // If the cancellation's transaction rolls back, the hook leaves no delivery behind.
  const rolledBackRefund = await shipment(customer, courier);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const cancelled = await tx.shipment.update({ where: { id: rolledBackRefund.id }, data: { status: "CANCELLED" } });
    await recordShipmentEvent(tx, null, cancelled, "STATUS_CHANGED", "SHIPMENT_STATUS_UPDATED", { reason: "Payment refunded" }, "CREATED", "Refund settled in Stripe");
    assert.equal(await tx.webhookDelivery.count({ where: { shipmentId: rolledBackRefund.id } }), 1);
    throw new Error("rollback");
  }), /rollback/);
  assert.equal(await prisma.webhookDelivery.count({ where: { shipmentId: rolledBackRefund.id } }), 0);

  console.info("Merchant integration passed: key hashing, allowlist and scopes, revocation and expiry, owner checks, key limit, URL vetting, encrypted secrets, transactional enqueue and rollback, fan-out, refund-driven cancellations, concurrent signed dispatch, dead letters, retry, rotation and deletion.");
} finally {
  if (stripeEventIds.length) await prisma.paymentWebhookEvent.deleteMany({ where: { providerEventId: { in: stripeEventIds } } });
  if (shipments.length) {
    await prisma.webhookDelivery.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.payment.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.notificationOutbox.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.auditLog.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.shipment.deleteMany({ where: { id: { in: shipments } } });
  }
  if (users.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.$disconnect();
}
