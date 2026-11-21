import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { labelFileName } from "@/lib/labels/shipping-label";
import { enforceUserRateLimit } from "@/lib/http/user-rate-limit";
import { getShippingLabel } from "@/services/label.service";
import { shipmentIdSchema } from "@/validators/shipment";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    await enforceUserRateLimit(actor.id, "shipment:label", 60);
    const id = shipmentIdSchema.parse((await context.params).id);
    const { trackingNumber, pdf } = await getShippingLabel(actor, id);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        // Names, phones and addresses: never kept by any cache.
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${labelFileName(trackingNumber)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
