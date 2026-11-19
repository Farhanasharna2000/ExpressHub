import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

// Real development/test PostgreSQL. The dev database may hold other couriers, so ranking
// assertions compare only this test's couriers, plus one that must lead overall.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.BREVO_API_KEY = "";
const { default: prisma } = await import("../lib/prisma.ts");
const { getDispatchQueue, loadDispatchContext } = await import("../services/dispatch.service.ts");
const { rankCouriers } = await import("../lib/dispatch/scoring.ts");
const { runConfiguredDispatch } = await import("../services/ai/assistant-deps.ts");
const { assignCourier } = await import("../services/shipment.service.ts");

const tag = randomBytes(6).toString("hex");
const userIds = [];
const shipmentIds = [];
let hubId = null;
const rulesOnly = { enabled: false, provider: "gemini", model: "unused" };

async function user(role, name) {
  const created = await prisma.user.create({
    data: { name, email: `dispatch-${role.toLowerCase()}-${tag}-${userIds.length}@example.com`, passwordHash: "x", role },
    select: { id: true, name: true, email: true, role: true },
  });
  userIds.push(created.id);
  return created;
}

async function shipment(customer, { courierId = null, status = "CREATED", paymentStatus = "PAID", originHubId = null, createdAt, deliveredAt = null, deletedAt = null } = {}) {
  const created = await prisma.shipment.create({
    data: {
      trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: customer.id, courierId, status, paymentStatus, originHubId, deliveredAt, deletedAt,
      ...(createdAt ? { createdAt } : {}),
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Pickup",
      deliveryContactName: "Recipient", deliveryContactPhone: "01800000000", deliveryAddress: "Delivery",
      parcelWeightKg: "2.500", price: "150.00",
    },
  });
  shipmentIds.push(created.id);
  return created;
}

try {
  const admin = await user("ADMIN", "Dispatch Admin");
  const customer = await user("CUSTOMER", "Dispatch Customer");
  const near = await user("COURIER", "Near Courier");
  const busy = await user("COURIER", "Busy Courier");
  const idle = await user("COURIER", "Idle Courier");
  const hub = await prisma.hub.create({ data: { code: `DSP-${tag}`, name: `Dispatch Hub ${tag}`, address: "1 Test Road", zoneCode: `Z${tag}` } });
  hubId = hub.id;

  // Near: free, recently worked this hub, two deliveries. Busy: same hub but four open
  // shipments. Idle: free with no history. Expected order: near, busy, idle.
  await shipment(customer, { courierId: near.id, status: "DELIVERED", originHubId: hub.id, deliveredAt: new Date() });
  await shipment(customer, { courierId: near.id, status: "DELIVERED", originHubId: hub.id, deliveredAt: new Date() });
  for (const status of ["CREATED", "CREATED", "PICKED_UP", "IN_TRANSIT"]) await shipment(customer, { courierId: busy.id, status, originHubId: hub.id });

  // Backdated so it is the oldest waiting shipment and always on the dashboard queue.
  const target = await shipment(customer, { originHubId: hub.id, createdAt: new Date("2020-01-01T00:00:00Z") });

  const context = await loadDispatchContext(admin, target.id);
  assert.equal(context.shipment.originHub.id, hub.id);
  const ranked = rankCouriers(context.shipment, context.couriers);
  const ours = ranked.filter((candidate) => [near.id, busy.id, idle.id].includes(candidate.courierId));
  assert.deepEqual(ours.map((candidate) => candidate.courierId), [near.id, busy.id, idle.id]);
  assert.equal(ranked[0].courierId, near.id, "a free courier who works the origin hub leads overall");
  const busyFactors = ours[1].factors;
  assert.equal(busyFactors.openShipments, 4);
  assert.equal(busyFactors.hubMatch, "origin");
  assert.equal(ours[0].factors.recentDeliveries, 2);

  // With AI off the endpoint's service returns the rule-based top three.
  const result = await runConfiguredDispatch(admin, target.id, rulesOnly);
  assert.equal(result.source, "rules");
  assert.equal(result.notice, "AI_DISABLED");
  assert.equal(result.suggestions[0].courierId, near.id);
  assert.match(result.suggestions[0].reason, /works the Dispatch Hub/);
  assert.ok(result.suggestions.length <= 3);

  const queue = await getDispatchQueue(admin);
  const queued = queue.shipments.find((item) => item.id === target.id);
  assert.ok(queued, "the oldest waiting shipment is on the dashboard queue");
  assert.equal(queued.suggestion.courierId, near.id);
  assert.ok(queue.total >= 1);

  // Only paid, unassigned, assignable shipments can be dispatched.
  const unpaid = await shipment(customer, { paymentStatus: "PENDING" });
  const moving = await shipment(customer, { status: "IN_TRANSIT", courierId: busy.id });
  const archived = await shipment(customer, { deletedAt: new Date() });
  await assert.rejects(loadDispatchContext(admin, unpaid.id), (error) => error.status === 409);
  await assert.rejects(loadDispatchContext(admin, moving.id), (error) => error.status === 409);
  await assert.rejects(loadDispatchContext(admin, archived.id), (error) => error.status === 404);
  await assert.rejects(loadDispatchContext(customer, target.id), (error) => error.status === 403);

  // Admins assign a suggestion through the existing assign service; then it is no longer waiting.
  await assignCourier(admin, target.id, { courierId: near.id, expectedCourierId: null });
  assert.equal((await prisma.shipment.findUniqueOrThrow({ where: { id: target.id } })).courierId, near.id);
  await assert.rejects(loadDispatchContext(admin, target.id), (error) => error.status === 409);
  assert.equal((await getDispatchQueue(admin)).shipments.some((item) => item.id === target.id), false);

  console.info("Dispatch integration passed: workload, hub match and delivery record ranking, rules fallback, dashboard queue, eligibility (409/404/403) and assignment through the existing endpoint.");
} finally {
  if (shipmentIds.length) {
    await prisma.payment.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.auditLog.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
  }
  if (hubId) await prisma.hub.deleteMany({ where: { id: hubId } });
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
}
