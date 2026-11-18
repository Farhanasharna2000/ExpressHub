import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { getShipmentCourierLocation } from "@/services/courier-location.service";
import { shipmentIdSchema } from "@/validators/shipment";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = shipmentIdSchema.parse((await context.params).id);
    const location = await getShipmentCourierLocation(actor, id);
    return successResponse("Courier location fetched", { location });
  } catch (error) {
    return handleRouteError(error);
  }
}
