import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "ExpressHub-Signature";
export const EVENT_ID_HEADER = "ExpressHub-Event-Id";
export const EVENT_TYPE_HEADER = "ExpressHub-Event-Type";
// Receivers should reject signatures older than this to stop replays.
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function generateSigningSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

// HMAC-SHA256 over "<unix seconds>.<raw body>", hex encoded.
export function webhookSignature(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number, body: string) {
  return `t=${timestamp},v1=${webhookSignature(secret, timestamp, body)}`;
}

// The same check a receiver runs; used by tests and documented for merchants.
export function verifyWebhookSignature(
  secret: string,
  header: string | null,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(webhookSignature(secret, timestamp, body), "hex");
  const presented = Buffer.from(parts.v1, "hex");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
