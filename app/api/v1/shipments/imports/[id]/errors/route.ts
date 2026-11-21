import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { importErrorsCsv } from "@/services/shipment-import.service";
import { importIdSchema } from "@/validators/shipment-import";

export const runtime = "nodejs";

// The CSV travels inside the usual JSON envelope so the bearer-token client works
// unchanged; the browser saves `content` as `filename`.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser(request);
    const id = importIdSchema.parse((await context.params).id);
    return successResponse("Import error report prepared", { export: await importErrorsCsv(actor, id) });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
