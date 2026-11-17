import "server-only";
import { isIP } from "node:net";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const limiters = new Map<string, Ratelimit>();
let hasWarnedAboutLocalLimiter = false;
const localBuckets = new Map<string, { count: number; resetAt: number }>();

function getLimiter(limit: number, windowMs: number) {
  const key = `${limit}:${windowMs}`;
  const existingLimiter = limiters.get(key);
  if (existingLimiter) return existingLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.");
    }

    return null;
  }

  const duration: `${number} m` | `${number} s` = windowMs % 60_000 === 0
    ? `${windowMs / 60_000} m`
    : `${windowMs / 1_000} s`;
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, duration),
    analytics: true,
    prefix: `expresshub:${key}`,
  });
  limiters.set(key, limiter);

  return limiter;
}

export async function limitApiRequests(
  identifier: string,
  scope: string,
  limit = 100,
  windowMs = 15 * 60 * 1000,
) {
  const sharedLimiter = getLimiter(limit, windowMs);

  if (sharedLimiter) {
    const result = await sharedLimiter.limit(`${scope}:${identifier}`);
    // Upstash can return success on a timeout. Protection must fail closed.
    if (result.reason === "timeout") throw new Error("Rate limit backend timed out");
    return result;
  }

  if (!hasWarnedAboutLocalLimiter) {
    console.warn("Upstash is not configured; using process-local development rate limiting.");
    hasWarnedAboutLocalLimiter = true;
  }

  const now = Date.now();
  const key = `${limit}:${windowMs}:${scope}:${identifier}`;
  let bucket = localBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    localBuckets.set(key, bucket);
  }

  bucket.count += 1;

  for (const [bucketKey, value] of localBuckets) {
    if (value.resetAt <= now) localBuckets.delete(bucketKey);
  }

  return {
    success: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    reset: bucket.resetAt,
    pending: Promise.resolve(),
  };
}

let hasWarnedAboutUnknownIdentifier = false;

function trustedIpHeader() {
  const configured = process.env.RATE_LIMIT_IP_HEADER;
  if (configured === "x-real-ip" || configured === "x-forwarded-for") return configured;
  // Vercel's edge overwrites x-real-ip with the connecting client's address.
  return process.env.VERCEL ? "x-real-ip" : null;
}

export function getRateLimitIdentifier(request: Request) {
  // Only trust a header set by an ingress that overwrites it.
  // Never pick the leftmost element of a caller-controlled forwarding chain.
  const header = trustedIpHeader();
  const address = header ? request.headers.get(header)?.trim() : undefined;
  if (address && isIP(address)) return address;
  if (process.env.NODE_ENV === "production" && !hasWarnedAboutUnknownIdentifier) {
    hasWarnedAboutUnknownIdentifier = true;
    console.warn("Rate limiting has no client IP; anonymous callers share one bucket. Set RATE_LIMIT_IP_HEADER for your ingress.");
  }
  return "unknown";
}
