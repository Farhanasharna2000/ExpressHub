import "server-only";

import { createHash, randomBytes } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { UserRole } from "@prisma/client";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_ISSUER = "expresshub";
const TOKEN_AUDIENCE = "expresshub-api";

export type AccessTokenClaims = {
  userId: string;
  role: UserRole;
};

function getAccessTokenSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_ACCESS_SECRET must contain at least 32 bytes.");
  }

  return secret;
}

export function assertAccessTokenConfiguration() {
  getAccessTokenSecret();
}

export function signAccessToken(claims: AccessTokenClaims) {
  return jwt.sign(
    { role: claims.role, tokenType: "access" },
    getAccessTokenSecret(),
    {
      algorithm: "HS256",
      subject: claims.userId,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, getAccessTokenSecret(), {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  }) as JwtPayload & { role?: UserRole; tokenType?: string };

  if (
    typeof payload.sub !== "string" ||
    !Object.values(UserRole).includes(payload.role as UserRole) ||
    payload.tokenType !== "access"
  ) {
    throw new Error("Invalid access token payload.");
  }

  return {
    userId: payload.sub,
    role: payload.role as UserRole,
  };
}

export function createRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

export const refreshTokenCookie = {
  name: "expresshub_refresh",
  maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  path: "/api/v1/auth",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export function isAllowedCookieRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;

  let requestHost: string | null = request.headers.get("host");
  if (!requestHost && request.url) {
    try {
      requestHost = new URL(request.url).host;
    } catch {
      requestHost = null;
    }
  }

  if (requestHost && (origin === `http://${requestHost}` || origin === `https://${requestHost}`)) {
    return true;
  }

  const allowedOrigin =
    process.env.ALLOWED_ORIGIN ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (allowedOrigin && origin === allowedOrigin) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

// An optimistic page-access hint, never an API credential or a refresh token.
export const pageSessionCookie = {
  name: "expresshub_page_session",
  maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export function signPageSession(claims: AccessTokenClaims) {
  return jwt.sign({ role: claims.role, tokenType: "page" }, getAccessTokenSecret(), {
    algorithm: "HS256", subject: claims.userId, issuer: TOKEN_ISSUER,
    audience: "expresshub-pages", expiresIn: pageSessionCookie.maxAge,
  });
}

export function verifyPageSession(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, getAccessTokenSecret(), {
    algorithms: ["HS256"], issuer: TOKEN_ISSUER, audience: "expresshub-pages",
  }) as JwtPayload;
  if (!payload.sub || typeof payload.sub !== "string" || payload.tokenType !== "page" ||
      !Object.values(UserRole).includes(payload.role) || typeof payload.exp !== "number") {
    throw new Error("Invalid page session");
  }
  return { userId: payload.sub, role: payload.role };
}
