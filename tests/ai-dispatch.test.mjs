import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { AppError, RateLimitError } = await import("../lib/http/errors.ts");
const { dispatchSuggestionRequestSchema } = await import("../validators/ai.ts");
const scoring = await import("../lib/dispatch/scoring.ts");
const { suggestDispatch } = await import("../services/ai/dispatch-suggestions.service.ts");
const { DISPATCH_SCHEMA, DISPATCH_PROMPT_VERSION } = await import("../services/ai/prompts/dispatch.ts");
const { dispatchSourceNote, needsDispatch, waitingLabel } = await import("../features/admin/dispatch-contracts.ts");

const admin = { id: "cmadmin000000000000000001", email: "a@example.com", name: "Admin", role: "ADMIN" };
const courierUser = { id: "cmcourier00000000000000001", email: "c@example.com", name: "Kamal", role: "COURIER" };
const usage = { inputTokens: 500, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0 };

const dhaka = { id: "hub-dhaka", name: "Dhaka Central", zoneCode: "DHK" };
const gazipur = { id: "hub-gazipur", name: "Gazipur", zoneCode: "DHK" };
const ctg = { id: "hub-ctg", name: "Chattogram", zoneCode: "CTG" };

const shipment = {
  id: "cmship000000000000000000a1",
  trackingNumber: "EH-0123456789ABCDEF01234567",
  status: "CREATED",
  weightKg: 2.5,
  waitingHours: 5,
  originHub: dhaka,
  destinationHub: ctg,
};

const courier = (id, overrides = {}) => ({
  id,
  name: `Courier ${id}`,
  openShipments: 0,
  outForDelivery: 0,
  recentHubIds: [],
  recentZoneCodes: [],
  liveLocation: false,
  delivered30d: 0,
  failed30d: 0,
  ...overrides,
});

test("the request only accepts a shipment id", () => {
  assert.equal(dispatchSuggestionRequestSchema.safeParse({ shipmentId: shipment.id }).success, true);
  for (const body of [{}, { shipmentId: "x" }, { shipmentId: shipment.id, courierId: shipment.id }]) {
    assert.equal(dispatchSuggestionRequestSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("the output schema is strict at every level", () => {
  assert.equal(DISPATCH_SCHEMA.additionalProperties, false);
  assert.equal(DISPATCH_SCHEMA.properties.suggestions.items.additionalProperties, false);
  assert.deepEqual([...DISPATCH_SCHEMA.properties.suggestions.items.required].sort(), ["candidate", "reason"]);
});

test("area match prefers the origin hub, then the destination hub, then the zone", () => {
  assert.equal(scoring.hubMatchFor(shipment, { recentHubIds: ["hub-dhaka", "hub-ctg"], recentZoneCodes: [] }), "origin");
  assert.equal(scoring.hubMatchFor(shipment, { recentHubIds: ["hub-ctg"], recentZoneCodes: [] }), "destination");
  assert.equal(scoring.hubMatchFor(shipment, { recentHubIds: [gazipur.id], recentZoneCodes: ["DHK"] }), "zone");
  assert.equal(scoring.hubMatchFor(shipment, { recentHubIds: [], recentZoneCodes: ["SYL"] }), null);
  assert.equal(scoring.hubMatchFor({ originHub: null, destinationHub: null }, { recentHubIds: ["hub-dhaka"], recentZoneCodes: ["DHK"] }), null);
});

test("scores follow the documented weights", () => {
  // Free, origin hub, live, perfect record: 40 + 30 + 15 + 15.
  const best = scoring.factorsFor(shipment, courier("a", { recentHubIds: ["hub-dhaka"], liveLocation: true, delivered30d: 4 }));
  assert.equal(scoring.scoreFactors(best), 100);
  // No history is neutral (half reliability), no area match, not live: 40 + 7.5.
  assert.equal(scoring.scoreFactors(scoring.factorsFor(shipment, courier("b"))), 47.5);
  // Out-for-delivery counts 1.5x: 2 waiting + 2 on the road = load 5 of 8.
  const busy = scoring.factorsFor(shipment, courier("c", { openShipments: 4, outForDelivery: 2 }));
  assert.equal(busy.load, 5);
  assert.equal(scoring.scoreFactors(busy), 22.5);
  // Overloaded couriers get no capacity points, never negative ones.
  assert.equal(scoring.scoreFactors(scoring.factorsFor(shipment, courier("d", { openShipments: 20 }))), 7.5);
  assert.equal(scoring.factorsFor(shipment, courier("e", { delivered30d: 3, failed30d: 1 })).successRate, 0.75);
});

test("ranking is by score with stable tie-breaks", () => {
  const ranked = scoring.rankCouriers(shipment, [
    courier("z"),
    courier("y", { recentHubIds: ["hub-dhaka"] }),
    courier("x"),
    courier("w", { openShipments: 1, delivered30d: 2, recentZoneCodes: ["DHK"] }),
  ]);
  assert.deepEqual(ranked.map((candidate) => candidate.courierId), ["y", "w", "x", "z"]);
  // Equal scores: the lighter load, then more deliveries, then id.
  const tied = scoring.rankCouriers(shipment, [courier("b", { delivered30d: 0 }), courier("a", { delivered30d: 0 })]);
  assert.deepEqual(tied.map((candidate) => candidate.courierId), ["a", "b"]);
});

test("the model sees labels and figures, never names, emails or ids", () => {
  const ranked = scoring.rankCouriers(shipment, Array.from({ length: 10 }, (_, index) => courier(`cmcourier${index}`, { name: `Secret Name ${index}` })));
  const { prompt, byLabel } = scoring.pseudonymize(shipment, ranked);
  const text = JSON.stringify(prompt);
  assert.equal(prompt.candidates.length, scoring.MAX_AI_CANDIDATES);
  assert.deepEqual(prompt.candidates.map((candidate) => candidate.label), ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]);
  assert.equal(/Secret Name|cmcourier|@|EH-|cmship/.test(text), false, text);
  assert.equal(prompt.shipment.originHub, "Dhaka Central");
  assert.equal(byLabel.get("C1").courierId, ranked[0].courierId);
});

test("AI output is validated: known labels only, three at most, names mapped server-side", () => {
  const ranked = scoring.rankCouriers(shipment, ["a", "b", "c", "d"].map((id) => courier(id, { name: `Name ${id}` })));
  const { byLabel } = scoring.pseudonymize(shipment, ranked);
  const out = scoring.validateAiSuggestions({
    suggestions: [
      { candidate: "C9", reason: "Unknown label is dropped." },
      { candidate: "c2", reason: "**C2** has no open work, unlike C3." },
      { candidate: "C2", reason: "Duplicate is dropped." },
      { candidate: "C1", reason: "Better than C7 here." },
      { candidate: "C1 ", reason: "" },
      { candidate: "C3", reason: "Close to the hub." },
      { candidate: "C4", reason: "A fourth pick is cut." },
    ],
  }, byLabel);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((suggestion) => suggestion.courierId), [byLabel.get("C2").courierId, byLabel.get("C3").courierId, byLabel.get("C4").courierId]);
  // Labels in reasons become names, and markdown is stripped.
  assert.equal(out[0].reason, `${byLabel.get("C2").name} has no open work, unlike ${byLabel.get("C3").name}.`);
  // A reason that mentions an unknown label was rejected (the C1 entry citing C7).
  assert.equal(out.some((suggestion) => suggestion.courierId === byLabel.get("C1").courierId), false);
  assert.ok(scoring.validateAiSuggestions({ suggestions: [{ candidate: "C1", reason: "x".repeat(400) }] }, byLabel)[0].reason.length <= 160);
  assert.deepEqual(scoring.validateAiSuggestions(null, byLabel), []);
  assert.deepEqual(scoring.validateAiSuggestions({ suggestions: "C1" }, byLabel), []);
});

test("rule-based reasons only state facts from the factors", () => {
  const ranked = scoring.rankCouriers(shipment, [courier("a", { openShipments: 1, recentHubIds: ["hub-dhaka"], liveLocation: true, delivered30d: 9, failed30d: 1 })]);
  const [suggestion] = scoring.rulesSuggestions(shipment, ranked);
  assert.equal(suggestion.reason, "1 open shipment · works the Dhaka Central hub · sharing a live location · 90% delivered in 30 days");
  assert.equal(scoring.rulesReason(scoring.factorsFor(shipment, courier("b")), shipment), "No open shipments");
});

function harness({ model = "gemini-3.1-flash-lite", output, refused = false, throws, limited, couriers } = {}) {
  const calls = { generate: [], audits: [], failures: [] };
  const list = couriers ?? ["a", "b", "c", "d"].map((id) => courier(id, { name: `Name ${id}` }));
  const deps = {
    model,
    async loadContext() { return { shipment, couriers: list }; },
    async beforeGenerate() { if (limited) throw limited; },
    async generateJson(request) {
      calls.generate.push(request);
      if (throws) throw throws;
      return { text: typeof output === "string" ? output : JSON.stringify(output), usage, stopReason: refused ? "SAFETY" : "STOP", refused };
    },
    async audit(_actor, details) { calls.audits.push(details); },
    async auditFailure(_actor, details) { calls.failures.push(details); },
  };
  return { deps, calls };
}

test("AI picks are returned and audited with labels, not names", async () => {
  const { deps, calls } = harness({ output: { suggestions: [{ candidate: "C2", reason: "C2 is free." }] } });
  const result = await suggestDispatch(admin, shipment.id, deps);
  assert.equal(result.source, "ai");
  assert.equal(result.notice, null);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].reason, `${result.suggestions[0].name} is free.`);
  assert.match(calls.generate[0].user, /^<dispatch_data>\n/);
  assert.equal(/Name [abcd]/.test(calls.generate[0].user), false);
  assert.equal(calls.audits[0].promptVersion, DISPATCH_PROMPT_VERSION);
  assert.deepEqual(calls.audits[0].chosenLabels, ["C2"]);
  assert.equal(JSON.stringify(calls.audits[0]).includes("Name "), false);
});

test("AI off, rate limits and bad or refused output fall back to the rule-based top three", async () => {
  const off = harness({ model: null });
  const disabled = await suggestDispatch(admin, shipment.id, off.deps);
  assert.equal(disabled.source, "rules");
  assert.equal(disabled.notice, "AI_DISABLED");
  assert.equal(disabled.suggestions.length, 3);
  assert.equal(off.calls.generate.length, 0);

  const limited = await suggestDispatch(admin, shipment.id, harness({ limited: new RateLimitError(Date.now() + 1000) }).deps);
  assert.equal(limited.notice, "AI_RATE_LIMITED");
  const limiterDown = await suggestDispatch(admin, shipment.id, harness({ limited: new AppError(503, "down", "RATE_LIMIT_UNAVAILABLE") }).deps);
  assert.equal(limiterDown.notice, "AI_FAILED");

  for (const options of [{ output: "not json" }, { output: { suggestions: [{ candidate: "C42", reason: "x" }] } }, { refused: true, output: {} }, { throws: new AppError(503, "busy", "AI_BUSY") }]) {
    const { deps, calls } = harness(options);
    const result = await suggestDispatch(admin, shipment.id, deps);
    assert.equal(result.source, "rules", JSON.stringify(options));
    assert.equal(result.notice, "AI_FAILED");
    assert.equal(result.suggestions.length, 3);
    assert.equal(calls.failures.length, 1);
  }
});

test("no couriers means no suggestions, and only admins can ask", async () => {
  const empty = await suggestDispatch(admin, shipment.id, harness({ couriers: [] }).deps);
  assert.deepEqual(empty.suggestions, []);
  await assert.rejects(suggestDispatch(courierUser, shipment.id, harness().deps), (error) => error instanceof AppError && error.status === 403);
});

test("dashboard helpers explain the source and pick waiting shipments", () => {
  assert.match(dispatchSourceNote({ source: "ai", notice: null, model: "m" }), /Ranked by AI \(m\)/);
  assert.match(dispatchSourceNote({ source: "rules", notice: "AI_DISABLED", model: null }), /AI is not enabled/);
  assert.match(dispatchSourceNote({ source: "rules", notice: "AI_FAILED", model: null }), /AI unavailable/);
  assert.equal(needsDispatch({ status: "CREATED", paymentStatus: "PAID", courierId: null }), true);
  assert.equal(needsDispatch({ status: "FAILED", paymentStatus: "PAID", courierId: null }), true);
  assert.equal(needsDispatch({ status: "CREATED", paymentStatus: "PENDING", courierId: null }), false);
  assert.equal(needsDispatch({ status: "CREATED", paymentStatus: "PAID", courierId: "c" }), false);
  assert.equal(needsDispatch({ status: "IN_TRANSIT", paymentStatus: "PAID", courierId: null }), false);
  assert.equal(waitingLabel(0), "Waiting under an hour");
  assert.equal(waitingLabel(5), "Waiting 5h");
  assert.equal(waitingLabel(72), "Waiting 3 days");
});
