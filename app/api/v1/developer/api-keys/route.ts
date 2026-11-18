import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { createApiKey, listApiKeys } from "@/services/developer.service";
import { createApiKeySchema } from "@/validators/developer";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return successResponse("API keys fetched successfully", await listApiKeys(await requireUser(request)));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const input = await parseRequestBody(request, createApiKeySchema, 2 * 1024);
    return successResponse("API key created. Copy it now: it will not be shown again.", await createApiKey(actor, input), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
