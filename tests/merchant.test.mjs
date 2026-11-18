import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

const keys = await import("../lib/merchant/api-keys.ts");
const { encryptSecret, decryptSecret, webhookEncryptionKey } = await import("../lib/merchant/secret-box.ts");
const signing = await import("../lib/merchant/webhook-signature.ts");
const { classifyAddress, parseWebhookUrl, resolvePublicAddress, safePost, UnsafeUrlError } = await import("../lib/net/safe-url.ts");
const { dispatchWebhooks, MAX_WEBHOOK_ATTEMPTS, CLAIM_LEASE_MS } = await import("../services/webhooks/dispatch.ts");
const { webhookEventsFor, webhookEventId, shipmentWebhookData, webhookEnvelope } = await import("../services/webhooks/events.ts");
const { retryDelayMs } = await import("../services/notifications/dispatch.ts");
const { createApiKeySchema, createWebhookSchema, updateWebhookSchema, listDeliveriesSchema } = await import("../validators/developer.ts");

test("API keys have the documented format, are stored only as a hash and compare in constant time", () => {
  const { key, prefix, hash } = keys.generateApiKey();
  assert.match(key, /^eh_live_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  assert.equal(keys.parseApiKey(key).prefix, prefix);
  assert.equal(hash, keys.hashApiKey(key));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes(key), false);
  assert.equal(keys.apiKeyHashMatches(key, hash), true);
  assert.equal(keys.apiKeyHashMatches(`${key.slice(0, -1)}A`, hash), false);
  assert.equal(keys.apiKeyHashMatches(key, "abcd"), false);
  assert.notEqual(keys.generateApiKey().key, key);
  for (const bad of ["eh_live_short", "eh_live_ABCDEFGH_" + "a".repeat(43), "eh_test_abcdefgh_" + "a".repeat(43), `${key}x`]) {
    assert.equal(keys.parseApiKey(bad), null, bad);
  }
  assert.equal(keys.looksLikeApiKey(key), true);
  assert.equal(keys.looksLikeApiKey("eyJhbGciOi.jwt.token"), false);
});

test("API keys are allowed only on listed routes with the matching scope", () => {
  const scope = keys.apiKeyScopeFor;
  assert.equal(scope("GET", "/api/v1/shipments"), "shipments:read");
  assert.equal(scope("HEAD", "/api/v1/shipments"), "shipments:read");
  assert.equal(scope("GET", "/api/v1/shipments/cmabc123"), "shipments:read");
  assert.equal(scope("POST", "/api/v1/shipments"), "shipments:write");
  assert.equal(scope("PATCH", "/api/v1/shipments/cmabc123/status"), "shipments:write");
  assert.equal(scope("POST", "/api/v1/developer/webhooks"), "webhooks:manage");
  assert.equal(scope("POST", "/api/v1/developer/webhooks/cm1/deliveries/cm2/retry"), "webhooks:manage");
  // Never reachable with a key: key management, auth, profile, payments, AI, admin and courier routes.
  for (const [method, path] of [
    ["GET", "/api/v1/developer/api-keys"], ["POST", "/api/v1/developer/api-keys"], ["DELETE", "/api/v1/developer/api-keys/cm1"],
    ["POST", "/api/v1/auth/refresh-token"], ["GET", "/api/v1/users/me"], ["PATCH", "/api/v1/users/me"],
    ["POST", "/api/v1/payments/initiate"], ["POST", "/api/v1/payments/cm1/refund"], ["POST", "/api/v1/ai/assistant"],
    ["GET", "/api/v1/admin/analytics"], ["POST", "/api/v1/shipments/cm1/assign-courier"], ["POST", "/api/v1/shipments/cm1/proof"],
    ["GET", "/api/v1/courier/stats"], ["DELETE", "/api/v1/shipments/cm1"], ["GET", "/api/v1/shipments/cm1/proof/photo"],
    ["GET", "/api/v1/shipments/cm1/status"], ["GET", "/api/v1/shipmentsX"], ["GET", "/api/v2/shipments"],
  ]) {
    assert.equal(scope(method, path), null, `${method} ${path}`);
  }
});

test("signing secrets are encrypted at rest with AES-256-GCM and tampering is detected", () => {
  const key = randomBytes(32);
  const sealed = encryptSecret("whsec_example", key);
  assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(sealed.includes("whsec_example"), false);
  assert.notEqual(encryptSecret("whsec_example", key), sealed);
  assert.equal(decryptSecret(sealed, key), "whsec_example");
  assert.throws(() => decryptSecret(sealed, randomBytes(32)));
  const parts = sealed.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSecret(parts.join("."), key));
  assert.throws(() => decryptSecret("v2.a.b.c", key), /Unsupported/);

  assert.equal(webhookEncryptionKey({}), null);
  assert.equal(webhookEncryptionKey({ WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }), null);
  assert.equal(webhookEncryptionKey({ WEBHOOK_ENCRYPTION_KEY: key.toString("base64") }).equals(key), true);
});

test("webhook signatures match a published test vector and verify like a receiver would", () => {
  const body = '{"id":"evt_1","type":"webhook.test"}';
  // Computed independently: printf '1700000000.<body>' | openssl dgst -sha256 -hmac whsec_test_secret
  const expected = "300fe9a62e4c5c166d1ecf49f67cd28c64436b147d91784ac110bd597486ec23";
  assert.equal(signing.webhookSignature("whsec_test_secret", 1700000000, body), expected);
  const header = signing.signatureHeader("whsec_test_secret", 1700000000, body);
  assert.equal(header, `t=1700000000,v1=${expected}`);
  assert.equal(signing.verifyWebhookSignature("whsec_test_secret", header, body, 1700000100), true);
  assert.equal(signing.verifyWebhookSignature("whsec_other", header, body, 1700000100), false);
  assert.equal(signing.verifyWebhookSignature("whsec_test_secret", header, `${body} `, 1700000100), false);
  // Replays outside the five-minute tolerance are rejected.
  assert.equal(signing.verifyWebhookSignature("whsec_test_secret", header, body, 1700000000 + 301), false);
  assert.equal(signing.verifyWebhookSignature("whsec_test_secret", null, body), false);
  assert.equal(signing.verifyWebhookSignature("whsec_test_secret", "t=abc,v1=00", body), false);
  assert.match(signing.generateSigningSecret(), /^whsec_[A-Za-z0-9_-]{43}$/);
});

test("private, reserved and special-purpose addresses are blocked; public ones are allowed", () => {
  const blockedAddresses = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.8", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.250",
    "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "::127.0.0.1",
    "64:ff9b::10.0.0.1", "64:ff9b::a00:1", "64:ff9b:1::1", "2002:7f00:1::", "2002:c0a8:101::1", "2001::1", "2001:db8::1",
    "2001:10::1", "2001:20::1", "100::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1", "[::1]",
    "3fff::1", "4000::1",
  ];
  for (const address of blockedAddresses) assert.equal(classifyAddress(address).allowed, false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255",
    "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"]) {
    assert.equal(classifyAddress(address).allowed, true, address);
  }
  assert.equal(classifyAddress("example.com").allowed, false);
  assert.equal(classifyAddress("1.2.3").allowed, false);
});

test("webhook URLs must be https on port 443 with a public host, including numeric IPv4 tricks", () => {
  assert.equal(parseWebhookUrl("https://hooks.example.com/expresshub?x=1").hostname, "hooks.example.com");
  assert.equal(parseWebhookUrl("https://hooks.example.com:443/x").port, "");
  for (const bad of [
    "http://hooks.example.com/x", "ftp://hooks.example.com", "https://user:pass@hooks.example.com", "https://hooks.example.com:8443",
    "https://hooks.example.com/#frag", "https://localhost/x", "https://api.localhost", "https://printer.local", "https://db.internal",
    "https://intranet", "https://127.0.0.1", "https://2130706433/", "https://0x7f.1/", "https://017700000001/", "https://0177.0.0.1/",
    "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://169.254.169.254/latest/meta-data", "not a url",
    `https://example.com/${"a".repeat(2100)}`,
  ]) {
    assert.throws(() => parseWebhookUrl(bad), UnsafeUrlError, bad);
  }
});

test("every resolved address must be public, and the pinned address is the one returned", async () => {
  const url = new URL("https://hooks.example.com/x");
  const resolver = (addresses) => async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  assert.deepEqual(await resolvePublicAddress(url, resolver(["93.184.216.34", "2606:2800:220:1::1"])), { address: "93.184.216.34", family: 4 });
  await assert.rejects(resolvePublicAddress(url, resolver(["93.184.216.34", "10.0.0.5"])), UnsafeUrlError);
  await assert.rejects(resolvePublicAddress(url, resolver(["::ffff:192.168.0.1"])), UnsafeUrlError);
  await assert.rejects(resolvePublicAddress(url, resolver([])), /could not be resolved/);
  await assert.rejects(resolvePublicAddress(url, async () => { throw new Error("ENOTFOUND"); }), /could not be resolved/);
  // safePost vets before connecting: a name that resolves to loopback never gets a socket.
  await assert.rejects(safePost("https://hooks.example.com/x", "{}", {}, { resolve: resolver(["127.0.0.1"]) }), UnsafeUrlError);
  await assert.rejects(safePost("http://hooks.example.com/x", "{}", {}), UnsafeUrlError);
});

test("shipment events map to webhook events with stable ids and only safe shipment fields", () => {
  assert.deepEqual(webhookEventsFor("CREATED", "CREATED"), ["shipment.created"]);
  assert.deepEqual(webhookEventsFor("STATUS_CHANGED", "IN_TRANSIT"), ["shipment.status_changed"]);
  assert.deepEqual(webhookEventsFor("STATUS_CHANGED", "DELIVERED"), ["shipment.status_changed", "shipment.delivered"]);
  assert.deepEqual(webhookEventsFor("CUSTOMER_CANCELLED", "CANCELLED"), ["shipment.status_changed"]);
  assert.deepEqual(webhookEventsFor("COURIER_ASSIGNED", "CREATED"), []);
  assert.equal(webhookEventId("cmevent1", "shipment.delivered"), "evt_cmevent1_delivered");
  assert.equal(webhookEventId("cmevent1", "shipment.status_changed"), "evt_cmevent1_status_changed");

  const at = new Date("2026-11-19T05:00:00Z");
  const data = shipmentWebhookData({
    id: "cmship", trackingNumber: "EH-0123456789ABCDEF01234567", status: "DELIVERED", paymentStatus: "PAID",
    price: { toString: () => "150" }, currency: "BDT", createdAt: at, updatedAt: at, deliveredAt: at,
    pickupContactPhone: "01700000000", deliveryAddress: "House 1", courierId: "cmcourier",
  }, "OUT_FOR_DELIVERY");
  assert.deepEqual(Object.keys(data.shipment).sort(), [
    "createdAt", "currency", "deliveredAt", "id", "paymentStatus", "previousStatus", "price", "status", "trackingNumber", "updatedAt",
  ]);
  assert.equal(JSON.stringify(data).includes("01700000000"), false);
  assert.deepEqual(webhookEnvelope("evt_1", "shipment.delivered", at, data), { id: "evt_1", type: "shipment.delivered", createdAt: at.toISOString(), data });
});

const NOW = new Date("2026-11-19T06:00:00Z");
const ENDPOINT = { url: "https://hooks.example.com/expresshub", active: true, secret: "whsec_test_secret" };

function harness({ claimed, endpoint = () => ENDPOINT, post = async () => ({ status: 200 }) } = {}) {
  const calls = { posts: [], sent: [], failed: [], claim: null };
  const deps = {
    now: () => NOW,
    random: () => 0.5,
    async claim(limit, now, leaseUntil) { calls.claim = { limit, now, leaseUntil }; return claimed; },
    async loadEndpoint(id) { return endpoint(id); },
    async post(url, body, headers) { calls.posts.push({ url, body, headers }); return post(url, body, headers); },
    async markSent(id, update) { calls.sent.push({ id, ...update }); },
    async markFailed(id, update) { calls.failed.push({ id, ...update }); },
  };
  return { deps, calls };
}

const delivery = (overrides = {}) => ({
  id: "cmdelivery1", endpointId: "cmendpoint1", eventId: "evt_cm1_created", eventType: "shipment.created", attempts: 1,
  payload: { id: "evt_cm1_created", type: "shipment.created", data: { shipment: { id: "cm1" } } }, ...overrides,
});

test("a claimed delivery is signed over the exact body sent and marked sent on 2xx", async () => {
  const { deps, calls } = harness({ claimed: [delivery()] });
  const summary = await dispatchWebhooks(deps, 7);
  assert.deepEqual(summary, { claimed: 1, sent: 1, retrying: 0, dead: 0 });
  assert.deepEqual(calls.claim, { limit: 7, now: NOW, leaseUntil: new Date(NOW.getTime() + CLAIM_LEASE_MS) });
  const [{ url, body, headers }] = calls.posts;
  assert.equal(url, ENDPOINT.url);
  assert.equal(body, JSON.stringify(delivery().payload));
  assert.equal(headers["ExpressHub-Event-Id"], "evt_cm1_created");
  assert.equal(headers["ExpressHub-Event-Type"], "shipment.created");
  assert.equal(signing.verifyWebhookSignature(ENDPOINT.secret, headers["ExpressHub-Signature"], body, NOW.getTime() / 1000), true);
  assert.deepEqual(calls.sent, [{ id: "cmdelivery1", now: NOW, statusCode: 200 }]);
});

test("failures back off with jitter and become dead after the last attempt", async () => {
  const failing = harness({ claimed: [delivery({ attempts: 2 })], post: async () => ({ status: 500 }) });
  assert.deepEqual(await dispatchWebhooks(failing.deps), { claimed: 1, sent: 0, retrying: 1, dead: 0 });
  assert.equal(failing.calls.failed[0].dead, false);
  assert.equal(failing.calls.failed[0].statusCode, 500);
  assert.equal(failing.calls.failed[0].nextAttemptAt.getTime(), NOW.getTime() + retryDelayMs(2, () => 0.5));

  const last = harness({ claimed: [delivery({ attempts: MAX_WEBHOOK_ATTEMPTS })], post: async () => { throw new Error("Connection failed: ECONNRESET"); } });
  assert.deepEqual(await dispatchWebhooks(last.deps), { claimed: 1, sent: 0, retrying: 0, dead: 1 });
  assert.match(last.calls.failed[0].error, /ECONNRESET/);
  assert.equal(MAX_WEBHOOK_ATTEMPTS, 8);
});

test("redirects, 410, unsafe addresses and disabled endpoints are not retried forever", async () => {
  const redirect = harness({ claimed: [delivery()], post: async () => ({ status: 302 }) });
  await dispatchWebhooks(redirect.deps);
  assert.match(redirect.calls.failed[0].error, /Redirects are not followed/);
  assert.equal(redirect.calls.failed[0].dead, false);

  const gone = harness({ claimed: [delivery()], post: async () => ({ status: 410 }) });
  await dispatchWebhooks(gone.deps);
  assert.equal(gone.calls.failed[0].dead, true);

  const rebinding = harness({ claimed: [delivery()], post: async () => { throw new UnsafeUrlError("Host resolves to a IPv4 loopback address"); } });
  await dispatchWebhooks(rebinding.deps);
  assert.equal(rebinding.calls.failed[0].dead, true);

  for (const endpoint of [() => null, () => ({ ...ENDPOINT, active: false })]) {
    const disabled = harness({ claimed: [delivery()], endpoint });
    assert.deepEqual(await dispatchWebhooks(disabled.deps), { claimed: 1, sent: 0, retrying: 0, dead: 1 });
    assert.equal(disabled.calls.posts.length, 0);
  }
});

test("request bodies are validated strictly", () => {
  assert.deepEqual(createApiKeySchema.parse({ name: " CI ", scopes: ["shipments:read"] }), { name: "CI", scopes: ["shipments:read"], expiresInDays: null });
  for (const body of [
    { name: "", scopes: ["shipments:read"] }, { name: "x", scopes: [] }, { name: "x", scopes: ["admin:all"] },
    { name: "x", scopes: ["shipments:read", "shipments:read"] }, { name: "x", scopes: ["shipments:read"], expiresInDays: 7 },
    { name: "x", scopes: ["shipments:read"], userId: "cm1" },
  ]) {
    assert.equal(createApiKeySchema.safeParse(body).success, false, JSON.stringify(body));
  }
  assert.equal(createWebhookSchema.safeParse({ url: "https://a.example.com", events: ["shipment.created"] }).success, true);
  assert.equal(createWebhookSchema.safeParse({ url: "https://a.example.com", events: ["webhook.test"] }).success, false);
  assert.equal(updateWebhookSchema.safeParse({}).success, false);
  assert.equal(updateWebhookSchema.safeParse({ active: false }).success, true);
  assert.equal(listDeliveriesSchema.safeParse({ status: "DEAD" }).success, true);
  assert.equal(listDeliveriesSchema.safeParse({ status: "LOST" }).success, false);
});
