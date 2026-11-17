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
const { default: prisma } = await import("../lib/prisma.ts");
const { signAccessToken } = await import("../lib/auth/tokens.ts");
const { getShipment, updateShipmentStatus } = await import("../services/shipment.service.ts");
const uploadRoute = await import("../app/api/v1/shipments/[id]/proof/route.ts");
const imageRoutes = {
  photo: await import("../app/api/v1/shipments/[id]/proof/photo/route.ts"),
  signature: await import("../app/api/v1/shipments/[id]/proof/signature/route.ts"),
};

const tag = randomBytes(6).toString("hex");
const users = [];
const shipments = [];

async function user(role) {
  const created = await prisma.user.create({
    data: { name: `Proof ${role}`, email: `proof-${role.toLowerCase()}-${tag}-${users.length}@example.com`, passwordHash: "x", role },
    select: { id: true, name: true, email: true, role: true },
  });
  users.push(created.id);
  return created;
}

async function shipment(customer, courier, status = "OUT_FOR_DELIVERY") {
  const created = await prisma.shipment.create({
    data: {
      trackingNumber: `EH-${randomBytes(12).toString("hex").toUpperCase()}`,
      customerId: customer.id, courierId: courier.id, status, paymentStatus: "PAID",
      pickupContactName: "Sender", pickupContactPhone: "01700000000", pickupAddress: "Pickup address",
      deliveryContactName: "Rina Akter", deliveryContactPhone: "01800000000", deliveryAddress: "Delivery address",
      parcelWeightKg: "1.000", price: "100.00",
    },
  });
  shipments.push(created.id);
  return created;
}

const token = (who) => signAccessToken({ userId: who.id, role: who.role });
const segment = (marker, text) => {
  const body = Buffer.from(text, "latin1");
  return [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
};
// A tiny JPEG carrying GPS coordinates in its EXIF segment.
const jpeg = Uint8Array.from([0xff, 0xd8, ...segment(0xe0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0"), ...segment(0xe1, "Exif\0\0GPSLatitude=23.8103"), ...segment(0xda, "\x01\x01\0\0\x3f\0"), 0x11, 0x22, 0xff, 0xd9]);
const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

async function upload(who, shipmentId, files = { photo: jpeg }, recipientName = "Rina Akter") {
  const form = new FormData();
  if (recipientName !== undefined) form.set("recipientName", recipientName);
  for (const [name, data] of Object.entries(files)) form.set(name, new Blob([data]), name);
  const encoded = new Response(form);
  const request = new Request(`http://localhost/api/v1/shipments/${shipmentId}/proof`, {
    method: "POST",
    headers: { authorization: `Bearer ${token(who)}`, "content-type": encoded.headers.get("content-type") },
    body: new Uint8Array(await encoded.arrayBuffer()),
  });
  const response = await uploadRoute.POST(request, { params: Promise.resolve({ id: shipmentId }) });
  return { status: response.status, body: await response.json() };
}

async function image(who, shipmentId, kind = "photo") {
  const request = new Request(`http://localhost/api/v1/shipments/${shipmentId}/proof/${kind}`, { headers: { authorization: `Bearer ${token(who)}` } });
  return imageRoutes[kind].GET(request, { params: Promise.resolve({ id: shipmentId }) });
}

const deliver = (who, shipmentId) => updateShipmentStatus(who, shipmentId, { status: "DELIVERED", expectedStatus: "OUT_FOR_DELIVERY", note: "Delivered to Rina" });

try {
  const [customer, otherCustomer, courier, otherCourier, admin] = [await user("CUSTOMER"), await user("CUSTOMER"), await user("COURIER"), await user("COURIER"), await user("ADMIN")];
  const parcel = await shipment(customer, courier);

  // No proof yet: delivery is refused for the courier and for an admin.
  await assert.rejects(deliver(courier, parcel.id), (error) => error.status === 409 && error.code === "PROOF_REQUIRED");
  await assert.rejects(deliver(admin, parcel.id), (error) => error.code === "PROOF_REQUIRED");

  // Only the assigned courier can upload, and only valid images.
  assert.equal((await upload(otherCourier, parcel.id)).status, 404);
  assert.equal((await upload(customer, parcel.id)).status, 403);
  assert.equal((await upload(courier, parcel.id, {})).body.errors[0].code, "PROOF_IMAGE_REQUIRED");
  assert.equal((await upload(courier, parcel.id, { photo: Buffer.from("GIF89a....") })).body.errors[0].code, "INVALID_PROOF_IMAGE");
  assert.equal((await upload(courier, parcel.id, { photo: jpeg }, "R")).status, 400);

  const saved = await upload(courier, parcel.id);
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.deepEqual(Object.keys(saved.body.data.proof).sort(), ["capturedAt", "hasPhoto", "hasSignature", "recipientName"]);
  const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { shipmentId: parcel.id } });
  const stored = await prisma.storedFile.findUniqueOrThrow({ where: { key: proof.photoKey } });
  assert.equal(stored.contentType, "image/jpeg");
  assert.equal(Buffer.from(stored.data).includes(Buffer.from("GPSLatitude")), false, "EXIF location is stripped before storage");
  assert.equal(await prisma.auditLog.count({ where: { shipmentId: parcel.id, action: "DELIVERY_PROOF_CAPTURED" } }), 1);

  // Replacing the proof removes the old image.
  assert.equal((await upload(courier, parcel.id, { photo: jpeg, signature: pngSignature })).status, 201);
  assert.equal(await prisma.storedFile.count({ where: { key: proof.photoKey } }), 0);
  const replaced = await prisma.deliveryProof.findUniqueOrThrow({ where: { shipmentId: parcel.id } });
  assert.ok(replaced.signatureKey);

  // Viewing: the owner, the assigned courier and admins only. Others get 404.
  const ownerView = await image(customer, parcel.id);
  assert.equal(ownerView.status, 200);
  assert.equal(ownerView.headers.get("content-type"), "image/jpeg");
  assert.match(ownerView.headers.get("cache-control"), /^private/);
  assert.equal((await image(courier, parcel.id, "signature")).headers.get("content-type"), "image/png");
  assert.equal((await image(admin, parcel.id)).status, 200);
  assert.equal((await image(otherCustomer, parcel.id)).status, 404);
  assert.equal((await image(otherCourier, parcel.id)).status, 404);
  assert.equal((await image(customer, "not-a-shipment-id")).status, 400);

  // Detail responses carry a summary, never storage keys.
  const detail = await getShipment(customer, parcel.id);
  assert.equal(detail.deliveryProof.recipientName, "Rina Akter");
  assert.equal(detail.deliveryProof.hasSignature, true);
  assert.equal(JSON.stringify(detail).includes(replaced.photoKey), false);

  // With proof the delivery succeeds; afterwards the proof is locked.
  assert.equal((await deliver(courier, parcel.id)).status, "DELIVERED");
  assert.equal((await upload(courier, parcel.id)).body.errors[0].code, "PROOF_NOT_ALLOWED");

  // Proof from a previously assigned courier does not count for the new one.
  const reassigned = await shipment(customer, courier);
  assert.equal((await upload(courier, reassigned.id)).status, 201);
  await prisma.shipment.update({ where: { id: reassigned.id }, data: { courierId: otherCourier.id } });
  await assert.rejects(deliver(otherCourier, reassigned.id), (error) => error.code === "PROOF_REQUIRED");

  // Proof can only be captured while out for delivery.
  const early = await shipment(customer, courier, "IN_TRANSIT");
  assert.equal((await upload(courier, early.id)).body.errors[0].code, "PROOF_NOT_ALLOWED");

  console.info("Proof integration passed: delivery gate, courier-only upload, image validation, EXIF stripping, replacement cleanup, viewer access rules, key-free summaries, post-delivery lock and reassignment.");
} finally {
  const keys = (await prisma.deliveryProof.findMany({ where: { shipmentId: { in: shipments } }, select: { photoKey: true, signatureKey: true } }))
    .flatMap((row) => [row.photoKey, row.signatureKey]).filter(Boolean);
  if (keys.length) await prisma.storedFile.deleteMany({ where: { key: { in: keys } } });
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
