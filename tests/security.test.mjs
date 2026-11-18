import "./helpers/typescript.mjs";
import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";

// Model backend responses, including Upstash's timeout-success result, without network calls.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@upstash/ratelimit") return { shortCircuit: true, url: 'data:text/javascript,export class Ratelimit { static slidingWindow() {} async limit() { return globalThis.testRateBackend(); } }' };
  return next(specifier, context);
} });
process.env.NODE_ENV = "test";
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";
process.env.JWT_ACCESS_SECRET = "test-secret-with-at-least-thirty-two-characters";
process.env.ALLOWED_ORIGIN = "http://localhost:3000";
let reads = 0;
globalThis.prisma = { user: { async findFirst() { reads++; return { id: "test-user", role: "CUSTOMER", name: "Test", email: "test@example.com" }; } } };
const { limitApiRequests, getRateLimitIdentifier } = await import("../lib/rate-limit.ts");
const { requireUser } = await import("../lib/auth/require-user.ts");
const { accountRateLimitKey, checkAuthRateLimit, refreshTokenRateLimitKey } = await import("../lib/auth/route-helpers.ts");
const { signAccessToken } = await import("../lib/auth/tokens.ts");
const { errorResponse } = await import("../lib/http/responses.ts");
const { proxy } = await import("../proxy.ts");
const { default: config } = await import("../next.config.ts");
const request = (headers, method = "GET") => new NextRequest("http://localhost:3000/api/v1/users/me", { method, headers });

test("CORS rejects foreign actual requests and restricts preflight methods/headers", () => {
  for (const method of ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) assert.equal(proxy(request({ origin: "https://foreign.example" }, method)).status, 403);
  assert.equal(proxy(request({ origin: "null" })).status, 403);
  assert.equal(proxy(request({})).headers.get("vary"), "Origin");
  const allowed = { origin: process.env.ALLOWED_ORIGIN };
  assert.equal(proxy(request(allowed)).headers.get("access-control-allow-origin"), allowed.origin);
  assert.equal(proxy(request({ ...allowed, "access-control-request-method": "TRACE" }, "OPTIONS")).status, 403);
  assert.equal(proxy(request({ ...allowed, "access-control-request-headers": "x-untrusted" }, "OPTIONS")).status, 403);
  assert.equal(proxy(request({ ...allowed, "access-control-request-method": "POST", "access-control-request-headers": "Authorization, Idempotency-Key, Content-Type" }, "OPTIONS")).status, 204);
});

test("IP buckets ignore forwarding headers unless a trusted single-IP header is configured", () => {
  const headers = { "x-real-ip": "203.0.113.2", "x-forwarded-for": "198.51.100.1, 203.0.113.3" };
  delete process.env.RATE_LIMIT_IP_HEADER;
  assert.equal(getRateLimitIdentifier(request(headers)), "unknown");
  process.env.RATE_LIMIT_IP_HEADER = "x-real-ip";
  assert.equal(getRateLimitIdentifier(request(headers)), "203.0.113.2");
  process.env.RATE_LIMIT_IP_HEADER = "x-forwarded-for";
  assert.equal(getRateLimitIdentifier(request(headers)), "unknown");
  assert.equal(getRateLimitIdentifier(request({ "x-forwarded-for": "2001:db8::1" })), "2001:db8::1");
  assert.equal(getRateLimitIdentifier(request({ "x-forwarded-for": "attacker-input" })), "unknown");
  delete process.env.RATE_LIMIT_IP_HEADER;
});

test("on Vercel the overwritten x-real-ip is trusted when no header is configured", () => {
  delete process.env.RATE_LIMIT_IP_HEADER;
  process.env.VERCEL = "1";
  assert.equal(getRateLimitIdentifier(request({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" })), "203.0.113.9");
  assert.equal(getRateLimitIdentifier(request({ "x-real-ip": "not-an-ip" })), "unknown");
  delete process.env.VERCEL;
});

test("refresh limits are per session and login limits are per account, not one shared bucket", async () => {
  delete process.env.RATE_LIMIT_IP_HEADER;
  const withCookie = (token) => new NextRequest("http://localhost:3000/api/v1/auth/refresh-token", { method: "POST", headers: { cookie: `expresshub_refresh=${token}` } });
  const first = refreshTokenRateLimitKey(withCookie("token-a"));
  assert.match(first, /^session:[0-9a-f]{64}$/);
  assert.notEqual(first, refreshTokenRateLimitKey(withCookie("token-b")));
  assert.equal(refreshTokenRateLimitKey(request({})), "unknown");

  assert.equal(accountRateLimitKey(" Rina@Example.com "), accountRateLimitKey("rina@example.com"));
  assert.notEqual(accountRateLimitKey("a@example.com"), accountRateLimitKey("b@example.com"));
  assert.equal(accountRateLimitKey("a@example.com").includes("example"), false);

  const login = new NextRequest("http://localhost:3000/api/v1/auth/login", { method: "POST" });
  for (let i = 0; i < 2; i++) assert.equal(await checkAuthRateLimit(login, "test:login-account", 2, accountRateLimitKey("a@example.com")), null);
  assert.equal((await checkAuthRateLimit(login, "test:login-account", 2, accountRateLimitKey("a@example.com"))).status, 429);
  assert.equal(await checkAuthRateLimit(login, "test:login-account", 2, accountRateLimitKey("b@example.com")), null);
});

test("local quotas deny excess requests and separate scopes and policies", async () => {
  assert.equal((await limitApiRequests("test", "one", 1)).success, true);
  assert.equal((await limitApiRequests("test", "one", 1)).success, false);
  assert.equal((await limitApiRequests("test", "two", 1)).success, true);
  assert.equal((await limitApiRequests("test", "one", 2)).success, true);
});

test("authenticated quotas use signed identity, return Retry-After and run before database reads", async () => {
  for (let i = 0; i < 300; i++) await limitApiRequests("test-user", "authenticated-api", 300);
  const token = signAccessToken({ userId: "test-user", role: "CUSTOMER" });
  const before = reads;
  let failure;
  try { await requireUser(request({ authorization: `Bearer ${token}`, "x-real-ip": "203.0.113.42" })); } catch (error) { failure = error; }
  assert.equal(failure.status, 429);
  assert.equal(reads, before);
  const response = errorResponse(failure);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal((await response.json()).errors[0].code, "RATE_LIMITED");
});

test("production refuses a missing limiter and backend timeout cannot silently allow traffic", async () => {
  process.env.NODE_ENV = "production";
  await assert.rejects(limitApiRequests("prod", "scope", 17), /must be configured/);
  const token = signAccessToken({ userId: "prod-user", role: "CUSTOMER" });
  await assert.rejects(requireUser(request({ authorization: `Bearer ${token}` })), { status: 503 });
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fixture";
  globalThis.testRateBackend = async () => ({ success: true, reason: "timeout", reset: Date.now() });
  await assert.rejects(limitApiRequests("prod", "scope", 17), /timed out/);
  globalThis.testRateBackend = async () => { throw new Error("backend unavailable"); };
  await assert.rejects(limitApiRequests("prod", "scope", 17), /backend unavailable/);
  process.env.NODE_ENV = "test";
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
});

test("API responses have restrictive CSP and standard security headers", async () => {
  const entries = await config.headers();
  const global = Object.fromEntries(entries[0].headers.map(({ key, value }) => [key, value]));
  const api = Object.fromEntries(entries[1].headers.map(({ key, value }) => [key, value]));
  assert.equal(global["X-Content-Type-Options"], "nosniff");
  assert.equal(global["X-Frame-Options"], "DENY");
  assert.equal(api["Cross-Origin-Resource-Policy"], "same-origin");
  assert.match(api["Content-Security-Policy"], /default-src 'none'/);
  assert.equal(config.poweredByHeader, false);
});

test("HTML pages get a CSP that blocks framing, plugins and base-tag injection", async () => {
  const entries = await config.headers();
  const page = entries.find((entry) => entry.source === "/((?!api(?:/|$)).*)");
  const csp = page.headers.find(({ key }) => key === "Content-Security-Policy").value;
  for (const directive of ["frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'self' https://checkout.stripe.com", "connect-src 'self'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  // The page rule never applies to API routes, which keep default-src 'none'.
  const pattern = new RegExp(`^${page.source.replace("/(", "/(?:")}$`);
  for (const path of ["/", "/login", "/admin/shipments/1"]) assert.match(path, pattern);
  for (const path of ["/api", "/api/v1/users/me", "/api/v1/auth/login"]) assert.doesNotMatch(path, pattern);
  // Paths that only start with the letters "api" are still pages.
  assert.match("/apis-overview", pattern);
});
