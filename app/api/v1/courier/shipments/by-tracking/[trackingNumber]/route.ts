import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { enforceUserRateLimit } from "@/lib/http/user-rate-limit";
import { findCourierShipmentByTracking } from "@/services/label.service";
import { trackingNumberSchema } from "@/validators/track";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const actor = requireRole(await requireUser(request), "COURIER");
    await enforceUserRateLimit(actor.id, "courier:scan", 120);
    const trackingNumber = trackingNumberSchema.parse(decodeURIComponent((await context.params).trackingNumber));
    const shipment = await findCourierShipmentByTracking(actor, trackingNumber);
    return successResponse("Shipment found", { shipment });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
