import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  MAX_PROOF_IMAGE_BYTES, canViewProof, cleanProofImage, detectImageType, proofSummary, resolveCapturedAt,
  stripJpegMetadata, stripPngMetadata, stripWebpMetadata,
} = await import("../lib/delivery-proof.ts");
const { proofFieldsSchema, proofKindSchema } = await import("../validators/proof.ts");
const { readLimitedFormData, formFile } = await import("../lib/http/multipart.ts");
const { ApiClient } = await import("../lib/client/api.ts");
const { attemptDelivery, isRetryable } = await import("../features/courier/proof-queue.ts");
const { validateTransitionReadiness } = await import("../features/shipments/contracts.ts");

const bytes = (...parts) => Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...Buffer.from(part, "latin1")] : part)));
const segment = (marker, payload) => {
  const body = typeof payload === "string" ? [...Buffer.from(payload, "latin1")] : payload;
  const length = body.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...body];
};
const has = (haystack, needle) => Buffer.from(haystack).includes(Buffer.from(needle, "latin1"));

// SOI, JFIF, EXIF with a GPS marker, a comment, a quant table, then scan data and EOI.
const jpeg = bytes(
  [0xff, 0xd8],
  segment(0xe0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0"),
  segment(0xe1, "Exif\0\0GPSLatitude=23.81"),
  segment(0xfe, "taken by courier phone"),
  segment(0xdb, [0, ...new Array(8).fill(1)]),
  segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
  [0x12, 0x34, 0xff, 0x00, 0x56],
  [0xff, 0xd9],
);

const pngChunk = (type, data) => {
  const body = Buffer.from(data, "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return [...length, ...Buffer.from(type, "latin1"), ...body, 0, 0, 0, 0];
};
const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IHDR", "x".repeat(13)), pngChunk("tEXt", "Location\0Dhaka"), pngChunk("eXIf", "GPS"), pngChunk("IDAT", "pixels"), pngChunk("IEND", ""));

const riffChunk = (type, data) => {
  const body = Buffer.from(data, "latin1");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return [...Buffer.from(type, "latin1"), ...size, ...body, ...(body.length % 2 ? [0] : [])];
};
const webpBody = [...riffChunk("VP8X", "\x0c" + "\0".repeat(9)), ...riffChunk("VP8 ", "imagedata"), ...riffChunk("EXIF", "GPS=1"), ...riffChunk("XMP ", "<x/>")];
const webpSize = Buffer.alloc(4);
webpSize.writeUInt32LE(4 + webpBody.length);
const webp = bytes("RIFF", [...webpSize], "WEBP", webpBody);

test("image type comes from the bytes, not the declared type", () => {
  assert.equal(detectImageType(jpeg), "image/jpeg");
  assert.equal(detectImageType(png), "image/png");
  assert.equal(detectImageType(webp), "image/webp");
  assert.equal(detectImageType(bytes("GIF89a....")), null);
  assert.equal(detectImageType(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
});

test("JPEG metadata (EXIF, comments) is removed and the image data kept", () => {
  const clean = stripJpegMetadata(jpeg);
  assert.equal(has(jpeg, "GPSLatitude"), true);
  assert.equal(has(clean, "GPSLatitude"), false);
  assert.equal(has(clean, "taken by courier"), false);
  assert.equal(has(clean, "JFIF"), true);
  assert.deepEqual([...clean.subarray(-7)], [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
  assert.throws(() => stripJpegMetadata(bytes([0xff, 0xd8], [0xff, 0xe1, 0x00, 0xff])), /Malformed/);
});

test("PNG text and EXIF chunks and WebP EXIF/XMP chunks are removed", () => {
  const cleanPng = stripPngMetadata(png);
  assert.equal(has(cleanPng, "Dhaka"), false);
  assert.equal(has(cleanPng, "eXIf"), false);
  assert.equal(has(cleanPng, "IDAT"), true);

  const cleanWebp = stripWebpMetadata(webp);
  assert.equal(has(cleanWebp, "EXIF"), false);
  assert.equal(has(cleanWebp, "XMP "), false);
  assert.equal(has(cleanWebp, "imagedata"), true);
  assert.equal(Buffer.from(cleanWebp).readUInt32LE(4), cleanWebp.length - 8, "RIFF size is rewritten");
  assert.equal(cleanWebp[20] & 0x0c, 0, "VP8X metadata flags are cleared");
});

test("proof images are limited to 2 MB of JPEG, PNG or WebP", () => {
  assert.equal(cleanProofImage(jpeg).contentType, "image/jpeg");
  const oversized = new Uint8Array(MAX_PROOF_IMAGE_BYTES + 1);
  oversized.set([0xff, 0xd8, 0xff]);
  assert.throws(() => cleanProofImage(oversized), /2 MB/);
  assert.throws(() => cleanProofImage(new Uint8Array()), /empty/);
  assert.throws(() => cleanProofImage(bytes("GIF89a....")), /JPEG, PNG or WebP/);
});

test("only the owning customer, the assigned courier and admins may view a proof", () => {
  const shipment = { customerId: "cust-1", courierId: "cour-1" };
  assert.equal(canViewProof({ id: "admin", role: "ADMIN" }, shipment), true);
  assert.equal(canViewProof({ id: "cust-1", role: "CUSTOMER" }, shipment), true);
  assert.equal(canViewProof({ id: "cust-2", role: "CUSTOMER" }, shipment), false);
  assert.equal(canViewProof({ id: "cour-1", role: "COURIER" }, shipment), true);
  assert.equal(canViewProof({ id: "cour-2", role: "COURIER" }, shipment), false);
  assert.equal(canViewProof({ id: "cour-1", role: "COURIER" }, { ...shipment, courierId: null }), false);
});

test("offline capture times are kept only within sane bounds", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  assert.deepEqual(resolveCapturedAt("2026-11-17T08:00:00Z", now), new Date("2026-11-17T08:00:00Z"));
  assert.equal(resolveCapturedAt("2026-11-17T11:00:00Z", now), now, "future times fall back to now");
  assert.equal(resolveCapturedAt("2026-11-01T10:00:00Z", now), now, "older than a week falls back to now");
  assert.equal(resolveCapturedAt(undefined, now), now);
});

test("proof summaries never expose storage keys", () => {
  const summary = proofSummary({ recipientName: "Rina", capturedAt: new Date("2026-11-17T10:00:00Z"), photoKey: "photo_secret", signatureKey: null });
  assert.deepEqual(summary, { recipientName: "Rina", capturedAt: "2026-11-17T10:00:00.000Z", hasPhoto: true, hasSignature: false });
  assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("form fields and kinds are validated", () => {
  assert.equal(proofFieldsSchema.parse({ recipientName: "  Rina Akter " }).recipientName, "Rina Akter");
  assert.equal(proofFieldsSchema.safeParse({ recipientName: "R" }).success, false);
  assert.equal(proofFieldsSchema.safeParse({ recipientName: "Rina", capturedAt: "yesterday" }).success, false);
  assert.equal(proofKindSchema.safeParse("photo").success, true);
  assert.equal(proofKindSchema.safeParse("../etc").success, false);
});

test("multipart uploads are size-limited and must be multipart", async () => {
  const form = new FormData();
  form.set("recipientName", "Rina");
  form.set("photo", new Blob([jpeg], { type: "image/jpeg" }), "photo.jpg");
  // Serialise first, so the body is a plain byte stream like a real network request.
  const encoded = new Response(form);
  const contentType = encoded.headers.get("content-type");
  const body = new Uint8Array(await encoded.arrayBuffer());
  const request = () => new Request("http://localhost/api/v1/shipments/x/proof", { method: "POST", headers: { "content-type": contentType }, body });
  const parsed = await readLimitedFormData(request(), 10_000);
  assert.deepEqual(await formFile(parsed, "photo"), jpeg);
  assert.equal(await formFile(parsed, "signature"), undefined);
  await assert.rejects(readLimitedFormData(request(), 100), (error) => error.status === 413);
  const json = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await assert.rejects(readLimitedFormData(json, 10_000), (error) => error.status === 415);
});

test("marking delivered in the UI needs a captured proof", () => {
  const ready = { status: "OUT_FOR_DELIVERY", paymentStatus: "PAID", courierId: "c1" };
  assert.equal(validateTransitionReadiness(ready, "DELIVERED", "ADMIN").eligible, false);
  const proof = { recipientName: "Rina", capturedAt: "2026-11-17T10:00:00.000Z", hasPhoto: false, hasSignature: true };
  assert.equal(validateTransitionReadiness({ ...ready, deliveryProof: proof }, "DELIVERED", "ADMIN").eligible, true);
});

function fakeApi(handlers) {
  const calls = [];
  const api = new ApiClient(async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    const handler = handlers.shift();
    if (!handler) throw new Error(`Unexpected request ${options.method} ${url}`);
    return handler(url, options);
  });
  api.token = "token";
  return { api, calls };
}
const ok = (data, status = 200) => Response.json({ success: true, data }, { status });
const fail = (status, code, message = "Rejected") => Response.json({ success: false, message, errors: [{ code }] }, { status });
const item = { id: "q1", courierId: "c1", shipmentId: "cmshipment00000000000001", trackingNumber: "EH-1", recipientName: "Rina", capturedAt: "2026-11-17T10:00:00.000Z", photo: new Blob([jpeg], { type: "image/jpeg" }), attempts: 0 };

test("a captured delivery uploads the proof, then marks the shipment delivered", async () => {
  const { api, calls } = fakeApi([() => ok({ proof: {} }, 201), () => ok({ shipment: { status: "DELIVERED" } })]);
  assert.deepEqual(await attemptDelivery(api, { ...item, note: "ok" }), { outcome: "delivered" });
  assert.equal(calls[0].url, "/api/v1/shipments/cmshipment00000000000001/proof");
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].body.get("recipientName"), "Rina");
  assert.ok(calls[0].body.get("photo") instanceof Blob);
  const status = JSON.parse(calls[1].body);
  assert.deepEqual(status, { status: "DELIVERED", expectedStatus: "OUT_FOR_DELIVERY", note: "Delivered to Rina" }, "too-short notes fall back to a confirmation");
});

test("network and server errors are retried later; rejected proofs are not", async () => {
  const offline = fakeApi([() => { throw new TypeError("Failed to fetch"); }]);
  assert.equal((await attemptDelivery(offline.api, item)).outcome, "retry");
  const busy = fakeApi([() => fail(503, "UNAVAILABLE")]);
  assert.equal((await attemptDelivery(busy.api, item)).outcome, "retry");
  const rejected = fakeApi([() => fail(400, "INVALID_PROOF_IMAGE")]);
  assert.equal((await attemptDelivery(rejected.api, item)).outcome, "failed");
  assert.equal(isRetryable(new Error("anything else")), true);
});

test("a delivery already finished by an earlier attempt counts as done", async () => {
  const proofLate = fakeApi([() => fail(409, "PROOF_NOT_ALLOWED"), () => ok({ shipment: { status: "DELIVERED" } })]);
  assert.equal((await attemptDelivery(proofLate.api, item)).outcome, "delivered");
  const statusLate = fakeApi([() => ok({ proof: {} }, 201), () => fail(409, "SHIPMENT_CONFLICT"), () => ok({ shipment: { status: "DELIVERED" } })]);
  assert.equal((await attemptDelivery(statusLate.api, item)).outcome, "delivered");
  const reallyFailed = fakeApi([() => ok({ proof: {} }, 201), () => fail(409, "SHIPMENT_CONFLICT"), () => ok({ shipment: { status: "FAILED" } })]);
  assert.equal((await attemptDelivery(reallyFailed.api, item)).outcome, "failed");
});
