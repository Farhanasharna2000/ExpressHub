import "server-only";

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { type ZodType } from "zod";

import { hashRefreshToken, isAllowedCookieRequest, refreshTokenCookie, pageSessionCookie, signPageSession, verifyAccessToken, type AccessTokenClaims } from "@/lib/auth/tokens";
import { AppError, type ErrorResponseOptions } from "@/lib/http/errors";
import { errorResponse, tooManyRequestsResponse } from "@/lib/http/responses";
import { getRateLimitIdentifier, limitApiRequests } from "@/lib/rate-limit";
import { rateLimitDiagnostics } from "@/lib/rate-limit-diagnostics";

export async function parseRequestBody<T>(request: Request, schema: ZodType<T>, maxBodyBytes = 16 * 1024): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new AppError(415, "Content-Type must be application/json", "UNSUPPORTED_MEDIA_TYPE");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new AppError(413, "Request body is too large", "REQUEST_TOO_LARGE");
  }

  if (!request.body) {
    throw new AppError(400, "Request body must be valid JSON", "INVALID_JSON");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBodyBytes) {
      await reader.cancel();
      throw new AppError(413, "Request body is too large", "REQUEST_TOO_LARGE");
    }

    chunks.push(value);
  }

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks, totalBytes).toString("utf8"));
  } catch {
    throw new AppError(400, "Request body must be valid JSON", "INVALID_JSON");
  }

  return schema.parse(body);
}

// Refresh and logout calls carry their own token, so they are limited per session
// rather than per IP, which may be unknown and shared by every caller.
export function refreshTokenRateLimitKey(request: NextRequest) {
  const token = request.cookies.get(refreshTokenCookie.name)?.value;
  return token ? `session:${hashRefreshToken(token)}` : getRateLimitIdentifier(request);
}

export function accountRateLimitKey(email: string) {
  return `account:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}

export async function checkAuthRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  identifier = getRateLimitIdentifier(request),
) {
  let result;
  try {
    result = await limitApiRequests(
      identifier,
      scope,
      limit,
      15 * 60 * 1000,
    );
  } catch (error) {
    console.error("Authentication rate limit check failed", rateLimitDiagnostics(error));
    throw new AppError(503, "Authentication service is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE");
  }

  return result.success ? null : tooManyRequestsResponse(result.reset);
}

export function ensureAllowedCookieOrigin(request: Request) {
  if (!isAllowedCookieRequest(request)) {
    throw new AppError(403, "Request origin is not allowed", "ORIGIN_NOT_ALLOWED");
  }
}

export function handleRouteError(
  error: unknown,
  optionsOrRequest?: ErrorResponseOptions | Request,
) {
  let options: ErrorResponseOptions | undefined;
  if (optionsOrRequest && "headers" in optionsOrRequest && typeof optionsOrRequest.headers?.get === "function") {
    const correlationId =
      optionsOrRequest.headers.get("x-correlation-id") ||
      optionsOrRequest.headers.get("x-request-id") ||
      undefined;
    options = correlationId ? { correlationId } : undefined;
  } else if (optionsOrRequest && typeof optionsOrRequest === "object" && "correlationId" in optionsOrRequest) {
    options = optionsOrRequest as ErrorResponseOptions;
  }
  return errorResponse(error, options);
}

export function setRefreshCookie(
  response: NextResponse,
  token: string,
  accessToken: string,
) {
  setPageSessionCookie(response, verifyAccessToken(accessToken));
  setRefreshTokenCookie(response, token);
}

export function setRefreshTokenCookie(response: NextResponse, token: string) {
  response.cookies.set({ ...refreshTokenCookie, value: token });
}

export function clearRefreshCookie(response: NextResponse) {
  response.cookies.set({ ...pageSessionCookie, value: "", maxAge: 0 });
  response.cookies.set({
    ...refreshTokenCookie,
    value: "",
    maxAge: 0,
  });
}

export function setPageSessionCookie(response: NextResponse, claims: AccessTokenClaims) {
  response.cookies.set({ ...pageSessionCookie, value: signPageSession(claims) });
}
