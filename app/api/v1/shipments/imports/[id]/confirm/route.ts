import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { confirmImport } from "@/services/shipment-import.service";
import { importIdSchema } from "@/validators/shipment-import";

export const runtime = "nodejs";
// The shipments are created after this response ends, within the same function lifetime.
export const maxDuration = 60;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = importIdSchema.parse((await context.params).id);
    return successResponse("Import started", await confirmImport(actor, id), 202);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
