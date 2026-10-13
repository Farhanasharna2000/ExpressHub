import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/http/errors";
import { errorResponse } from "@/lib/http/responses";

import { isProtectedPage, permittedPath, roleHome } from "@/lib/auth/route-access";
import { pageSessionCookie, verifyPageSession } from "@/lib/auth/tokens";

function protectPage(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!isProtectedPage(path)) return NextResponse.next();

  const token = request.cookies.get(pageSessionCookie.name)?.value;
  let session;
  try { session = token ? verifyPageSession(token) : null; }
  catch { session = null; }

  let response: NextResponse;
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${path}${request.nextUrl.search}`);
    response = NextResponse.redirect(login);
    if (token) response.cookies.set({ ...pageSessionCookie, value: "", maxAge: 0 });
  } else if (!permittedPath(path, session.role)) {
    response = NextResponse.redirect(new URL(roleHome(session.role), request.url));
  } else {
    response = NextResponse.next();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

const allowedMethods = "GET, HEAD, POST, PATCH, DELETE, OPTIONS";
const allowedHeaders = "Authorization, Content-Type, X-CSRF-Token, Idempotency-Key";

export function proxy(request: NextRequest) {
  // Keep API CORS and bearer authorization independent of page redirects.
  if (request.nextUrl.pathname !== "/api" && !request.nextUrl.pathname.startsWith("/api/")) {
    return protectPage(request);
  }
  const origin = request.headers.get("origin");
  const allowedOrigin = process.env.ALLOWED_ORIGIN ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);

  if (origin && origin !== allowedOrigin) {
    return errorResponse(new AppError(403, "Request origin is not allowed", "ORIGIN_NOT_ALLOWED"));
  }

  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigin || origin !== allowedOrigin) {
      return errorResponse(new AppError(403, "Request origin is not allowed", "ORIGIN_NOT_ALLOWED"));
    }

    const method = request.headers.get("access-control-request-method");
    const headers = request.headers.get("access-control-request-headers");
    if ((method && !allowedMethods.split(", ").includes(method)) ||
      (headers && headers.split(",").some((header) => !allowedHeaders.toLowerCase().split(", ").includes(header.trim().toLowerCase())))) {
      return errorResponse(new AppError(403, "Preflight method or headers are not allowed", "CORS_NOT_ALLOWED"));
    }

    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": allowedMethods,
        "Access-Control-Allow-Headers": allowedHeaders,
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Vary", "Origin");

  if (origin && allowedOrigin && origin === allowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", allowedMethods);
    response.headers.set("Access-Control-Allow-Headers", allowedHeaders);
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/customer/:path*", "/courier/:path*", "/profile/:path*", "/checkout/:path*"],
};
