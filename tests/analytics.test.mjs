import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { analyticsQuerySchema, ANALYTICS_MAX_DAYS } = await import("../validators/analytics.ts");
const { csvCell, toCsv } = await import("../lib/csv.ts");
const { cached } = await import("../lib/cache.ts");
const {
  addDays, bucketLabels, buildReport, dhakaToday, getAnalytics, percentChange, resolveRange, summarize,
} = await import("../services/analytics.service.ts");

const admin = { id: "cmadmin000000000000000001", email: "a@example.com", name: "Admin", role: "ADMIN" };
const customer = { id: "cmcustomer0000000000000001", email: "c@example.com", name: "Rina", role: "CUSTOMER" };
const NOW = new Date("2026-11-17T20:00:00Z"); // 2 AM on 18 November in Dhaka
const totals = { booked: 0, delivered: 0, timed: 0, onTime: 0, medianHours: null, p90Hours: null, failed: 0, revenue: "0.00" };
const emptyRaw = { booked: [], delivered: [], revenue: [], current: totals, previous: totals, hubs: [], couriers: [] };

test("the query accepts calendar dates, a granularity, or nothing at all", () => {
  assert.deepEqual(analyticsQuerySchema.parse({}), { granularity: "day" });
  assert.deepEqual(analyticsQuerySchema.parse({ from: "2026-11-01", to: "2026-11-30", granularity: "week" }), { from: "2026-11-01", to: "2026-11-30", granularity: "week" });
  for (const query of [
    { from: "2026-11-01" },
    { to: "2026-11-30" },
    { from: "2026-11-30", to: "2026-11-01" },
    { from: "2025-01-01", to: "2026-01-02" },
    { from: "2026-11-01T00:00:00Z", to: "2026-11-30" },
    { from: "2026-02-30", to: "2026-03-01" },
    { granularity: "month" },
    { unexpected: "x" },
  ]) assert.equal(analyticsQuerySchema.safeParse(query).success, false, JSON.stringify(query));
  // 366 days inclusive is the limit.
  assert.equal(analyticsQuerySchema.safeParse({ from: "2025-01-01", to: addDays("2025-01-01", ANALYTICS_MAX_DAYS - 1) }).success, true);
});

test("the default range is the last 30 Bangladesh days, compared with the 30 before", () => {
  assert.equal(dhakaToday(NOW), "2026-11-18");
  const range = resolveRange({ granularity: "day" }, NOW);
  assert.equal(range.from, "2026-10-20");
  assert.equal(range.to, "2026-11-18");
  assert.equal(range.days, 30);
  // Local midnight in Dhaka is 18:00 UTC the previous day; the end is exclusive.
  assert.deepEqual(range.start, new Date("2026-10-19T18:00:00Z"));
  assert.deepEqual(range.end, new Date("2026-11-18T18:00:00Z"));
  assert.deepEqual(range.previous, { from: "2026-09-20", to: "2026-10-19", start: new Date("2026-09-19T18:00:00Z"), end: new Date("2026-10-19T18:00:00Z") });
});

test("buckets cover every day, or every week from its Monday", () => {
  assert.deepEqual(bucketLabels("2026-02-27", "2026-03-02", "day"), ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  // 18 November 2026 is a Wednesday, so the first week starts on Monday the 16th.
  assert.deepEqual(bucketLabels("2026-11-18", "2026-12-01", "week"), ["2026-11-16", "2026-11-23", "2026-11-30"]);
});

test("rates and changes have no division by zero", () => {
  assert.deepEqual(summarize(totals), {
    booked: 0, delivered: 0, failed: 0, revenue: "0.00",
    onTimeRate: null, failureRate: null, medianDeliveryHours: null, p90DeliveryHours: null,
  });
  const summary = summarize({ ...totals, delivered: 3, timed: 3, onTime: 2, failed: 1, medianHours: 30.04, p90Hours: 70.06 });
  assert.equal(summary.onTimeRate, 66.7);
  assert.equal(summary.failureRate, 25);
  assert.equal(summary.medianDeliveryHours, 30);
  assert.equal(percentChange(0, 0), 0);
  assert.equal(percentChange(5, 0), null);
  assert.equal(percentChange(3, 4), -25);
});

test("the report fills quiet buckets with zero and keeps money as strings", () => {
  const range = resolveRange({ from: "2026-11-02", to: "2026-11-04", granularity: "day" }, NOW);
  const report = buildReport(range, { ...emptyRaw, booked: [{ bucket: "2026-11-03", value: 2 }], revenue: [{ bucket: "2026-11-04", value: "-100.00" }] }, NOW);
  assert.deepEqual(report.series, [
    { period: "2026-11-02", booked: 0, delivered: 0, revenue: "0.00" },
    { period: "2026-11-03", booked: 2, delivered: 0, revenue: "0.00" },
    { period: "2026-11-04", booked: 0, delivered: 0, revenue: "-100.00" },
  ]);
  assert.equal(report.currency, "BDT");
  assert.equal(report.generatedAt, NOW.toISOString());
});

test("CSV cells cannot run as spreadsheet formulas", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+1+1"), "'+1+1");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tcmd"), "'\tcmd");
  assert.equal(csvCell("-2+3"), "'-2+3");
  // Real numbers, including negative amounts, stay numeric.
  assert.equal(csvCell("-100.00"), "-100.00");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell("Rina, Dhaka"), "\"Rina, Dhaka\"");
  assert.equal(csvCell(null), "");
  assert.equal(toCsv([["a", 1], ["b", "x\ny"]]), "a,1\r\nb,\"x\ny\"\r\n");
});

test("the in-memory cache returns a stored report until it expires", async () => {
  let loads = 0;
  const load = async () => ({ loads: ++loads });
  const key = `test:${Math.random()}`;
  assert.deepEqual(await cached(key, 60, load), { value: { loads: 1 }, hit: false });
  assert.deepEqual(await cached(key, 60, load), { value: { loads: 1 }, hit: true });
  const expired = `test:${Math.random()}`;
  await cached(expired, 0, load);
  assert.equal((await cached(expired, 0, load)).hit, false);
});

test("only admins can read analytics, and cached reports are flagged", async () => {
  let loads = 0;
  const store = new Map();
  const deps = {
    now: () => NOW,
    cache: async (key, _ttl, load) => (store.has(key) ? { value: store.get(key), hit: true } : (store.set(key, await load()), { value: store.get(key), hit: false })),
    loadRaw: async () => { loads += 1; return emptyRaw; },
  };
  const input = { granularity: "day" };
  assert.equal((await getAnalytics(admin, input, deps)).cached, false);
  assert.equal((await getAnalytics(admin, input, deps)).cached, true);
  assert.equal(loads, 1);
  await assert.rejects(getAnalytics(customer, input, deps), (error) => error.status === 403);
  assert.equal(loads, 1);
});
