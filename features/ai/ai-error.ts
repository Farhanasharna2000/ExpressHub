import { ApiError, errorMessage } from "@/lib/client/api";

// AI routes return a specific, safe message and code for provider failures; show both.
export function aiErrorMessage(cause: unknown) {
  if (cause instanceof ApiError && (cause.status >= 500 || cause.status === 422) && !cause.incidentId) {
    const code = (cause.errors[0] as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? `${cause.message} (${code})` : cause.message;
  }
  return errorMessage(cause);
}
