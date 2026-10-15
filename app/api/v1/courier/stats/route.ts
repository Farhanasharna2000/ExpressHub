import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { getCourierStats } from "@/services/courier.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "COURIER", "ADMIN");
    const stats = await getCourierStats(actor);
    return successResponse("Courier statistics fetched successfully", stats);
  } catch (error) {
    return handleRouteError(error);
  }
}
