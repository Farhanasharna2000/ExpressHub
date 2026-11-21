import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

// Real development/test PostgreSQL with isolated fixtures. Route handlers are called
// directly with signed tokens; rate limiting uses the in-process limiter.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";
process.env.APP_URL = "https://expresshub.example";
const { default: prisma } = await import("../lib/prisma.ts");
const { signAccessToken } = await import("../lib/auth/tokens.ts");
const labelRoute = await import("../app/api/v1/shipments/[id]/label/route.ts");
const lookupRoute = await import("../app/api/v1/courier/shipments/by-tracking/[trackingNumber]/route.ts");

const tag = randomBytes(6).toString("hex");
const users = [];
const shipments = [];

async function user(role) {
  const created = await prisma.user.create({
    data: { name: `Label ${role}`, email: `label-${role.toLowerCase()}-${tag}-${users.length}@example.com`, passwordHash: "x", role },
    select: { id: true, role: true },
  });
  users.push(created.id);
  return created;
}

async function shipment(customer, courier, status = "IN_TRANSIT", deletedAt = null) {
  const created = await prisma.shipment.create({
    data: {
      trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: customer.id, courierId: courier?.id ?? null, status, paymentStatus: "PAID", deletedAt,
      pickupContactName: "Rina Akter", pickupContactPhone: "01700000000", pickupAddress: "House 12, Road 5, Gulshan 1, Dhaka",
      deliveryContactName: "রহিম Uddin", deliveryContactPhone: "01800000000", deliveryAddress: "Agrabad, Chattogram",
      parcelWeightKg: "2.500", price: "150.00",
    },
  });
  shipments.push(created.id);
  return created;
}

const auth = (who) => ({ authorization: `Bearer ${signAccessToken({ userId: who.id, role: who.role })}` });

async function label(who, shipmentId) {
  const request = new Request(`http://localhost/api/v1/shipments/${shipmentId}/label`, { headers: auth(who) });
  return labelRoute.GET(request, { params: Promise.resolve({ id: shipmentId }) });
}

async function lookup(who, trackingNumber) {
  const request = new Request(`http://localhost/api/v1/courier/shipments/by-tracking/${trackingNumber}`, { headers: auth(who) });
  const response = await lookupRoute.GET(request, { params: Promise.resolve({ trackingNumber }) });
  return { status: response.status, body: await response.json() };
}

try {
  const [customer, otherCustomer, courier, otherCourier, admin] = [await user("CUSTOMER"), await user("CUSTOMER"), await user("COURIER"), await user("COURIER"), await user("ADMIN")];
  const parcel = await shipment(customer, courier);

  // The owner, the assigned courier and admins get a PDF; it is never cached.
  for (const who of [customer, courier, admin]) {
    const response = await label(who, parcel.id);
    assert.equal(response.status, 200, who.role);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-disposition"), new RegExp(`filename="expresshub-label-${parcel.trackingNumber}\\.pdf"`));
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString("latin1"), "%PDF-");
  }

  // Anyone else gets 404, so other people's shipments cannot be confirmed to exist.
  for (const who of [otherCustomer, otherCourier]) assert.equal((await label(who, parcel.id)).status, 404, who.role);
  assert.equal((await label(admin, "cm0000000000000000000000")).status, 404);
  assert.equal((await label(admin, "not-an-id")).status, 400);
  const archived = await shipment(customer, courier, "DELIVERED", new Date());
  assert.equal((await label(admin, archived.id)).status, 404);
  const cancelled = await shipment(customer, null, "CANCELLED");
  const refused = await label(customer, cancelled.id);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).errors[0].code, "LABEL_UNAVAILABLE");

  // A courier's scan resolves only to their own deliveries.
  const found = await lookup(courier, parcel.trackingNumber);
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.data.shipment, { id: parcel.id, trackingNumber: parcel.trackingNumber, status: "IN_TRANSIT" });
  assert.equal((await lookup(courier, parcel.trackingNumber.toLowerCase())).status, 200);
  assert.equal((await lookup(otherCourier, parcel.trackingNumber)).status, 404);
  assert.equal((await lookup(courier, archived.trackingNumber)).status, 404);
  assert.equal((await lookup(courier, "EH-NOT-A-NUMBER")).status, 400);
  for (const who of [customer, admin]) assert.equal((await lookup(who, parcel.trackingNumber)).status, 403, who.role);

  console.info("Label integration passed: owner, courier and admin access, 404 for others and archived, cancelled refusal, PDF headers, courier-scoped scan lookup and role checks.");
} finally {
  if (shipments.length) {
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
