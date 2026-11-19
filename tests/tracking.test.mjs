import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { trackingNumberSchema, publicTrackingSchema } = await import("../validators/track.ts");
const { createTrackingStream, toPublicTracking, trackingSignature } = await import("../services/tracking-stream.ts");
const { eventTitle, journeyProgress, journeyStepTimes, parseTrackingInput, reconnectDelay, timeZoneLabel, trackingPath, trackingShortTime, trackingStatusMessage, trackingTime } = await import("../features/tracking/contracts.ts");

test("the progress line fills between the first and last journey steps", () => {
  assert.equal(journeyProgress(-1, 5), 0);
  assert.equal(journeyProgress(0, 5), 0);
  assert.equal(journeyProgress(2, 5), 0.5);
  assert.equal(journeyProgress(4, 5), 1);
  assert.equal(journeyProgress(9, 5), 1);
});

const TRACK = "EH-0123456789ABCDEF01234567";
const at = (iso) => new Date(iso);
const row = {
  trackingNumber: TRACK,
  status: "IN_TRANSIT",
  createdAt: at("2026-11-16T03:00:00Z"),
  deliveredAt: null,
  events: [
    { type: "CREATED", toStatus: "CREATED", occurredAt: at("2026-11-16T03:00:00Z"), originHub: null, destinationHub: null },
    { type: "HUB_TRANSFER", toStatus: null, occurredAt: at("2026-11-16T06:00:00Z"), originHub: { name: "Dhaka Hub" }, destinationHub: { name: "Chattogram Hub" } },
    { type: "STATUS_CHANGED", toStatus: "IN_TRANSIT", occurredAt: at("2026-11-16T07:00:00Z"), originHub: { name: "Dhaka Hub" }, destinationHub: null },
  ],
};
const PRIVATE_FIELDS = ["id", "customerId", "courierId", "pickupContactName", "pickupContactPhone", "pickupAddress", "deliveryContactName", "deliveryContactPhone", "deliveryAddress", "packageDescription", "price", "publicNote", "internalNote", "actorId"];

test("tracking numbers are normalised and strictly validated", () => {
  assert.equal(trackingNumberSchema.parse(` ${TRACK.toLowerCase()} `), TRACK);
  for (const value of ["", "EH-123", "XX-0123456789ABCDEF01234567", `${TRACK}0`, "EH-0123456789ABCDEF0123456G", "../../etc"]) {
    assert.equal(trackingNumberSchema.safeParse(value).success, false, value);
  }
});

test("the public shape holds only status, dates and hub names", () => {
  const tracking = toPublicTracking({ ...row, deliveryAddress: "secret", price: "120.00", customerId: "cm1" });
  assert.deepEqual(Object.keys(tracking).sort(), ["courierLocation", "createdAt", "deliveredAt", "events", "status", "trackingNumber"]);
  assert.equal(tracking.courierLocation, null);
  for (const event of tracking.events) assert.deepEqual(Object.keys(event).sort(), ["hub", "occurredAt", "status", "type"]);
  assert.deepEqual(tracking.events.map((event) => event.hub), [null, "Chattogram Hub", "Dhaka Hub"]);
  const json = JSON.stringify(tracking);
  assert.equal(json.includes("secret"), false);
  assert.equal(json.includes("120.00"), false);
});

test("the strict schema rejects any private field, so a leak fails loudly", () => {
  const valid = toPublicTracking(row);
  for (const field of PRIVATE_FIELDS) {
    assert.equal(publicTrackingSchema.safeParse({ ...valid, [field]: "x" }).success, false, field);
    assert.equal(publicTrackingSchema.safeParse({ ...valid, events: [{ ...valid.events[0], [field]: "x" }] }).success, false, `event.${field}`);
  }
  assert.throws(() => toPublicTracking({ ...row, events: [{ ...row.events[0], type: "ADMIN_CORRECTION" }] }));
});

test("the database query selects no private fields", () => {
  const source = readFileSync(new URL("../services/tracking.service.ts", import.meta.url), "utf8");
  const select = source.slice(source.indexOf("select:"), source.indexOf("});"));
  for (const field of PRIVATE_FIELDS.filter((field) => field !== "id")) assert.equal(select.includes(field), false, field);
  assert.match(source, /deletedAt: null/);
});

test("the signature changes only when the timeline changes", () => {
  const base = toPublicTracking(row);
  assert.equal(trackingSignature(base), trackingSignature(toPublicTracking(row)));
  const moved = toPublicTracking({ ...row, status: "OUT_FOR_DELIVERY", events: [...row.events, { type: "STATUS_CHANGED", toStatus: "OUT_FOR_DELIVERY", occurredAt: at("2026-11-16T09:00:00Z"), originHub: null, destinationHub: null }] });
  assert.notEqual(trackingSignature(base), trackingSignature(moved));
});

async function readAll(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}
const frames = (text, name) => text.split("\n\n").filter((block) => block.startsWith(`event: ${name}\n`)).map((block) => JSON.parse(block.split("\ndata: ")[1]));

test("the stream sends the current state, pushes changes and ends on a final status", async () => {
  const initial = toPublicTracking(row);
  const delivered = toPublicTracking({ ...row, status: "DELIVERED", deliveredAt: at("2026-11-16T10:00:00Z"), events: [...row.events, { type: "STATUS_CHANGED", toStatus: "DELIVERED", occurredAt: at("2026-11-16T10:00:00Z"), originHub: null, destinationHub: null }] });
  const sequence = [initial, initial, delivered];
  let loads = 0;
  const text = await readAll(createTrackingStream({ initial, load: async () => sequence[Math.min(loads++, sequence.length - 1)], pollMs: 5, heartbeatMs: 1_000, lifetimeMs: 5_000 }));
  assert.match(text, /^retry: \d+\n\n/);
  const updates = frames(text, "tracking");
  assert.deepEqual(updates.map((update) => update.status), ["IN_TRANSIT", "DELIVERED"], "unchanged polls send nothing");
  assert.deepEqual(frames(text, "end"), [{ reason: "final" }]);
  assert.equal(loads, 3);
});

test("the stream ends when the shipment disappears, after repeated errors, or at its lifetime", async () => {
  const initial = toPublicTracking(row);
  assert.deepEqual(frames(await readAll(createTrackingStream({ initial, load: async () => null, pollMs: 5 })), "end"), [{ reason: "gone" }]);

  const originalError = console.error;
  console.error = () => {};
  try {
    let calls = 0;
    const failing = await readAll(createTrackingStream({ initial, load: async () => { calls += 1; throw new Error("db down"); }, pollMs: 5 }));
    assert.deepEqual(frames(failing, "end"), [{ reason: "error" }]);
    assert.equal(calls, 3);
  } finally {
    console.error = originalError;
  }

  const timed = await readAll(createTrackingStream({ initial, load: async () => initial, pollMs: 5, heartbeatMs: 10, lifetimeMs: 60 }));
  assert.deepEqual(frames(timed, "end"), [{ reason: "timeout" }]);
  assert.match(timed, /: heartbeat\n\n/);
});

test("a final status closes at once and a client disconnect stops polling", async () => {
  const delivered = toPublicTracking({ ...row, status: "DELIVERED" });
  let loads = 0;
  const text = await readAll(createTrackingStream({ initial: delivered, load: async () => { loads += 1; return delivered; }, pollMs: 5 }));
  assert.equal(frames(text, "tracking").length, 1);
  assert.deepEqual(frames(text, "end"), [{ reason: "final" }]);
  assert.equal(loads, 0);

  const controller = new AbortController();
  let polls = 0;
  const stream = createTrackingStream({ initial: toPublicTracking(row), load: async () => { polls += 1; return toPublicTracking(row); }, pollMs: 5, signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await readAll(stream);
  const after = polls;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(polls, after, "no polling after disconnect");
});

test("tracking helpers parse input, label events and format Dhaka time", () => {
  assert.equal(parseTrackingInput(TRACK.toLowerCase()), TRACK);
  assert.equal(parseTrackingInput(`https://expresshub.example/track/${TRACK}`), TRACK);
  assert.equal(parseTrackingInput("EH-123"), null);
  assert.equal(trackingPath(TRACK), `/track/${TRACK}`);
  assert.equal(eventTitle({ type: "HUB_TRANSFER", status: null }), "Arrived at a hub");
  assert.equal(eventTitle({ type: "STATUS_CHANGED", status: "OUT_FOR_DELIVERY" }), "Out for delivery");
  assert.equal(trackingTime("2026-11-16T18:30:00Z"), "17 Nov 2026, 00:30");
  // Visitors see their own timezone; an unknown zone falls back to Dhaka time.
  assert.equal(trackingTime("2026-11-16T18:30:00Z", "Europe/London"), "16 Nov 2026, 18:30");
  assert.equal(trackingTime("2026-11-16T18:30:00Z", "America/New_York"), "16 Nov 2026, 13:30");
  assert.equal(trackingTime("2026-11-16T18:30:00Z", "Not/AZone"), "17 Nov 2026, 00:30");
  assert.equal(timeZoneLabel("Asia/Dhaka"), "Asia/Dhaka, GMT+6");
  assert.equal(timeZoneLabel("Europe/London", new Date("2026-07-01T12:00:00Z")), "Europe/London, GMT+1");
  assert.equal(timeZoneLabel("Not/AZone"), "Asia/Dhaka, GMT+6");
  assert.equal(trackingShortTime("2026-11-16T18:30:00Z"), "17 Nov, 00:30");
  assert.equal(trackingShortTime("2026-11-16T18:30:00Z", "Europe/London"), "16 Nov, 18:30");
  assert.deepEqual([0, 1, 2, 10].map(reconnectDelay), [1_000, 2_000, 4_000, 30_000]);
});

test("each journey step shows when it was last reached, and statuses are explained once", () => {
  const steps = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
  const tracking = {
    createdAt: "2026-11-10T04:00:00.000Z",
    events: [
      { type: "CREATED", status: "CREATED", occurredAt: "2026-11-10T04:00:01.000Z", hub: null },
      { type: "STATUS_CHANGED", status: "PICKED_UP", occurredAt: "2026-11-11T05:00:00.000Z", hub: null },
      { type: "STATUS_CHANGED", status: "IN_TRANSIT", occurredAt: "2026-11-11T09:00:00.000Z", hub: null },
      { type: "STATUS_CHANGED", status: "FAILED", occurredAt: "2026-11-12T09:00:00.000Z", hub: null },
      { type: "STATUS_CHANGED", status: "IN_TRANSIT", occurredAt: "2026-11-13T09:00:00.000Z", hub: null },
    ],
  };
  assert.deepEqual(journeyStepTimes(tracking, steps), {
    CREATED: "2026-11-10T04:00:00.000Z",
    PICKED_UP: "2026-11-11T05:00:00.000Z",
    // Back in transit after a failed attempt: the latest time wins.
    IN_TRANSIT: "2026-11-13T09:00:00.000Z",
  });
  for (const status of [...steps, "FAILED", "RETURNED", "CANCELLED"]) {
    const message = trackingStatusMessage(status);
    assert.ok(message.length > 0, status);
    // The sentence explains the status rather than repeating its label.
    assert.notEqual(message.toLowerCase(), status.toLowerCase().replaceAll("_", " "));
  }
  assert.equal(trackingStatusMessage("UNKNOWN"), "");
});
