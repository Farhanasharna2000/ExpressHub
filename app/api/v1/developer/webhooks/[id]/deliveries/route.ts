import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { uniqueQueryParameters } from "@/lib/http/query";
import { successResponse } from "@/lib/http/responses";
import { listDeliveries } from "@/services/developer.service";
import { developerIdSchema, listDeliveriesSchema } from "@/validators/developer";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = developerIdSchema.parse((await context.params).id);
    const input = listDeliveriesSchema.parse(uniqueQueryParameters(request.nextUrl.searchParams));
    return successResponse("Webhook deliveries fetched successfully", await listDeliveries(actor, id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
