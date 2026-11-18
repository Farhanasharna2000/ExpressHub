import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { retryDelivery } from "@/services/developer.service";
import { scheduleWebhookDispatch } from "@/services/webhooks/outbox";
import { developerIdSchema } from "@/validators/developer";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = developerIdSchema.parse((await context.params).id);
    const result = await retryDelivery(actor, id);
    scheduleWebhookDispatch();
    return successResponse("Delivery queued for retry", result);
  } catch (error) {
    return handleRouteError(error);
  }
}
