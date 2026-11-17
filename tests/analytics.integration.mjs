import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

// Real development/test PostgreSQL. Fixtures live in March 2031, a window no other data
// uses, so every figure can be asserted exactly. The cache is bypassed.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
const { default: prisma } = await import("../lib/prisma.ts");
const { getAnalytics, exportAnalyticsCsv, loadAnalyticsData } = await import("../services/analytics.service.ts");
const { analyticsQuerySchema } = await import("../validators/analytics.ts");

const tag = randomBytes(6).toString("hex");
const userIds = [];
const shipmentIds = [];
let hubId = null;
const dhaka = (local) => new Date(`${local}+06:00`);
const deps = { now: () => dhaka("2031-03-10T12:00:00"), cache: async (_key, _ttl, load) => ({ value: await load(), hit: false }), loadRaw: loadAnalyticsData };

async function user(role, name) {
  const created = await prisma.user.create({
    data: { name, email: `analytics-${role.toLowerCase()}-${tag}-${userIds.length}@example.com`, passwordHash: "x", role },
    select: { id: true, name: true, email: true, role: true },
  });
  userIds.push(created.id);
  return created;
}

async function shipment(customer, { createdAt, courierId = null, originHubId = null, status = "CREATED", deliveredAt = null, deletedAt = null, events = [], payment }) {
  const created = await prisma.shipment.create({
    data: {
      trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: customer.id, courierId, originHubId, status, deliveredAt, deletedAt, createdAt,
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Pickup",
      deliveryContactName: "Recipient", deliveryContactPhone: "01800000000", deliveryAddress: "Delivery",
      parcelWeightKg: "1.000", price: "100.00", paymentStatus: payment?.status ?? "PENDING",
    },
  });
  shipmentIds.push(created.id);
  for (const event of events) {
    await prisma.shipmentEvent.create({ data: { shipmentId: created.id, type: "STATUS_CHANGED", toStatus: event.toStatus, occurredAt: event.at } });
  }
  if (payment) {
    await prisma.payment.create({
      data: {
        shipmentId: created.id, payerId: customer.id, provider: "STRIPE", idempotencyKey: `analytics-${tag}-${randomUUID()}`,
        amount: payment.amount, status: payment.status, paidAt: payment.paidAt, refundedAt: payment.refundedAt ?? null,
      },
    });
  }
  return created;
}

try {
  const admin = await user("ADMIN", "Analytics Admin");
  const customer = await user("CUSTOMER", "Analytics Customer");
  const courierA = await user("COURIER", `Courier A ${tag}`);
  const courierB = await user("COURIER", `Courier B ${tag}`);
  const hub = await prisma.hub.create({ data: { code: `AN-${tag}`, name: `Analytics Hub ${tag}`, address: "Hub address", zoneCode: "DHK" } });
  hubId = hub.id;

  // Booked 00:30 on 3 March in Dhaka, which is still 2 March in UTC.
  await shipment(customer, {
    createdAt: dhaka("2031-03-03T00:30:00"), courierId: courierA.id, originHubId: hub.id, status: "DELIVERED",
    deliveredAt: dhaka("2031-03-04T10:00:00"), events: [{ toStatus: "PICKED_UP", at: dhaka("2031-03-03T10:00:00") }],
    payment: { amount: "150.50", status: "PAID", paidAt: dhaka("2031-03-03T01:00:00") },
  });
  // Booked 23:30 on 2 March in Dhaka: previous period. Delivered late in range; refunded in range.
  await shipment(customer, {
    createdAt: dhaka("2031-03-02T23:30:00"), courierId: courierA.id, status: "DELIVERED",
    deliveredAt: dhaka("2031-03-08T12:00:00"), events: [{ toStatus: "PICKED_UP", at: dhaka("2031-03-03T12:00:00") }],
    payment: { amount: "100.00", status: "REFUNDED", paidAt: dhaka("2031-03-02T23:40:00"), refundedAt: dhaka("2031-03-05T09:00:00") },
  });
  await shipment(customer, {
    createdAt: dhaka("2031-03-05T09:00:00"), courierId: courierB.id, originHubId: hub.id, status: "FAILED",
    events: [{ toStatus: "FAILED", at: dhaka("2031-03-06T09:00:00") }],
  });
  // Delivered with no recorded pickup: counted, but not timed.
  await shipment(customer, { createdAt: dhaka("2031-03-04T08:00:00"), courierId: courierB.id, status: "DELIVERED", deliveredAt: dhaka("2031-03-04T20:00:00") });
  await shipment(customer, { createdAt: dhaka("2031-03-09T23:59:00") });
  // Archived shipments are excluded everywhere.
  await shipment(customer, { createdAt: dhaka("2031-03-06T10:00:00"), deletedAt: dhaka("2031-03-07T10:00:00"), status: "CANCELLED" });

  const input = analyticsQuerySchema.parse({ from: "2031-03-03", to: "2031-03-09" });
  const report = await getAnalytics(admin, input, deps);

  assert.deepEqual(report.range, { from: "2031-03-03", to: "2031-03-09", days: 7, granularity: "day", timeZone: "Asia/Dhaka", previousFrom: "2031-02-24", previousTo: "2031-03-02" });
  assert.deepEqual(report.summary, {
    booked: 4, delivered: 3, failed: 1, revenue: "50.50",
    onTimeRate: 50, failureRate: 25, medianDeliveryHours: 72, p90DeliveryHours: 110.4,
  });
  assert.deepEqual(report.previous, {
    booked: 1, delivered: 0, failed: 0, revenue: "100.00",
    onTimeRate: null, failureRate: null, medianDeliveryHours: null, p90DeliveryHours: null,
  });
  assert.deepEqual(report.change, { booked: 300, delivered: null, revenue: -49.5, onTimeRate: null, failureRate: null, medianDeliveryHours: null });
  assert.deepEqual(report.series.map((row) => row.period), ["2031-03-03", "2031-03-04", "2031-03-05", "2031-03-06", "2031-03-07", "2031-03-08", "2031-03-09"]);
  assert.deepEqual(report.series.map((row) => row.booked), [1, 1, 1, 0, 0, 0, 1]);
  assert.deepEqual(report.series.map((row) => row.delivered), [0, 2, 0, 0, 0, 1, 0]);
  assert.deepEqual(report.series.map((row) => row.revenue), ["150.50", "0.00", "-100.00", "0.00", "0.00", "0.00", "0.00"]);
  assert.deepEqual(report.hubs, [{ name: hub.name, shipments: 2 }]);
  assert.deepEqual(report.couriers, [
    { id: courierA.id, name: courierA.name, deliveries: 2, failed: 0, onTimeRate: 50 },
    { id: courierB.id, name: courierB.name, deliveries: 1, failed: 1, onTimeRate: null },
  ]);
  assert.equal(report.cached, false);

  // Weekly buckets start on Monday; 3 March 2031 is a Monday, so the week holds everything.
  const weekly = await getAnalytics(admin, analyticsQuerySchema.parse({ from: "2031-03-03", to: "2031-03-09", granularity: "week" }), deps);
  assert.deepEqual(weekly.series, [{ period: "2031-03-03", booked: 4, delivered: 3, revenue: "50.50" }]);

  const csv = await exportAnalyticsCsv(admin, input, deps);
  assert.equal(csv.filename, "expresshub-analytics-2031-03-03-to-2031-03-09.csv");
  assert.equal(csv.content.split("\r\n")[0], "Period starting,Shipments booked,Shipments delivered,Net revenue (BDT)");
  assert.equal(csv.content.split("\r\n")[3], "2031-03-05,1,0,-100.00");

  await assert.rejects(getAnalytics(customer, input, deps), (error) => error.status === 403);
  await assert.rejects(getAnalytics(courierA, input, deps), (error) => error.status === 403);

  console.info("Analytics integration passed: Dhaka day boundaries, previous period, on-time and percentile delivery times, failures, net revenue with refunds, hubs, courier leaderboard, weekly buckets, CSV export, soft-delete exclusion and admin-only access.");
} finally {
  if (shipmentIds.length) {
    await prisma.payment.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.auditLog.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
  }
  if (hubId) await prisma.hub.delete({ where: { id: hubId } });
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
}
