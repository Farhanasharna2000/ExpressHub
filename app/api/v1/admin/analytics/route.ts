import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { uniqueQueryParameters } from "@/lib/http/query";
import { getAnalytics } from "@/services/analytics.service";
import { analyticsQuerySchema } from "@/validators/analytics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const input = analyticsQuerySchema.parse(uniqueQueryParameters(request.nextUrl.searchParams));
    return successResponse("Analytics fetched successfully", { analytics: await getAnalytics(actor, input) });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
