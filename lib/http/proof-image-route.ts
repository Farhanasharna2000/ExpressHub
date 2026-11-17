import "server-only";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import type { ProofKind } from "@/lib/delivery-proof";
import { getProofImage } from "@/services/proof.service";
import { shipmentIdSchema } from "@/validators/shipment";

export async function proofImageResponse(request: Request, params: Promise<{ id: string }>, kind: ProofKind) {
  try {
    const actor = await requireUser(request);
    const id = shipmentIdSchema.parse((await params).id);
    const image = await getProofImage(actor, id, kind);
    return new Response(Buffer.from(image.data), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.data.length),
        // Personal images: never stored by shared caches.
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
