import type { NextRequest } from "next/server";
import { checkAuthRateLimit, handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { enforceHelpDailyCap, helpAvailable, runConfiguredHelp } from "@/services/ai/assistant-deps";
import { aiConfig } from "@/services/ai/config";
import { helpRequestSchema } from "@/validators/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: tells the help widget whether to show itself. Never calls the AI provider.
export async function GET(request: NextRequest) {
  try {
    return successResponse("Help status fetched", { available: await helpAvailable(aiConfig()) });
  } catch (error) {
    return handleRouteError(error, request);
  }
}

// Public: answers one help question from the indexed help articles.
export async function POST(request: NextRequest) {
  try {
    const limited = await checkAuthRateLimit(request, "ai-help", 10);
    if (limited) return limited;
    const config = aiConfig();
    if (!(await helpAvailable(config))) throw new AppError(503, "The help assistant is not available", "AI_UNAVAILABLE");
    const { question } = await parseRequestBody(request, helpRequestSchema, 2048);
    await enforceHelpDailyCap();
    const help = await runConfiguredHelp(question, config);
    return successResponse("Help answer prepared", { help });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
