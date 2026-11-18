import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { revokeApiKey } from "@/services/developer.service";
import { developerIdSchema } from "@/validators/developer";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = developerIdSchema.parse((await context.params).id);
    return successResponse("API key revoked", { apiKey: await revokeApiKey(actor, id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
