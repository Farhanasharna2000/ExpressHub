import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server.js";
import { Prisma, ShipmentStatus } from "@prisma/client";

// Development/test database only. Fixtures are unique and removed in finally.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
const { default: prisma } = await import("../lib/prisma.ts");
const { signAccessToken } = await import("../lib/auth/tokens.ts");
const { getOperationsFacts } = await import("../services/admin.service.ts");
const { bangladeshDay } = await import("../services/ai/ops-brief.service.ts");
const routes = {
  "dashboard-stats": await import("../app/api/v1/admin/dashboard-stats/route.ts"),
  users: await import("../app/api/v1/users/route.ts"),
  shipments: await import("../app/api/v1/admin/shipments/route.ts"),
  "audit-logs": await import("../app/api/v1/admin/audit-logs/route.ts"),
  role: await import("../app/api/v1/admin/users/[id]/role/route.ts"),
};
const userIds = [], shipmentIds = [], auditIds = [];
const marker = `admin-test-${randomUUID()}`;
const token = (actor) => signAccessToken({ userId: actor.id, role: actor.role });
async function call(path, actor, body, id) {
  const route = path.split("?")[0];
  const request = new NextRequest(`http://localhost/api/v1/admin/${path}`, {
    method: body ? "PATCH" : "GET",
    headers: { "content-type": "application/json", ...(actor ? { authorization: `Bearer ${token(actor)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = body ? await routes[route].PATCH(request, { params: Promise.resolve({ id }) }) : await routes[route].GET(request);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { status: response.status, ...(await response.json()) };
}
async function user(role, extra = {}) {
  const value = await prisma.user.create({ data: { name: marker, email: `${randomUUID()}@example.com`, passwordHash: "test-only-not-a-password", role, ...extra } });
  userIds.push(value.id);
  return value;
}
const amount = (stats, currency, status) => new Prisma.Decimal(stats.payments.amounts.find((row) => row.currency === currency && row.status === status)?.amount ?? 0);
try {
  const admin = await user("ADMIN");
  const baseline = (await call("dashboard-stats", admin)).data;
  const customer = await user("CUSTOMER"), courier = await user("COURIER");
  const inactive = await user("CUSTOMER", { isActive: false });
  const deleted = await user("CUSTOMER", { deletedAt: new Date() });
  for (const status of [...Object.values(ShipmentStatus), "CREATED"]) {
    const value = await prisma.shipment.create({ data: { customerId: customer.id, status, trackingNumber: `${marker}-${shipmentIds.length}`,
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Test pickup",
      deliveryContactName: "Recipient", deliveryContactPhone: "01800000000", deliveryAddress: "Test delivery",
      parcelWeightKg: 1, price: "10.29", currency: "BDT",
      ...(shipmentIds.length === 8 ? { deletedAt: new Date() } : {}) } });
    shipmentIds.push(value.id);
  }
  const statuses = ["PENDING", "PAID", "FAILED", "REFUND_PENDING", "REFUNDED", "PAID"];
  for (const [index, status] of statuses.entries()) {
    await prisma.payment.create({ data: { shipmentId: index === 5 ? shipmentIds[8] : shipmentIds[index], payerId: customer.id,
      provider: "STRIPE", idempotencyKey: randomUUID(), amount: index === 5 ? "0.11" : "10.29", currency: index === 4 ? "USD" : "BDT", status } });
  }
  const statsResponse = await call("dashboard-stats", admin);
  assert.equal(statsResponse.status, 200);
  const stats = statsResponse.data;
  assert.equal(stats.users.total - baseline.users.total, 3);
  assert.equal(stats.users.active - baseline.users.active, 2);
  assert.equal(stats.users.inactive - baseline.users.inactive, 1);
  assert.equal(stats.users.byRole.CUSTOMER - baseline.users.byRole.CUSTOMER, 2);
  assert.equal(stats.shipments.total - baseline.shipments.total, 8);
  assert.equal(stats.shipments.active - baseline.shipments.active, 5); // FAILED still needs action.
  for (const status of Object.values(ShipmentStatus)) assert.equal(stats.shipments.byStatus[status] - baseline.shipments.byStatus[status], 1);
  assert.equal(stats.payments.total - baseline.payments.total, 6);
  assert.equal(amount(stats, "BDT", "PAID").minus(amount(baseline, "BDT", "PAID")).toFixed(2), "10.40");
  assert.equal(amount(stats, "USD", "REFUNDED").minus(amount(baseline, "USD", "REFUNDED")).toFixed(2), "10.29");
  for (const status of new Set(statuses)) assert.equal(stats.payments.byStatus[status] - baseline.payments.byStatus[status], status === "PAID" ? 2 : 1);

  for (const path of Object.keys(routes)) {
    const body = path === "role" ? { role: "COURIER" } : undefined;
    assert.equal((await call(path, null, body, customer.id)).status, 401);
    for (const actor of [customer, courier]) assert.equal((await call(path, actor, body, customer.id)).status, 403);
    for (const actor of [inactive, deleted]) assert.equal((await call(path, actor, body, customer.id)).status, 401);
  }
  assert.equal((await call("dashboard-stats?from=2026-01-01", admin)).status, 400);
  const listedUsers = await call(`users?q=${marker}&limit=100`, admin);
  assert.equal(listedUsers.data.pagination.total, 4);
  assert.equal(listedUsers.data.users.some((row) => row.id === deleted.id), false);
  assert.equal(listedUsers.data.users.some((row) => "passwordHash" in row || "refreshTokens" in row), false);
  assert.equal((await call(`users?q=${marker}&isActive=false`, admin)).data.pagination.total, 1);
  const shipments = await call(`shipments?q=${marker}&limit=100`, admin);
  assert.equal(shipments.data.pagination.total, 8);
  assert.equal((await call(`shipments?q=${marker}&status=FAILED`, admin)).data.pagination.total, 1);
  assert.equal((await call("shipments?sortBy=customerId", admin)).status, 400);

  const session = await prisma.refreshToken.create({ data: { userId: customer.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
  assert.equal((await call("role", admin, { role: "COURIER", isActive: false }, customer.id)).status, 400);
  assert.equal((await call("role", admin, { role: "OWNER" }, customer.id)).status, 400);
  assert.equal((await call("role", admin, { role: "COURIER" }, "invalid")).status, 400);
  assert.equal((await call("role", admin, { role: "CUSTOMER" }, admin.id)).status, 409);
  assert.equal((await call("role", admin, { role: "COURIER" }, deleted.id)).status, 404);
  const changed = await call("role", admin, { role: "COURIER" }, customer.id);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.role, "COURIER");
  assert.ok((await prisma.refreshToken.findUnique({ where: { id: session.id } })).revokedAt);
  assert.equal((await call("role", admin, { role: "COURIER" }, customer.id)).status, 200);
  const roleAudit = await call(`audit-logs?entityType=USER&entityId=${customer.id}&actorId=${admin.id}&action=USER_ROLE_UPDATED`, admin);
  assert.equal(roleAudit.data.pagination.total, 1);
  assert.equal(roleAudit.data.auditLogs[0].details.before.role, "CUSTOMER");
  assert.equal(roleAudit.data.auditLogs[0].details.after.role, "COURIER");

  // Tied timestamps still paginate stably; system actors and deleted entities remain visible.
  const at = new Date("2026-01-02T03:04:05Z");
  const payment = await prisma.payment.findFirst({ where: { shipmentId: shipmentIds[8] } });
  for (let index = 0; index < 3; index++) {
    const row = await prisma.auditLog.create({ data: { entityType: "PAYMENT", entityId: payment.id, paymentId: payment.id,
      shipmentId: shipmentIds[8], actorId: null, action: marker, details: { before: "PENDING", after: "PAID" }, createdAt: at } });
    auditIds.push(row.id);
  }
  const auditQuery = `audit-logs?action=${marker}&paymentId=${payment.id}&shipmentId=${shipmentIds[8]}&from=${at.toISOString()}&to=${at.toISOString()}&limit=1`;
  const pages = [];
  for (const page of [1, 2, 3]) {
    const result = await call(`${auditQuery}&page=${page}`, admin);
    assert.equal(result.status, 200);
    assert.equal(result.data.pagination.total, 3);
    assert.equal(result.data.auditLogs[0].actorId, null);
    pages.push(result.data.auditLogs[0].id);
  }
  assert.deepEqual(pages, [...auditIds].sort());
  for (const query of ["page=0", "limit=101", "entityType=OTHER", "actorId=bad", "sortBy=details", "order=bad", "page=1&page=2", "unknown=true", "from=bad", "from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z"]) {
    assert.equal((await call(`audit-logs?${query}`, admin)).status, 400, query);
  }
  assert.equal((await call(`audit-logs?actorId=${deleted.id}`, admin)).data.pagination.total, 0);

  // Operations brief figures: each case moves exactly the counts it should.
  const factsAt = () => { const now = new Date(); return getOperationsFacts(admin, now, bangladeshDay(now), 48); };
  const before = await factsAt();
  const longAgo = new Date("2000-01-01T00:00:00Z");
  async function briefShipment(key, data, events = []) {
    const value = await prisma.shipment.create({ data: { customerId: customer.id, trackingNumber: `${marker}-brief-${key}`,
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Test pickup",
      deliveryContactName: "Recipient", deliveryContactPhone: "01800000000", deliveryAddress: "Test delivery",
      parcelWeightKg: 1, price: "10.00", currency: "BDT", ...data } });
    shipmentIds.push(value.id);
    for (const event of events) await prisma.shipmentEvent.create({ data: { shipmentId: value.id, type: "STATUS_CHANGED", ...event } });
    return value;
  }
  const stalled = await briefShipment("stalled", { status: "IN_TRANSIT" }, [{ toStatus: "IN_TRANSIT", occurredAt: longAgo }]);
  await briefShipment("moving", { status: "IN_TRANSIT" }, [{ toStatus: "IN_TRANSIT", occurredAt: new Date() }]);
  await briefShipment("stalled-deleted", { status: "IN_TRANSIT", deletedAt: new Date() }, [{ toStatus: "IN_TRANSIT", occurredAt: longAgo }]);
  await briefShipment("failed-today", { status: "FAILED" }, [{ toStatus: "FAILED", occurredAt: new Date() }]);
  await briefShipment("failed-earlier", { status: "FAILED" }, [{ toStatus: "FAILED", occurredAt: longAgo }]);
  await briefShipment("delivered-today", { status: "DELIVERED", deliveredAt: new Date() });
  await briefShipment("paid-unassigned", { status: "CREATED", paymentStatus: "PAID" });
  await briefShipment("paid-cancelled", { status: "CANCELLED", paymentStatus: "PAID" });
  await briefShipment("paid-assigned", { status: "CREATED", paymentStatus: "PAID", courierId: courier.id });
  const after = await factsAt();
  assert.equal(after.today.created - before.today.created, 8); // The deleted shipment is not counted.
  assert.equal(after.today.delivered - before.today.delivered, 1);
  assert.equal(after.today.failed - before.today.failed, 1);
  assert.equal(after.failed.count - before.failed.count, 2);
  assert.equal(after.delayed.count - before.delayed.count, 1);
  assert.equal(after.unassignedPaid.count - before.unassignedPaid.count, 1);
  for (const list of [after.failed.recent, after.delayed.oldest, after.unassignedPaid.oldest]) assert.ok(list.length <= 5);
  // Its updatedAt is recent, but the stalled shipment's last event is decades old.
  const stalledRef = after.delayed.oldest.find((row) => row.id === stalled.id);
  assert.ok(stalledRef, "the stalled shipment is among the oldest delayed examples");
  assert.ok(stalledRef.hoursSinceUpdate >= 48);
  assert.equal(after.delayed.oldest.some((row) => row.trackingNumber.endsWith("-brief-stalled-deleted")), false);

  await prisma.user.update({ where: { id: admin.id }, data: { role: "CUSTOMER" } });
  // JWT still claims ADMIN; the current database role wins for every endpoint.
  for (const path of Object.keys(routes)) assert.equal((await call(path, admin, path === "role" ? { role: "ADMIN" } : undefined, customer.id)).status, 403);
  console.info("Admin integration passed: all five routes, current-role authorization, aggregate semantics, exact currency totals, soft-delete rules, filters, stable audit pagination, role audit and session revocation.");
} finally {
  try {
    if (userIds.length) await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { id: { in: auditIds } }] } }),
      prisma.payment.deleteMany({ where: { shipmentId: { in: shipmentIds } } }),
      prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: shipmentIds } } }),
      prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } }),
      prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
  } finally { await prisma.$disconnect(); }
}
