import "server-only";
import { AppError, RateLimitError } from "@/lib/http/errors";
import { limitApiRequests } from "@/lib/rate-limit";
import { rateLimitDiagnostics } from "@/lib/rate-limit-diagnostics";

const WINDOW_MS = 15 * 60 * 1000;

// Per signed-in user limit for routes that are costly (PDF rendering) or could be used to probe.
export async function enforceUserRateLimit(userId: string, scope: string, limit: number, windowMs = WINDOW_MS) {
  let result;
  try {
    result = await limitApiRequests(userId, scope, limit, windowMs);
  } catch (error) {
    console.error(`Rate limit check failed for ${scope}`, rateLimitDiagnostics(error));
    throw new AppError(503, "This service is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE");
  }
  if (!result.success) throw new RateLimitError(result.reset);
}
