import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Real development/test PostgreSQL with isolated fixtures. Emails go to an injected
// sender; nothing is sent to a real provider.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.BREVO_API_KEY = "";
const { default: prisma } = await import("../lib/prisma.ts");
const { updateShipmentStatus } = await import("../services/shipment.service.ts");
const { dispatchNotifications, MAX_NOTIFICATION_ATTEMPTS } = await import("../services/notifications/dispatch.ts");
const { dismissAllDeadNotifications, dismissNotification, enqueueShipmentNotification, notificationDeps, listDeadNotifications, retryNotification } = await import("../services/notifications/outbox.ts");

const tag = randomBytes(6).toString("hex");
const users = [];
const shipments = [];

async function user(role, extra = {}) {
  const created = await prisma.user.create({
    data: { name: `Notify ${role}`, email: `notify-${role.toLowerCase()}-${tag}-${users.length}@example.com`, passwordHash: "x", role, ...extra },
    select: { id: true, name: true, email: true, role: true },
  });
  users.push(created.id);
  return created;
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

const rows = (shipmentId) => prisma.notificationOutbox.findMany({ where: { shipmentId }, orderBy: { createdAt: "asc" } });

function recordingSender(sent, { fail = false, wait = 0 } = {}) {
  return {
    name: "test",
    async send(email) {
      await delay(wait);
      if (fail) throw new Error("provider down");
      sent.push(email);
    },
  };
}

// Only our fixtures: other due rows in a shared dev database are left alone.
function ownRows(deps, shipmentIds) {
  return {
    ...deps,
    async claim(limit, now, leaseUntil) {
      return prisma.$queryRaw`
        UPDATE "notification_outbox"
        SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${leaseUntil}, "updatedAt" = ${now}
        WHERE "id" IN (
          SELECT "id" FROM "notification_outbox"
          WHERE "status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now} AND "shipmentId" = ANY(${shipmentIds})
          ORDER BY "nextAttemptAt" ASC LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "type"::text AS "type", "attempts", "payload"`;
    },
  };
}

try {
  const admin = await user("ADMIN");
  const courier = await user("COURIER");
  const customer = await user("CUSTOMER");
  const optedOut = await user("CUSTOMER", { emailNotifications: false });

  // A committed status change writes exactly one outbox row in the same transaction.
  const parcel = await shipment(customer, courier);
  await updateShipmentStatus(courier, parcel.id, { status: "PICKED_UP", expectedStatus: "CREATED" });
  let outbox = await rows(parcel.id);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].type, "SHIPMENT_PICKED_UP");
  assert.equal(outbox[0].status, "PENDING");
  assert.equal(outbox[0].recipientUserId, customer.id);
  assert.equal(outbox[0].payload.trackingNumber, parcel.trackingNumber);

  // Transitions that don't notify, and customers who opted out, write nothing.
  await updateShipmentStatus(courier, parcel.id, { status: "IN_TRANSIT", expectedStatus: "PICKED_UP" });
  assert.equal((await rows(parcel.id)).length, 1);
  const quiet = await shipment(optedOut, courier);
  await updateShipmentStatus(courier, quiet.id, { status: "PICKED_UP", expectedStatus: "CREATED" });
  assert.equal((await rows(quiet.id)).length, 0);

  // A rolled-back change leaves no outbox row behind.
  const rolledBack = await shipment(customer, courier, "OUT_FOR_DELIVERY");
  await assert.rejects(prisma.$transaction(async (tx) => {
    const updated = await tx.shipment.update({ where: { id: rolledBack.id }, data: { status: "DELIVERED" } });
    const event = await tx.shipmentEvent.create({ data: { shipmentId: rolledBack.id, actorId: courier.id, type: "STATUS_CHANGED", fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" } });
    await enqueueShipmentNotification(tx, updated, event);
    assert.equal(await tx.notificationOutbox.count({ where: { shipmentId: rolledBack.id } }), 1);
    throw new Error("rollback");
  }), /rollback/);
  assert.equal((await rows(rolledBack.id)).length, 0);

  // Enqueueing the same event twice is a no-op.
  const twice = await shipment(customer, courier, "OUT_FOR_DELIVERY");
  const twiceEvent = await prisma.shipmentEvent.create({ data: { shipmentId: twice.id, actorId: courier.id, type: "STATUS_CHANGED", fromStatus: "OUT_FOR_DELIVERY", toStatus: "FAILED" } });
  await prisma.$transaction((tx) => enqueueShipmentNotification(tx, twice, twiceEvent));
  await prisma.$transaction((tx) => enqueueShipmentNotification(tx, twice, twiceEvent));
  assert.equal((await rows(twice.id)).length, 1);

  // Two dispatchers running at once never send the same row twice.
  const batch = [];
  for (let index = 0; index < 6; index++) {
    const item = await shipment(customer, courier, "OUT_FOR_DELIVERY");
    const event = await prisma.shipmentEvent.create({ data: { shipmentId: item.id, actorId: courier.id, type: "STATUS_CHANGED", fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" } });
    await prisma.$transaction((tx) => enqueueShipmentNotification(tx, item, event));
    batch.push(item.id);
  }
  const sent = [];
  const concurrentDeps = ownRows(notificationDeps({ sender: recordingSender(sent, { wait: 50 }), appUrl: "https://expresshub.example" }), batch);
  const [first, second] = await Promise.all([dispatchNotifications(concurrentDeps, 4), dispatchNotifications(concurrentDeps, 4)]);
  assert.equal(first.sent + second.sent, 6);
  assert.equal(new Set(sent.map((email) => email.idempotencyKey)).size, 6);
  assert.ok(sent.every((email) => email.to === customer.email && email.text.includes("https://expresshub.example/track/EH-")));
  const delivered = await prisma.notificationOutbox.findMany({ where: { shipmentId: { in: batch } } });
  assert.ok(delivered.every((row) => row.status === "SENT" && row.sentAt && row.attempts === 1));

  // A failed send is rescheduled, hidden until due, and becomes DEAD on the last attempt.
  const failing = ownRows(notificationDeps({ sender: recordingSender([], { fail: true }), appUrl: "https://expresshub.example" }), [parcel.id, twice.id]);
  const failed = await dispatchNotifications(failing);
  assert.equal(failed.retrying, 2);
  outbox = await rows(parcel.id);
  assert.equal(outbox[0].status, "FAILED");
  assert.equal(outbox[0].lastError, "provider down");
  assert.ok(outbox[0].nextAttemptAt > new Date());
  assert.equal((await dispatchNotifications(failing)).claimed, 0);

  await prisma.notificationOutbox.update({ where: { id: outbox[0].id }, data: { attempts: MAX_NOTIFICATION_ATTEMPTS - 1, nextAttemptAt: new Date(Date.now() - 1000) } });
  assert.equal((await dispatchNotifications(ownRows(failing, [parcel.id]))).dead, 1);
  assert.equal((await rows(parcel.id))[0].status, "DEAD");

  // Admins see DEAD rows and can queue them again; customers can't.
  const dead = await listDeadNotifications(admin, { page: 1, limit: 100 });
  assert.ok(dead.notifications.some((item) => item.id === outbox[0].id && item.shipment.trackingNumber === parcel.trackingNumber));
  await assert.rejects(listDeadNotifications(customer, { page: 1, limit: 10 }), (error) => error.status === 403);
  const retried = await retryNotification(admin, outbox[0].id);
  assert.equal(retried.attempts, 0);
  const afterRetry = (await rows(parcel.id))[0];
  assert.equal(afterRetry.status, "PENDING");
  await assert.rejects(retryNotification(admin, outbox[0].id), (error) => error.status === 409);
  assert.equal(await prisma.auditLog.count({ where: { action: "NOTIFICATION_RETRIED", shipmentId: parcel.id } }), 1);

  // Opting out after the row was queued skips it at send time.
  await prisma.user.update({ where: { id: customer.id }, data: { emailNotifications: false } });
  const skipped = await dispatchNotifications(ownRows(notificationDeps({ sender: recordingSender([]), appUrl: "https://expresshub.example" }), [parcel.id]));
  assert.equal(skipped.skipped, 1);
  assert.equal((await rows(parcel.id))[0].status, "SKIPPED");

  // Admins can dismiss a DEAD email instead of retrying it; it is never sent afterwards.
  await prisma.user.update({ where: { id: customer.id }, data: { emailNotifications: true } });
  await prisma.notificationOutbox.update({ where: { id: outbox[0].id }, data: { status: "DEAD", nextAttemptAt: new Date(Date.now() - 1000) } });
  await assert.rejects(dismissNotification(customer, outbox[0].id), (error) => error.status === 403);
  const dismissed = await dismissNotification(admin, outbox[0].id);
  assert.equal(dismissed.id, outbox[0].id);
  assert.equal((await rows(parcel.id))[0].status, "DISMISSED");
  await assert.rejects(dismissNotification(admin, outbox[0].id), (error) => error.status === 409);
  await assert.rejects(retryNotification(admin, outbox[0].id), (error) => error.status === 409);
  assert.equal((await dispatchNotifications(ownRows(notificationDeps({ sender: recordingSender([]), appUrl: "https://expresshub.example" }), [parcel.id]))).claimed, 0);
  assert.equal(await prisma.auditLog.count({ where: { action: "NOTIFICATION_DISMISSED", shipmentId: parcel.id } }), 1);
  assert.equal((await listDeadNotifications(admin, { page: 1, limit: 100 })).notifications.some((item) => item.id === outbox[0].id), false);

  // Dismiss all touches every DEAD row in the database, so it only runs when this suite's
  // rows are the only DEAD ones (as on CI's fresh database), never on someone's real data.
  await prisma.notificationOutbox.update({ where: { id: outbox[0].id }, data: { status: "DEAD" } });
  const foreignDead = await prisma.notificationOutbox.count({ where: { status: "DEAD", shipmentId: { notIn: shipments } } });
  if (foreignDead === 0) {
    const all = await dismissAllDeadNotifications(admin);
    assert.ok(all.dismissed >= 1);
    assert.equal(await prisma.notificationOutbox.count({ where: { status: "DEAD" } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { action: "NOTIFICATIONS_DISMISSED", actorId: admin.id } }), 1);
  } else {
    console.info(`Skipped dismiss-all check: ${foreignDead} other DEAD notifications exist in this database.`);
  }

  console.info("Notification integration passed: transactional enqueue, rollback, opt-out, idempotency, SKIP LOCKED concurrency, backoff, DEAD after max attempts, admin retry and dismissal.");
} finally {
  if (shipments.length) {
    await prisma.notificationOutbox.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.auditLog.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: shipments } } });
    await prisma.shipment.deleteMany({ where: { id: { in: shipments } } });
  }
  if (users.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.$disconnect();
}
