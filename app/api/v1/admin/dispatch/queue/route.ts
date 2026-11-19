import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { getDispatchQueue } from "@/services/dispatch.service";

export const runtime = "nodejs";

// The oldest paid shipments waiting for a courier, each with its rule-based top suggestion.
export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    return successResponse("Dispatch queue fetched", await getDispatchQueue(actor));
  } catch (error) {
    return handleRouteError(error, request);
  }
}
