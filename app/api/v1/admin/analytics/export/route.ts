import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { uniqueQueryParameters } from "@/lib/http/query";
import { exportAnalyticsCsv } from "@/services/analytics.service";
import { analyticsQuerySchema } from "@/validators/analytics";

export const runtime = "nodejs";

// The CSV travels inside the usual JSON envelope so the bearer-token client and its
// refresh handling work unchanged; the browser saves `content` as `filename`.
export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const input = analyticsQuerySchema.parse(uniqueQueryParameters(request.nextUrl.searchParams));
    return successResponse("Analytics export prepared", { export: await exportAnalyticsCsv(actor, input) });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
