import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { enforceAssistantRateLimit, runConfiguredBookingDraft } from "@/services/ai/assistant-deps";
import { aiConfig } from "@/services/ai/config";
import { bookingDraftRequestSchema } from "@/validators/ai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "CUSTOMER");
    const config = aiConfig();
    if (!config.enabled) throw new AppError(503, "The booking assistant is not available", "AI_UNAVAILABLE");
    const input = await parseRequestBody(request, bookingDraftRequestSchema, 16 * 1024);
    await enforceAssistantRateLimit(actor, "ai-booking-draft");
    const result = await runConfiguredBookingDraft(actor, input, config);
    return successResponse("Booking draft prepared", result);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
