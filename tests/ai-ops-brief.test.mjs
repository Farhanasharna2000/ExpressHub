import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { AppError } = await import("../lib/http/errors.ts");
const { opsBriefRequestSchema } = await import("../validators/ai.ts");
const {
  bangladeshDay, factsForModel, generateOpsBrief, getCachedBrief, parseBrief, readCachedBrief, unverifiedNumbers,
} = await import("../services/ai/ops-brief.service.ts");
const { OPS_BRIEF_SCHEMA, OPS_BRIEF_PROMPT_VERSION } = await import("../services/ai/prompts/ops-brief.ts");
const { bangladeshDate, briefFigures, briefShipments, latestBrief } = await import("../features/ai/contracts.ts");

const admin = { id: "cmadmin000000000000000001", email: "a@example.com", name: "Admin", role: "ADMIN" };
const customer = { id: "cmcustomer0000000000000001", email: "c@example.com", name: "Rina", role: "CUSTOMER" };
const NOW = new Date("2026-11-16T03:30:00Z"); // 9:30 AM in Bangladesh
const TRACK_A = "EH-0123456789ABCDEF01234567";
const TRACK_B = "EH-FEDCBA987654321000000000";
const usage = { inputTokens: 900, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0 };

const facts = {
  day: "2026-11-16",
  delayThresholdHours: 48,
  shipments: { total: 40, active: 12, byStatus: { CREATED: 5, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 1, DELIVERED: 20, FAILED: 1, RETURNED: 3, CANCELLED: 5 } },
  today: { created: 6, delivered: 2, failed: 1 },
  failed: { count: 1, recent: [{ id: "cmship000000000000000000a1", trackingNumber: TRACK_A, status: "FAILED", hoursSinceUpdate: 3 }] },
  delayed: { count: 2, oldest: [{ id: "cmship000000000000000000b1", trackingNumber: TRACK_B, status: "IN_TRANSIT", hoursSinceUpdate: 71 }] },
  unassignedPaid: { count: 4, oldest: [{ id: "cmship000000000000000000b1", trackingNumber: TRACK_B, status: "CREATED", hoursSinceUpdate: 71 }] },
  payments: { pending: 7, paid: 25, failed: 0 },
  couriers: { active: 9 },
};

const goodBrief = {
  headline: "4 paid shipments are waiting for a courier.",
  summary: `6 shipments were booked today and 2 delivered. 1 delivery failed (${TRACK_A}) and 2 shipments have had no update for over 48 hours.`,
  actions: [
    { title: "Assign couriers", detail: "4 paid shipments have no courier; 9 couriers are active." },
    { title: "Follow up the failed delivery", detail: `${TRACK_A} failed 3 hours ago.` },
  ],
};

function harness({ output = goodBrief, cached = null, refused = false, throws, limited } = {}) {
  const calls = { generate: [], saved: [], failures: [], limited: 0, loads: 0 };
  const deps = {
    model: "gemini-3.5-flash-lite",
    now: () => NOW,
    async loadFacts(_actor, now, day) {
      calls.loads += 1;
      assert.equal(now, NOW);
      assert.equal(day.label, "2026-11-16");
      return facts;
    },
    async findCached(actor, dayStart) {
      calls.findCached = { actor: actor.id, dayStart };
      return cached;
    },
    async beforeGenerate() {
      calls.limited += 1;
      if (limited) throw limited;
    },
    async generateJson(request) {
      calls.generate.push(request);
      if (throws) throw throws;
      return { text: typeof output === "string" ? output : JSON.stringify(output), usage, stopReason: refused ? "SAFETY" : "STOP", refused };
    },
    async save(actor, record) { calls.saved.push({ actor: actor.id, record }); },
    async auditFailure(actor, details) { calls.failures.push({ actor: actor.id, details }); },
  };
  return { deps, calls };
}

test("request body only accepts an optional refresh flag", () => {
  assert.deepEqual(opsBriefRequestSchema.parse({}), { refresh: false });
  assert.deepEqual(opsBriefRequestSchema.parse({ refresh: true }), { refresh: true });
  for (const body of [{ refresh: "yes" }, { refresh: true, extra: 1 }]) {
    assert.equal(opsBriefRequestSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("the output schema is strict at every level", () => {
  assert.equal(OPS_BRIEF_SCHEMA.additionalProperties, false);
  assert.deepEqual([...OPS_BRIEF_SCHEMA.required].sort(), ["actions", "headline", "summary"]);
  assert.equal(OPS_BRIEF_SCHEMA.properties.actions.items.additionalProperties, false);
});

test("the Bangladesh day starts at local midnight", () => {
  assert.deepEqual(bangladeshDay(new Date("2026-11-16T03:30:00Z")), { start: new Date("2026-11-15T18:00:00Z"), label: "2026-11-16" });
  // 11:30 PM UTC is already the next day in Dhaka.
  assert.equal(bangladeshDay(new Date("2026-11-16T18:30:00Z")).label, "2026-11-17");
  assert.equal(bangladeshDay(new Date("2026-11-16T17:59:59Z")).label, "2026-11-16");
});

test("a new brief is generated from the figures, saved and returned", async () => {
  const { deps, calls } = harness();
  const result = await generateOpsBrief(admin, { refresh: false }, deps);
  assert.equal(result.cached, false);
  assert.equal(result.brief.headline, goodBrief.headline);
  assert.equal(result.brief.actions.length, 2);
  assert.deepEqual(result.brief.unverified, []);
  assert.equal(result.generatedAt, NOW.toISOString());
  assert.equal(calls.limited, 1);
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.saved[0].record.promptVersion, OPS_BRIEF_PROMPT_VERSION);
  assert.deepEqual(calls.saved[0].record.facts, facts);
  assert.deepEqual(calls.findCached.dayStart, new Date("2026-11-15T18:00:00Z"));
});

test("the model sees figures and tracking numbers but no internal IDs", async () => {
  const { deps, calls } = harness();
  await generateOpsBrief(admin, { refresh: false }, deps);
  const { user, system } = calls.generate[0];
  assert.match(system, /Use only the figures in the data/);
  assert.match(user, /^<operations_data>\n/);
  assert.ok(user.includes(TRACK_A));
  assert.equal(user.includes("cmship"), false);
  assert.equal(JSON.stringify(factsForModel(facts)).includes("cmship"), false);
});

test("today's saved brief is returned without calling the model or the rate limiter", async () => {
  const saved = { day: "2026-11-16", model: "gemini-3.5-flash-lite", generatedAt: "2026-11-16T02:00:00.000Z", brief: { ...goodBrief, unverified: [] }, facts, promptVersion: "ops-brief-v1", usage };
  const { deps, calls } = harness({ cached: saved });
  const result = await generateOpsBrief(admin, { refresh: false }, deps);
  assert.equal(result.cached, true);
  assert.equal(result.generatedAt, saved.generatedAt);
  assert.equal(calls.generate.length, 0);
  assert.equal(calls.limited, 0);
  assert.equal(calls.loads, 0);

  const read = await getCachedBrief(admin, deps);
  assert.equal(read.cached, true);
});

test("refresh generates a new brief even when one is saved", async () => {
  const saved = { day: "2026-11-16", model: "m", generatedAt: "2026-11-16T02:00:00.000Z", brief: { ...goodBrief, unverified: [] }, facts };
  const { deps, calls } = harness({ cached: saved });
  const result = await generateOpsBrief(admin, { refresh: true }, deps);
  assert.equal(result.cached, false);
  assert.equal(calls.generate.length, 1);
  assert.equal(calls.limited, 1);
});

test("a saved brief from another day or with a broken shape is ignored", () => {
  const saved = { day: "2026-11-15", model: "m", generatedAt: "2026-11-15T02:00:00.000Z", brief: { ...goodBrief, unverified: [] }, facts };
  assert.equal(readCachedBrief(saved, "2026-11-16"), null);
  assert.equal(readCachedBrief({ ...saved, day: "2026-11-16", brief: { headline: "x" } }, "2026-11-16"), null);
  assert.equal(readCachedBrief(null, "2026-11-16"), null);
});

test("numbers that are not in the figures are flagged, tracking numbers are not", () => {
  assert.deepEqual(unverifiedNumbers(goodBrief.summary, facts), []);
  assert.deepEqual(unverifiedNumbers("Delivery rate is 50% and 13 parcels are late", facts), ["50", "13"]);
  assert.deepEqual(unverifiedNumbers(`Check ${TRACK_B} now`, facts), []);
  // Invented tracking numbers and numbers with a unit attached are caught too.
  assert.deepEqual(unverifiedNumbers("Follow up EH-FFFFFFFFFFFFFFFFFFFFFFFF today", facts), ["EH-FFFFFFFFFFFFFFFFFFFFFFFF"]);
  assert.deepEqual(unverifiedNumbers("stuck for 999h, 3x more, 71h old, 48h threshold", facts), ["999"]);
  // Digits inside tracking numbers and the date label are not accepted as figures.
  assert.deepEqual(unverifiedNumbers("about 0123456789 items in 2026", facts), ["0123456789", "2026"]);
  assert.deepEqual(unverifiedNumbers("12,345,678 parcels", facts), ["12,345,678"]);
  const brief = parseBrief(JSON.stringify({ ...goodBrief, summary: "17 shipments failed today." }), facts);
  assert.deepEqual(brief.unverified, ["17"]);
});

test("output is trimmed, plain and limited to four actions", () => {
  const brief = parseBrief(JSON.stringify({
    headline: "  All   clear  ",
    summary: "Operations look on track.",
    actions: [1, 2, 3, 4, 5, 6].map(() => ({ title: "Check", detail: "4 shipments" })).concat([{ title: "", detail: "dropped" }]),
  }), facts);
  assert.equal(brief.headline, "All clear");
  assert.equal(brief.actions.length, 4);
});

test("unreadable, empty or refused output is a retryable provider error and is audited", async () => {
  for (const options of [{ output: "not json" }, { output: { headline: "", summary: "", actions: [] } }, { refused: true }]) {
    const { deps, calls } = harness(options);
    await assert.rejects(generateOpsBrief(admin, { refresh: false }, deps), (error) => error instanceof AppError && error.code === "AI_UPSTREAM_ERROR");
    assert.equal(calls.saved.length, 0);
    assert.equal(calls.failures.length, 1);
    assert.equal(calls.failures[0].details.code, "AI_UPSTREAM_ERROR");
  }
});

test("invalid figures become a server error, are audited and never reach the model", async () => {
  const { deps, calls } = harness();
  deps.loadFacts = async () => ({ day: "2026-11-16" });
  await assert.rejects(generateOpsBrief(admin, { refresh: false }, deps), (error) => error instanceof AppError && error.status === 500 && error.code === "OPS_FACTS_INVALID");
  assert.equal(calls.generate.length, 0);
  assert.equal(calls.failures[0].details.code, "OPS_FACTS_INVALID");
});

test("provider and rate limit errors pass through; only admins can use the brief", async () => {
  const busy = new AppError(503, "busy", "AI_BUSY");
  const busyRun = harness({ throws: busy });
  await assert.rejects(generateOpsBrief(admin, { refresh: false }, busyRun.deps), busy);
  assert.equal(busyRun.calls.failures[0].details.code, "AI_BUSY");

  const limited = new AppError(429, "slow down", "RATE_LIMITED");
  const limitedRun = harness({ limited });
  await assert.rejects(generateOpsBrief(admin, { refresh: false }, limitedRun.deps), limited);
  assert.equal(limitedRun.calls.generate.length, 0);

  const { deps, calls } = harness();
  await assert.rejects(generateOpsBrief(customer, { refresh: false }, deps), (error) => error.status === 403);
  await assert.rejects(getCachedBrief(customer, deps), (error) => error.status === 403);
  assert.equal(calls.generate.length, 0);
});

test("dashboard helpers order figures and shipments by urgency without repeats", () => {
  const figures = briefFigures(facts);
  assert.equal(figures[0].label, "Paid, no courier");
  assert.equal(figures[0].alert, true);
  assert.equal(figures.find((figure) => figure.label === "No update in 48h").value, 2);
  const shipments = briefShipments(facts);
  assert.deepEqual(shipments.map((shipment) => shipment.reason), ["Needs a courier", "Failed"]);
  const older = { day: "2026-11-16", generatedAt: "2026-11-16T01:00:00.000Z" };
  const newer = { day: "2026-11-16", generatedAt: "2026-11-16T05:00:00.000Z" };
  assert.equal(latestBrief("2026-11-16", older, newer), newer);
  assert.equal(latestBrief("2026-11-16", null, undefined), null);
  // After midnight an open page drops yesterday's brief instead of showing it as current.
  assert.equal(latestBrief("2026-11-17", newer, null), null);
  assert.equal(bangladeshDate(new Date("2026-11-16T18:30:00Z")), "2026-11-17");
});
