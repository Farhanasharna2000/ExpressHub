import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { listLiveCouriers } from "@/services/courier-location.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const couriers = await listLiveCouriers(actor);
    return successResponse("Live couriers fetched", { couriers });
  } catch (error) {
    return handleRouteError(error);
  }
}
