import "server-only";

import { NextResponse } from "next/server";

import { RateLimitError, toErrorResponse, type ErrorResponseOptions } from "@/lib/http/errors";

export function successResponse<T>(message: string, data: T, status = 200) {
  return NextResponse.json(
    { success: true, message, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function errorResponse(error: unknown, options?: ErrorResponseOptions) {
  if (error instanceof RateLimitError) return tooManyRequestsResponse(error.reset);
  const result = toErrorResponse(error, options);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.status === 500 && "incidentId" in result.body && typeof result.body.incidentId === "string") {
    headers["X-Incident-Id"] = result.body.incidentId;
    headers["X-Error-Id"] = result.body.incidentId;
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers,
  });
}

export function tooManyRequestsResponse(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

  return NextResponse.json(
    {
      success: false,
      message: "Too many requests. Please try again later.",
      errors: [{ code: "RATE_LIMITED" }],
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
    },
  );
}
