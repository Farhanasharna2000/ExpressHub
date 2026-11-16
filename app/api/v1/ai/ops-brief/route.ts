import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { readConfiguredOpsBrief, runConfiguredOpsBrief } from "@/services/ai/assistant-deps";
import { aiConfig } from "@/services/ai/config";
import { opsBriefRequestSchema } from "@/validators/ai";

export const runtime = "nodejs";

function enabledConfig() {
  const config = aiConfig();
  if (!config.enabled) throw new AppError(503, "The operations brief is not available", "AI_UNAVAILABLE");
  return config;
}

// Reads today's cached brief only. It never calls the AI provider.
export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const brief = await readConfiguredOpsBrief(actor, enabledConfig());
    return successResponse("Operations brief fetched", { brief });
  } catch (error) {
    return handleRouteError(error, request);
  }
}

// Returns today's cached brief, or generates one (rate limited) when none exists or refresh is true.
export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const config = enabledConfig();
    const input = await parseRequestBody(request, opsBriefRequestSchema, 1024);
    const brief = await runConfiguredOpsBrief(actor, input, config);
    return successResponse("Operations brief prepared", { brief });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
