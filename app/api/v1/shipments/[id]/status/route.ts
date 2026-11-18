import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { scheduleNotificationDispatch } from "@/services/notifications/outbox";
import { scheduleWebhookDispatch } from "@/services/webhooks/outbox";
import { updateShipmentStatus } from "@/services/shipment.service";
import { shipmentIdSchema, shipmentStatusSchema } from "@/validators/shipment";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser(request);
    const id = shipmentIdSchema.parse((await context.params).id);
    const input = await parseRequestBody(request, shipmentStatusSchema);
    const shipment = await updateShipmentStatus(actor, id, input);
    scheduleNotificationDispatch();
    scheduleWebhookDispatch();
    return successResponse("Shipment updated successfully", { shipment });
  } catch (error) {
    return handleRouteError(error);
  }
}
