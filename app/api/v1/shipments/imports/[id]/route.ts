import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { getImport } from "@/services/shipment-import.service";
import { importIdSchema } from "@/validators/shipment-import";

export const runtime = "nodejs";
// A poll can restart a stalled import after the response, so allow the same time as confirming.
export const maxDuration = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = importIdSchema.parse((await context.params).id);
    return successResponse("Import fetched successfully", await getImport(actor, id));
  } catch (error) {
    return handleRouteError(error, request);
  }
}
