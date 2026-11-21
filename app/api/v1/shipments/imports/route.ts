import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { readLimitedBytes, readLimitedFormData } from "@/lib/http/multipart";
import { successResponse } from "@/lib/http/responses";
import { enforceUserRateLimit } from "@/lib/http/user-rate-limit";
import { IMPORT_HOURLY_LIMIT, IMPORT_MAX_BYTES } from "@/lib/shipment-import";
import { previewImport } from "@/services/shipment-import.service";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
// Multipart framing adds a little to the file itself.
const FORM_OVERHEAD_BYTES = 64 * 1024;

async function readUpload(request: NextRequest) {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type === "multipart/form-data") {
    const file = (await readLimitedFormData(request, IMPORT_MAX_BYTES + FORM_OVERHEAD_BYTES)).get("file");
    if (typeof file === "string" || file === null) throw new AppError(400, "Attach the CSV file as the form field 'file'", "INVALID_FORM");
    if (file.size > IMPORT_MAX_BYTES) throw new AppError(413, "The file is larger than 1 MB", "REQUEST_TOO_LARGE");
    return { fileName: file.name, content: new Uint8Array(await file.arrayBuffer()) };
  }
  if (type === "text/csv" || type === "application/csv") {
    return { fileName: new URL(request.url).searchParams.get("fileName") ?? undefined, content: await readLimitedBytes(request, IMPORT_MAX_BYTES) };
  }
  throw new AppError(415, "Send the file as multipart/form-data or text/csv", "UNSUPPORTED_MEDIA_TYPE");
}

// Checks and prices every row but creates nothing; the customer confirms afterwards.
export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    await enforceUserRateLimit(actor.id, "shipment-import", IMPORT_HOURLY_LIMIT, HOUR_MS);
    const detail = await previewImport(actor, await readUpload(request));
    return successResponse("Import preview ready", detail, 201);
  } catch (error) {
    return handleRouteError(error, request);
  }
}
