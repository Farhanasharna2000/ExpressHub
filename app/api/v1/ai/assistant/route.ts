import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { enforceAssistantRateLimit, runConfiguredAssistant } from "@/services/ai/assistant-deps";
import { aiConfig } from "@/services/ai/config";
import { assistantRequestSchema } from "@/validators/ai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const config = aiConfig();
    if (!config.enabled) throw new AppError(503, "The assistant is not available", "AI_UNAVAILABLE");
    const input = await parseRequestBody(request, assistantRequestSchema, 64 * 1024);
    await enforceAssistantRateLimit(actor);
    const result = await runConfiguredAssistant(actor, input, config);
    return successResponse("Assistant replied successfully", result);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
