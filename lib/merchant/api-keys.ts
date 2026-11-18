import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApiKeyScope } from "@/lib/merchant/scopes";

export { API_KEY_SCOPES, MAX_ACTIVE_API_KEYS, type ApiKeyScope } from "@/lib/merchant/scopes";
const KEY_PREFIX = "eh_live_";
const KEY_PATTERN = /^eh_live_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export function generateApiKey() {
  const prefix = randomBytes(5).toString("hex").slice(0, 8);
  const secret = randomBytes(32).toString("base64url");
  const key = `${KEY_PREFIX}${prefix}_${secret}`;
  return { key, prefix, hash: hashApiKey(key) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(token: string) {
  return token.startsWith(KEY_PREFIX);
}

export function parseApiKey(token: string) {
  const match = KEY_PATTERN.exec(token);
  return match ? { prefix: match[1] } : null;
}

export function apiKeyHashMatches(token: string, storedHash: string) {
  const presented = Buffer.from(hashApiKey(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

type Rule = { method: string; pattern: RegExp; scope: ApiKeyScope };

const ID = "[^/]+";
const route = (method: string, path: string, scope: ApiKeyScope): Rule => ({
  method,
  pattern: new RegExp(`^/api/v1${path.replaceAll(":id", ID)}/?$`),
  scope,
});

// Every route an API key may call. Anything not listed rejects API keys, so new
// routes stay session-only until they are added here on purpose. Key management
// itself is deliberately absent: a key can never create or revoke keys.
export const API_KEY_ROUTES: readonly Rule[] = [
  route("GET", "/shipments", "shipments:read"),
  route("GET", "/shipments/my-shipments", "shipments:read"),
  route("GET", "/shipments/search", "shipments:read"),
  route("GET", "/shipments/:id", "shipments:read"),
  route("POST", "/shipments", "shipments:write"),
  route("PATCH", "/shipments/:id/status", "shipments:write"),
  route("GET", "/developer/webhooks", "webhooks:manage"),
  route("POST", "/developer/webhooks", "webhooks:manage"),
  route("PATCH", "/developer/webhooks/:id", "webhooks:manage"),
  route("DELETE", "/developer/webhooks/:id", "webhooks:manage"),
  route("POST", "/developer/webhooks/:id/rotate-secret", "webhooks:manage"),
  route("POST", "/developer/webhooks/:id/test", "webhooks:manage"),
  route("GET", "/developer/webhooks/:id/deliveries", "webhooks:manage"),
  route("POST", "/developer/webhooks/:id/deliveries/:id/retry", "webhooks:manage"),
];

export function apiKeyScopeFor(method: string, pathname: string): ApiKeyScope | null {
  const upper = method.toUpperCase();
  const lookup = upper === "HEAD" ? "GET" : upper;
  return API_KEY_ROUTES.find((rule) => rule.method === lookup && rule.pattern.test(pathname))?.scope ?? null;
}
