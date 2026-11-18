import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { createWebhook, listWebhooks } from "@/services/developer.service";
import { createWebhookSchema } from "@/validators/developer";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return successResponse("Webhook endpoints fetched successfully", await listWebhooks(await requireUser(request)));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const input = await parseRequestBody(request, createWebhookSchema, 4 * 1024);
    return successResponse(
      "Webhook endpoint created. Copy the signing secret now: it will not be shown again.",
      await createWebhook(actor, input),
      201,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
