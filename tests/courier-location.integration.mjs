import "dotenv/config";
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// Real development/test PostgreSQL with isolated fixtures. Route handlers are called
// directly with signed tokens; rate limiting uses the in-process limiter.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = randomUUID().repeat(2);
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";
const { default: prisma } = await import("../lib/prisma.ts");
const { signAccessToken } = await import("../lib/auth/tokens.ts");
const { updateShipmentStatus } = await import("../services/shipment.service.ts");
const locationRoute = await import("../app/api/v1/courier/location/route.ts");
const shipmentLocationRoute = await import("../app/api/v1/shipments/[id]/courier-location/route.ts");
const liveRoute = await import("../app/api/v1/admin/couriers/live/route.ts");
const trackRoute = await import("../app/api/v1/track/[trackingNumber]/route.ts");
const streamRoute = await import("../app/api/v1/track/[trackingNumber]/stream/route.ts");

const tag = randomBytes(6).toString("hex");
const users = [];
const EXACT = { lat: 23.780573, lng: 90.279239, accuracy: 8, heading: 45, speed: 6 };

async function user(role) {
  const created = await prisma.user.create({
    data: { name: `Location ${role} ${tag}`, email: `location-${role.toLowerCase()}-${tag}-${users.length}@example.com`, passwordHash: "x", role },
    select: { id: true, name: true, email: true, role: true },
  });
  users.push(created.id);
  return created;
}

async function shipment(customer, courier, status) {
  return prisma.shipment.create({
    data: {
      trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: customer.id, courierId: courier?.id ?? null, status, paymentStatus: "PAID",
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Pickup address",
      deliveryContactName: "Rina Akter", deliveryContactPhone: "01800000000", deliveryAddress: "Delivery address",
      parcelWeightKg: "1.000", price: "100.00",
      events: { create: [{ type: "CREATED", toStatus: "CREATED" }] },
    },
  });
}

const token = (who) => signAccessToken({ userId: who.id, role: who.role });
const json = async (pending) => {
  const response = await pending;
  return { status: response.status, body: await response.json() };
};

function sendLocation(who, body, method = "POST") {
  const init = { method, headers: { authorization: `Bearer ${token(who)}` } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers["content-type"] = "application/json";
  }
  return json(locationRoute[method](new Request("http://localhost/api/v1/courier/location", init)));
}
const shipmentLocation = (who, id) => json(shipmentLocationRoute.GET(
  new Request(`http://localhost/api/v1/shipments/${id}/courier-location`, { headers: { authorization: `Bearer ${token(who)}` } }),
  { params: Promise.resolve({ id }) },
));
const publicTracking = async (trackingNumber) => (await json(trackRoute.GET(
  new Request(`http://localhost/api/v1/track/${trackingNumber}`),
  { params: Promise.resolve({ trackingNumber }) },
))).body.data.tracking;

try {
  const customer = await user("CUSTOMER");
  const courier = await user("COURIER");
  const otherCourier = await user("COURIER");
  const admin = await user("ADMIN");

  // No delivery out: updates are refused and nothing is stored.
  const parcel = await shipment(customer, courier, "IN_TRANSIT");
  const refused = await sendLocation(courier, EXACT);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.errors?.[0]?.code ?? refused.body.code, "LOCATION_SHARING_NOT_ALLOWED");
  assert.equal(await prisma.courierLocation.count({ where: { courierId: courier.id } }), 0);
  assert.equal((await sendLocation(customer, EXACT)).status, 403);

  // While in transit the public view has no location, even if a position exists.
  assert.equal((await publicTracking(parcel.trackingNumber)).courierLocation, null);

  // Out for delivery: the update is stored, one row per courier, overwritten not appended.
  await prisma.shipment.update({ where: { id: parcel.id }, data: { status: "OUT_FOR_DELIVERY" } });
  assert.equal((await sendLocation(courier, { ...EXACT, lat: 120 })).status, 400, "out-of-range latitude is rejected");
  assert.equal((await sendLocation(courier, { ...EXACT, accuracy: 5000 })).status, 400, "vague fixes are rejected");
  assert.equal((await sendLocation(courier, { ...EXACT, extra: 1 })).status, 400, "unknown fields are rejected");
  assert.equal((await sendLocation(courier, EXACT)).status, 200);
  assert.equal((await sendLocation(courier, { ...EXACT, lat: 23.781 })).status, 200);
  assert.equal(await prisma.courierLocation.count({ where: { courierId: courier.id } }), 1);
  const stored = await prisma.courierLocation.findUniqueOrThrow({ where: { courierId: courier.id } });
  assert.equal(stored.latitude, 23.781);
  await sendLocation(courier, EXACT);

  // Public tracking: rounded coordinates and a timestamp only.
  const tracking = await publicTracking(parcel.trackingNumber);
  assert.deepEqual(Object.keys(tracking.courierLocation).sort(), ["lat", "lng", "updatedAt"]);
  assert.deepEqual([tracking.courierLocation.lat, tracking.courierLocation.lng], [23.781, 90.279]);
  const raw = JSON.stringify(tracking);
  for (const leak of ["23.780573", "90.279239", courier.id, courier.name, "accuracy"]) assert.equal(raw.includes(leak), false, leak);

  // Detail page: exact for admins, rounded for the customer, refused for other couriers.
  const forAdmin = await shipmentLocation(admin, parcel.id);
  assert.equal(forAdmin.body.data.location.exact, true);
  assert.equal(forAdmin.body.data.location.lat, EXACT.lat);
  const forCustomer = await shipmentLocation(customer, parcel.id);
  assert.deepEqual(forCustomer.body.data.location, { lat: 23.781, lng: 90.279, updatedAt: tracking.courierLocation.updatedAt, exact: false });
  assert.equal((await shipmentLocation(otherCourier, parcel.id)).status, 404);

  // Admin live map lists the courier with their deliveries; others are refused.
  const live = await json(liveRoute.GET(new Request("http://localhost/api/v1/admin/couriers/live", { headers: { authorization: `Bearer ${token(admin)}` } })));
  const entry = live.body.data.couriers.find((item) => item.courierId === courier.id);
  assert.ok(entry);
  assert.deepEqual(entry.shipments.map((item) => item.trackingNumber), [parcel.trackingNumber]);
  assert.equal((await json(liveRoute.GET(new Request("http://localhost/api/v1/admin/couriers/live", { headers: { authorization: `Bearer ${token(courier)}` } })))).status, 403);

  // Stale positions disappear everywhere.
  await prisma.courierLocation.update({ where: { courierId: courier.id }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
  assert.equal((await publicTracking(parcel.trackingNumber)).courierLocation, null);
  assert.equal((await shipmentLocation(admin, parcel.id)).body.data.location, null);
  await sendLocation(courier, EXACT);

  // The live stream pushes a position change.
  const controller = new AbortController();
  const stream = await streamRoute.GET(
    new Request(`http://localhost/api/v1/track/${parcel.trackingNumber}/stream`, { signal: controller.signal }),
    { params: Promise.resolve({ trackingNumber: parcel.trackingNumber }) },
  );
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames = [];
  const readFrames = async (predicate, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = frames.find(predicate);
      if (found) return found;
      const chunk = await Promise.race([reader.read(), delay(Math.max(1, deadline - Date.now())).then(() => null)]);
      if (!chunk || chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop();
      for (const block of blocks) {
        const name = block.match(/^event: (\w+)/m)?.[1];
        const data = block.match(/^data: (.*)$/m)?.[1];
        if (name === "tracking") frames.push(JSON.parse(data));
      }
    }
    return frames.find(predicate) ?? null;
  };
  const first = await readFrames((frame) => frame.courierLocation?.lat === 23.781, 10_000);
  assert.ok(first, "initial frame carries the rounded location");
  await sendLocation(courier, { lat: 23.7952, lng: 90.4011, accuracy: 9 });
  const moved = await readFrames((frame) => frame.courierLocation?.lat === 23.795, 12_000);
  assert.ok(moved, "a position change arrives over the stream");
  assert.equal(moved.courierLocation.lng, 90.401);
  controller.abort();

  // Delivering the last delivery out deletes the courier's position.
  await prisma.deliveryProof.create({ data: { shipmentId: parcel.id, courierId: courier.id, recipientName: "Rina Akter", capturedAt: new Date() } });
  await updateShipmentStatus(courier, parcel.id, { status: "DELIVERED", expectedStatus: "OUT_FOR_DELIVERY", note: "Delivered to Rina" });
  assert.equal(await prisma.courierLocation.count({ where: { courierId: courier.id } }), 0);
  assert.equal((await sendLocation(courier, EXACT)).status, 409);

  // Stopping removes the position.
  const second = await shipment(customer, otherCourier, "OUT_FOR_DELIVERY");
  assert.equal((await sendLocation(otherCourier, EXACT)).status, 200);
  assert.equal((await sendLocation(otherCourier, null, "DELETE")).status, 200);
  assert.equal(await prisma.courierLocation.count({ where: { courierId: otherCourier.id } }), 0);
  assert.equal((await publicTracking(second.trackingNumber)).courierLocation, null);

  console.info("Courier location integration passed: delivery-out gate, validation, single latest row, rounded public view, exact admin view, access rules, admin live list, staleness, live stream update, release on delivery and stop.");
} finally {
  try {
    await prisma.$transaction([
      prisma.courierLocation.deleteMany({ where: { courierId: { in: users } } }),
      prisma.deliveryProof.deleteMany({ where: { courierId: { in: users } } }),
      prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { shipment: { customerId: { in: users } } }] } }),
      prisma.notificationOutbox.deleteMany({ where: { recipientUserId: { in: users } } }),
      prisma.shipmentEvent.deleteMany({ where: { shipment: { customerId: { in: users } } } }),
      prisma.shipment.deleteMany({ where: { customerId: { in: users } } }),
      prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
