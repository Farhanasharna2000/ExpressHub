import "server-only";

import { UserRole } from "@prisma/client";

import prisma from "@/lib/prisma";
import { assertAccessTokenConfiguration, verifyAccessToken } from "@/lib/auth/tokens";
import { AppError, RateLimitError } from "@/lib/http/errors";
import { limitApiRequests } from "@/lib/rate-limit";
import { rateLimitDiagnostics } from "@/lib/rate-limit-diagnostics";
import { apiKeyHashMatches, apiKeyScopeFor, looksLikeApiKey, parseApiKey, type ApiKeyScope } from "@/lib/merchant/api-keys";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // Set only when the request authenticated with a merchant API key.
  via?: "session" | "api_key";
  apiKeyId?: string;
  scopes?: readonly ApiKeyScope[];
};

const API_KEY_RATE_LIMIT = 120;
const API_KEY_RATE_WINDOW_MS = 60 * 1000;
const LAST_USED_RESOLUTION_MS = 60 * 1000;

async function enforceLimit(identifier: string, scope: string, limit: number, windowMs?: number) {
  let result;
  try {
    result = await limitApiRequests(identifier, scope, limit, windowMs);
  } catch (error) {
    console.error("Authenticated API rate limit check failed", rateLimitDiagnostics(error));
    throw new AppError(503, "Request protection is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE");
  }
  if (!result.success) throw new RateLimitError(result.reset);
}

// API keys act as their owner with customer rights, and only on routes listed in
// API_KEY_ROUTES with a matching scope. Every other route rejects them.
async function requireApiKeyUser(request: Request, token: string): Promise<AuthenticatedUser> {
  const pathname = new URL(request.url).pathname;
  const scope = apiKeyScopeFor(request.method, pathname);
  if (!scope) throw new AppError(403, "API keys cannot be used for this endpoint", "API_KEY_NOT_ALLOWED");

  const parsed = parseApiKey(token);
  const invalid = new AppError(401, "Invalid or revoked API key", "INVALID_API_KEY");
  if (!parsed) throw invalid;

  const key = await prisma.apiKey.findUnique({
    where: { prefix: parsed.prefix },
    select: {
      id: true, keyHash: true, scopes: true, revokedAt: true, expiresAt: true, lastUsedAt: true,
      user: { select: { id: true, email: true, name: true, role: true, isActive: true, deletedAt: true } },
    },
  });
  const now = new Date();
  if (
    !key ||
    !apiKeyHashMatches(token, key.keyHash) ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt <= now) ||
    !key.user.isActive ||
    key.user.deletedAt ||
    key.user.role !== "CUSTOMER"
  ) {
    throw invalid;
  }
  if (!key.scopes.includes(scope)) {
    throw new AppError(403, `This API key needs the ${scope} scope`, "API_KEY_SCOPE_MISSING");
  }

  await enforceLimit(key.id, "api-key", API_KEY_RATE_LIMIT, API_KEY_RATE_WINDOW_MS);

  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
    await prisma.apiKey.updateMany({
      where: { id: key.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_RESOLUTION_MS) } }] },
      data: { lastUsedAt: now },
    }).catch((error: unknown) => console.error("API key last-used update failed", error instanceof Error ? error.message : error));
  }

  const { id, email, name } = key.user;
  return { id, email, name, role: "CUSTOMER", via: "api_key", apiKeyId: key.id, scopes: key.scopes as ApiKeyScope[] };
}

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
  }
  if (looksLikeApiKey(match[1])) return requireApiKeyUser(request, match[1]);

  assertAccessTokenConfiguration();
  let claims;

  try {
    claims = verifyAccessToken(match[1]);
  } catch {
    throw new AppError(401, "Invalid or expired access token", "INVALID_TOKEN");
  }

  await enforceLimit(claims.userId, "authenticated-api", 300);

  const user = await prisma.user.findFirst({
    where: {
      id: claims.userId,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    throw new AppError(401, "Invalid or expired access token", "INVALID_TOKEN");
  }

  return { ...user, via: "session" };
}

// For endpoints that must never accept an API key even if they were added to the
// allowlist by mistake (key management itself).
export function requireSession(user: AuthenticatedUser) {
  if (user.via === "api_key") {
    throw new AppError(403, "API keys cannot be used for this endpoint", "API_KEY_NOT_ALLOWED");
  }
  return user;
}

export function requireRole(user: AuthenticatedUser, ...allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new AppError(403, "You do not have permission to perform this action", "FORBIDDEN");
  }

  return user;
}
