import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { MAX_PROOF_REQUEST_BYTES } from "@/lib/delivery-proof";
import { formFile, formText, readLimitedFormData } from "@/lib/http/multipart";
import { successResponse } from "@/lib/http/responses";
import { saveDeliveryProof } from "@/services/proof.service";
import { proofFieldsSchema } from "@/validators/proof";
import { shipmentIdSchema } from "@/validators/shipment";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = shipmentIdSchema.parse((await context.params).id);
    const form = await readLimitedFormData(request, MAX_PROOF_REQUEST_BYTES);
    const fields = proofFieldsSchema.parse({
      recipientName: formText(form, "recipientName"),
      capturedAt: formText(form, "capturedAt") || undefined,
    });
    const proof = await saveDeliveryProof(actor, id, {
      ...fields,
      photo: await formFile(form, "photo"),
      signature: await formFile(form, "signature"),
    });
    return successResponse("Proof of delivery saved", { proof }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
