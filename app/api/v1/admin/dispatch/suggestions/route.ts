import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { runConfiguredDispatch } from "@/services/ai/assistant-deps";
import { aiConfig } from "@/services/ai/config";
import { dispatchSuggestionRequestSchema } from "@/validators/ai";

export const runtime = "nodejs";

// Suggests up to three couriers for one waiting shipment. With AI off or failing it
// returns the rule-based ranking; it never assigns anyone.
export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const input = await parseRequestBody(request, dispatchSuggestionRequestSchema, 1024);
    const result = await runConfiguredDispatch(actor, input.shipmentId, aiConfig());
    return successResponse("Dispatch suggestions prepared", result);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
