import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { deleteWebhook, updateWebhook } from "@/services/developer.service";
import { developerIdSchema, updateWebhookSchema } from "@/validators/developer";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const actor = await requireUser(request);
    const id = developerIdSchema.parse((await context.params).id);
    const input = await parseRequestBody(request, updateWebhookSchema, 4 * 1024);
    return successResponse("Webhook endpoint updated", { endpoint: await updateWebhook(actor, id, input) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const actor = await requireUser(request);
    const id = developerIdSchema.parse((await context.params).id);
    await deleteWebhook(actor, id);
    return successResponse("Webhook endpoint deleted", { id });
  } catch (error) {
    return handleRouteError(error);
  }
}
