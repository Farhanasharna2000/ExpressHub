import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { ASSISTANT_ROLES } from "@/services/ai/assistant.service";
import { aiConfig } from "@/services/ai/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const { enabled } = aiConfig();
    const assistant = enabled && (ASSISTANT_ROLES as readonly string[]).includes(actor.role);
    const bookingDraft = enabled && actor.role === "CUSTOMER";
    return successResponse("AI status fetched successfully", { assistant, bookingDraft });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
