import type { NextRequest } from "next/server";

import {
  accountRateLimitKey,
  checkAuthRateLimit,
  ensureAllowedCookieOrigin,
  handleRouteError,
  parseRequestBody,
  setRefreshCookie,
} from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { loginUser } from "@/services/auth.service";
import { loginSchema } from "@/validators/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const limited = await checkAuthRateLimit(request, "auth:login", 10);
    if (limited) return limited;

    ensureAllowedCookieOrigin(request);
    const input = await parseRequestBody(request, loginSchema);
    const accountLimited = await checkAuthRateLimit(request, "auth:login-account", 10, accountRateLimitKey(input.email));
    if (accountLimited) return accountLimited;

    const result = await loginUser(input);
    const response = successResponse("Login successful", {
      user: result.user,
      accessToken: result.accessToken,
    });

    setRefreshCookie(response, result.refreshToken, result.accessToken);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
