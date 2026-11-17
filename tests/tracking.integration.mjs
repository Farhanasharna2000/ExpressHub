import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

// Run only against a development/test database. Creates and removes unique fixtures.
const prisma = new PrismaClient();
const port = process.env.TRACKING_TEST_PORT ?? "3197";
const base = `http://localhost:${port}`;
const suffix = randomBytes(8).toString("hex");
const SECRET = `secret-${suffix}`;
const fixture = { userIds: [], hubIds: [] };
const bundler = process.env.TRACKING_TEST_WEBPACK === "0" ? [] : ["--webpack"];
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...bundler, "--port", port], {
  env: {
    ...process.env,
    NODE_ENV: "development",
    JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
    ALLOWED_ORIGIN: base,
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (data) => { logs = (logs + data).slice(-8000); });
child.stderr.on("data", (data) => { logs = (logs + data).slice(-8000); });
const exited = new Promise((resolve) => child.once("exit", resolve));

const trackingNumber = () => `EH-${randomBytes(12).toString("hex").toUpperCase()}`;

// Reads Server-Sent Events frames until predicate matches or the timeout passes.
async function readUntil(reader, state, predicate, timeoutMs) {
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const blocks = state.buffer.split("\n\n");
    state.buffer = blocks.pop();
    for (const block of blocks) {
      const name = block.match(/^event: (\w+)/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (name) state.frames.push({ name, data: JSON.parse(data) });
    }
    const found = state.frames.find(predicate);
    if (found) return found;
    const chunk = await Promise.race([reader.read(), delay(Math.max(1, deadline - Date.now())).then(() => null)]);
    if (!chunk || chunk.done) break;
    state.buffer += decoder.decode(chunk.value, { stream: true });
  }
  return state.frames.find(predicate) ?? null;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (child.exitCode !== null) throw new Error(`Test server exited: ${logs}`);
    try {
      const response = await fetch(`${base}/api/v1/users/me`);
      if (response.status === 401) { ready = true; break; }
    } catch { /* Wait for server startup. */ }
    await delay(250);
  }
  assert.ok(ready, `Test server did not start: ${logs}`);

  const customer = await prisma.user.create({ data: { name: `Tracking ${SECRET}`, email: `tracking-${suffix}@example.com`, role: "CUSTOMER", passwordHash: "x" } });
  fixture.userIds.push(customer.id);
  const hub = await prisma.hub.create({ data: { code: `TRK-${suffix}`, name: `Test Hub ${suffix}`, address: `${SECRET} hub street`, zoneCode: "TST" } });
  fixture.hubIds.push(hub.id);
  const shipment = await prisma.shipment.create({ data: {
    trackingNumber: trackingNumber(), customerId: customer.id,
    pickupContactName: SECRET, pickupContactPhone: "01711111111", pickupAddress: `${SECRET} pickup`,
    deliveryContactName: SECRET, deliveryContactPhone: "01822222222", deliveryAddress: `${SECRET} delivery`,
    packageDescription: SECRET, parcelWeightKg: "1.000", price: "987.65", status: "IN_TRANSIT", paymentStatus: "PAID",
    events: { create: [
      { type: "CREATED", toStatus: "CREATED", occurredAt: new Date(Date.now() - 3_600_000) },
      { type: "COURIER_ASSIGNED", internalNote: SECRET, occurredAt: new Date(Date.now() - 3_000_000) },
      { type: "HUB_TRANSFER", destinationHubId: hub.id, publicNote: SECRET, internalNote: SECRET, occurredAt: new Date(Date.now() - 2_000_000) },
      { type: "STATUS_CHANGED", fromStatus: "CREATED", toStatus: "IN_TRANSIT", occurredAt: new Date(Date.now() - 1_000_000) },
    ] },
  } });

  // Lookup: normalised input, public fields only, internal events hidden.
  const lookup = await fetch(`${base}/api/v1/track/${shipment.trackingNumber.toLowerCase()}`);
  assert.equal(lookup.status, 200);
  const text = await lookup.text();
  assert.equal(text.includes(SECRET), false, "no private text leaks");
  assert.equal(text.includes("987.65"), false, "no price leaks");
  assert.equal(text.includes(customer.id) || text.includes(shipment.id), false, "no internal IDs leak");
  const { tracking } = JSON.parse(text).data;
  assert.equal(tracking.trackingNumber, shipment.trackingNumber);
  assert.deepEqual(tracking.events.map((event) => event.type), ["CREATED", "HUB_TRANSFER", "STATUS_CHANGED"]);
  assert.equal(tracking.events[1].hub, hub.name);

  assert.equal((await fetch(`${base}/api/v1/track/not-a-number`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/track/${trackingNumber()}`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/track/${trackingNumber()}/stream`)).status, 404);

  // Public page: rendered without login, canonical upper-case URL, unknown is 404.
  const page = await fetch(`${base}/track/${shipment.trackingNumber}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes(shipment.trackingNumber));
  assert.equal(html.includes(SECRET), false, "page has no private text");
  assert.match(page.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
  const lower = await (await fetch(`${base}/track/${shipment.trackingNumber.toLowerCase()}`)).text();
  assert.ok(lower.includes(shipment.trackingNumber), "lower-case input renders the normalised number");
  const unknown = await (await fetch(`${base}/track/${trackingNumber()}`)).text();
  assert.match(unknown, /couldn(&#x27;|'|&apos;)t find that parcel/);
  assert.match(unknown, /<meta name="robots" content="noindex/);

  // Stream: initial state, then a live update after a status change, then a final end.
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/v1/track/${shipment.trackingNumber}/stream`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type") ?? "", /^text\/event-stream/);
  const reader = stream.body.getReader();
  const state = { buffer: "", frames: [] };
  const first = await readUntil(reader, state, (frame) => frame.name === "tracking", 15_000);
  assert.equal(first?.data.status, "IN_TRANSIT");

  const changedAt = Date.now();
  await prisma.$transaction([
    prisma.shipment.update({ where: { id: shipment.id }, data: { status: "OUT_FOR_DELIVERY" } }),
    prisma.shipmentEvent.create({ data: { shipmentId: shipment.id, type: "STATUS_CHANGED", fromStatus: "IN_TRANSIT", toStatus: "OUT_FOR_DELIVERY" } }),
  ]);
  const update = await readUntil(reader, state, (frame) => frame.name === "tracking" && frame.data.status === "OUT_FOR_DELIVERY", 12_000);
  assert.ok(update, "status change arrived over SSE");
  assert.ok(Date.now() - changedAt < 12_000);

  await prisma.$transaction([
    prisma.shipment.update({ where: { id: shipment.id }, data: { status: "DELIVERED", deliveredAt: new Date() } }),
    prisma.shipmentEvent.create({ data: { shipmentId: shipment.id, type: "STATUS_CHANGED", fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" } }),
  ]);
  const end = await readUntil(reader, state, (frame) => frame.name === "end", 12_000);
  assert.deepEqual(end?.data, { reason: "final" });
  assert.ok(state.frames.some((frame) => frame.name === "tracking" && frame.data.status === "DELIVERED"));
  controller.abort();

  // Soft-deleted shipments are treated as unknown.
  await prisma.shipment.update({ where: { id: shipment.id }, data: { deletedAt: new Date() } });
  assert.equal((await fetch(`${base}/api/v1/track/${shipment.trackingNumber}`)).status, 404);

  console.info("Tracking integration passed: public lookup, private-field exclusion, validation, page rendering and normalisation, live SSE update, final end and soft-delete exclusion.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  try {
    if (fixture.userIds.length || fixture.hubIds.length) {
      await prisma.$transaction([
        prisma.shipmentEvent.deleteMany({ where: { shipment: { customerId: { in: fixture.userIds } } } }),
        prisma.shipment.deleteMany({ where: { customerId: { in: fixture.userIds } } }),
        prisma.hub.deleteMany({ where: { id: { in: fixture.hubIds } } }),
        prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } }),
      ]);
    }
  } finally {
    await prisma.$disconnect();
  }
}
