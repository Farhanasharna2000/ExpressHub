import "server-only";
import { Redis } from "@upstash/redis";

const MAX_MEMORY_ENTRIES = 200;
const memory = new Map<string, { value: unknown; expiresAt: number }>();
let redis: Redis | null | undefined;

function sharedClient() {
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = url && token ? new Redis({ url, token }) : null;
  }
  return redis;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Read-through cache: Upstash when configured (shared by every server instance), otherwise
// a small per-process map. A cache outage only costs a recomputation, never a failed request.
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const shared = sharedClient();
  if (shared) {
    try {
      const hit = await shared.get<T>(key);
      if (hit !== null && hit !== undefined) return { value: hit, hit: true };
    } catch (error) {
      console.error("Cache read failed", reason(error));
    }
    const value = await load();
    try {
      await shared.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      console.error("Cache write failed", reason(error));
    }
    return { value, hit: false };
  }

  const now = Date.now();
  const entry = memory.get(key);
  if (entry && entry.expiresAt > now) return { value: entry.value as T, hit: true };
  const value = await load();
  if (!memory.has(key) && memory.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return { value, hit: false };
}

export type CacheFn = typeof cached;
