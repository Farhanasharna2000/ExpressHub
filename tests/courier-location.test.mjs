import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { courierLocationSchema } = await import("../validators/courier-location.ts");
const { publicTrackingSchema } = await import("../validators/track.ts");
const {
  LOCATION_STALE_MS, distanceMeters, isFreshLocation, locationAge, publicCourierLocation, roundForPublic, shouldSendLocation,
} = await import("../lib/courier-location.ts");
const { toPublicTracking, trackingSignature } = await import("../services/tracking-stream.ts");

const NOW = Date.parse("2026-11-19T06:00:00Z");
const fresh = { latitude: 23.780573, longitude: 90.279239, updatedAt: new Date(NOW - 60_000) };
const out = { status: "OUT_FOR_DELIVERY", hasCourier: true };

test("location updates are range-checked and strict", () => {
  assert.deepEqual(courierLocationSchema.parse({ lat: 23.78, lng: 90.27, accuracy: 12 }), { lat: 23.78, lng: 90.27, accuracy: 12 });
  assert.equal(courierLocationSchema.safeParse({ lat: 23.78, lng: 90.27, accuracy: 12, heading: 90, speed: 8 }).success, true);
  for (const body of [
    { lat: 91, lng: 0, accuracy: 5 },
    { lat: 0, lng: -181, accuracy: 5 },
    { lat: 0, lng: 0, accuracy: 1001 },
    { lat: 0, lng: 0, accuracy: -1 },
    { lat: 0, lng: 0, accuracy: 5, heading: 400 },
    { lat: 0, lng: 0, accuracy: 5, speed: 150 },
    { lat: "23.7", lng: 90, accuracy: 5 },
    { lat: Number.NaN, lng: 90, accuracy: 5 },
    { lat: 0, lng: 0, accuracy: 5, courierId: "cm123" },
  ]) {
    assert.equal(courierLocationSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("public coordinates are rounded to about 110 m", () => {
  assert.equal(roundForPublic(23.780573), 23.781);
  assert.equal(roundForPublic(90.279239), 90.279);
  assert.equal(Object.is(roundForPublic(-0.0001), -0), false);
});

test("positions go stale after ten minutes and future timestamps are rejected", () => {
  assert.equal(isFreshLocation(new Date(NOW - LOCATION_STALE_MS), NOW), true);
  assert.equal(isFreshLocation(new Date(NOW - LOCATION_STALE_MS - 1), NOW), false);
  assert.equal(isFreshLocation(new Date(NOW + 5 * 60_000), NOW), false);
  assert.equal(isFreshLocation("not a date", NOW), false);
});

test("the public location appears only while out for delivery, assigned and fresh", () => {
  assert.deepEqual(publicCourierLocation(out, fresh, NOW), { lat: 23.781, lng: 90.279, updatedAt: fresh.updatedAt.toISOString() });
  for (const status of ["CREATED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "FAILED", "RETURNED", "CANCELLED"]) {
    assert.equal(publicCourierLocation({ status, hasCourier: true }, fresh, NOW), null, status);
  }
  assert.equal(publicCourierLocation({ ...out, hasCourier: false }, fresh, NOW), null);
  assert.equal(publicCourierLocation(out, null, NOW), null);
  assert.equal(publicCourierLocation(out, { ...fresh, updatedAt: new Date(NOW - LOCATION_STALE_MS - 1000) }, NOW), null);
});

test("the public tracking shape never carries exact coordinates or courier details", () => {
  const row = {
    trackingNumber: "EH-0123456789ABCDEF01234567",
    status: "OUT_FOR_DELIVERY",
    createdAt: new Date(NOW - 86_400_000),
    deliveredAt: null,
    events: [],
    hasCourier: true,
    courierLocation: { ...fresh, accuracy: 7, heading: 90, courierId: "cmcourier" },
  };
  const tracking = toPublicTracking(row, NOW);
  assert.deepEqual(Object.keys(tracking.courierLocation).sort(), ["lat", "lng", "updatedAt"]);
  const json = JSON.stringify(tracking);
  for (const leak of ["23.780573", "90.279239", "cmcourier", "accuracy", "heading"]) assert.equal(json.includes(leak), false, leak);

  // The strict schema refuses exact coordinates and extra fields even if code tried to send them.
  const valid = publicTrackingSchema.parse(tracking);
  assert.equal(publicTrackingSchema.safeParse({ ...valid, courierLocation: { ...valid.courierLocation, lat: 23.780573 } }).success, false);
  assert.equal(publicTrackingSchema.safeParse({ ...valid, courierLocation: { ...valid.courierLocation, courierId: "x" } }).success, false);
  assert.equal(publicTrackingSchema.safeParse({ ...valid, courierLocation: { ...valid.courierLocation, accuracy: 5 } }).success, false);
});

test("the stream signature changes when the courier moves or the position goes stale", () => {
  const base = { trackingNumber: "EH-0123456789ABCDEF01234567", status: "OUT_FOR_DELIVERY", createdAt: new Date(NOW - 86_400_000), deliveredAt: null, events: [], hasCourier: true };
  const here = trackingSignature(toPublicTracking({ ...base, courierLocation: fresh }, NOW));
  const moved = trackingSignature(toPublicTracking({ ...base, courierLocation: { latitude: 23.79, longitude: 90.28, updatedAt: new Date(NOW - 10_000) } }, NOW));
  const gone = trackingSignature(toPublicTracking({ ...base, courierLocation: null }, NOW));
  assert.notEqual(here, moved);
  assert.notEqual(here, gone);
  assert.equal(here, trackingSignature(toPublicTracking({ ...base, courierLocation: fresh }, NOW)));
});

test("the app sends every 15 seconds, or sooner after 50 m, never more than every 3 seconds", () => {
  const start = { lat: 23.78, lng: 90.27, at: NOW };
  const nearby = { lat: 23.7801, lng: 90.27 }; // about 11 m
  const far = { lat: 23.781, lng: 90.27 }; // about 111 m
  assert.equal(shouldSendLocation(null, nearby, NOW), true);
  assert.equal(shouldSendLocation(start, nearby, NOW + 10_000), false);
  assert.equal(shouldSendLocation(start, nearby, NOW + 15_000), true);
  assert.equal(shouldSendLocation(start, far, NOW + 4_000), true);
  assert.equal(shouldSendLocation(start, far, NOW + 2_000), false);
  assert.ok(Math.abs(distanceMeters({ lat: 23.78, lng: 90.27 }, far) - 111) < 2);
});

test("ages read naturally", () => {
  assert.equal(locationAge(new Date(NOW - 20_000).toISOString(), NOW), "just now");
  assert.equal(locationAge(new Date(NOW - 60_000).toISOString(), NOW), "1 min ago");
  assert.equal(locationAge(new Date(NOW - 7 * 60_000).toISOString(), NOW), "7 min ago");
});

test("the CSP allows only the OpenStreetMap tile server as an extra image origin", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org/);
  assert.equal(/https:\/\/(?!tile\.openstreetmap\.org|checkout\.stripe\.com)[a-z]/.test(config.slice(config.indexOf("pageContentSecurityPolicy"), config.indexOf("].join"))), false);
});
