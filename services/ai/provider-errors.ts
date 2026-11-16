import { AppError } from "@/lib/http/errors";

export const aiBusy = () => new AppError(503, "The assistant is busy. Please try again shortly.", "AI_BUSY");
export const aiUnavailable = () => new AppError(503, "The assistant is not available", "AI_UNAVAILABLE");
export const aiQuotaExceeded = () => new AppError(503, "The assistant has reached today's free usage limit. Please try again later.", "AI_QUOTA_EXCEEDED");
export const aiUpstream = () => new AppError(502, "The assistant could not answer right now. Please try again.", "AI_UPSTREAM_ERROR");

// Maps a Gemini HTTP error to the error the user sees. Temporary overload (503) and
// short-term rate limits are "busy"; a daily free-tier limit gets its own message.
export function geminiStatusError(status: number, message: string) {
  if (status === 429) return /per ?day/i.test(message) ? aiQuotaExceeded() : aiBusy();
  if (status === 503) return aiBusy();
  if (status === 401 || status === 403) return aiUnavailable();
  return aiUpstream();
}
