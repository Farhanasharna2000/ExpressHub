import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { AppError, RateLimitError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { limitApiRequests } from "@/lib/rate-limit";
import { rateLimitDiagnostics } from "@/lib/rate-limit-diagnostics";
import { stopCourierLocation, updateCourierLocation } from "@/services/courier-location.service";
import { courierLocationSchema } from "@/validators/courier-location";

export const runtime = "nodejs";

// The app sends about one update every 15 seconds; this allows bursts after movement
// while capping a misbehaving client at roughly one request every 4 seconds.
const LOCATION_LIMIT = 240;
const LOCATION_WINDOW_MS = 15 * 60 * 1000;

async function enforceLocationLimit(courierId: string) {
  let result;
  try {
    result = await limitApiRequests(courierId, "courier:location", LOCATION_LIMIT, LOCATION_WINDOW_MS);
  } catch (error) {
    console.error("Courier location rate limit check failed", rateLimitDiagnostics(error));
    throw new AppError(503, "Location sharing is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE");
  }
  if (!result.success) throw new RateLimitError(result.reset);
}

export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "COURIER");
    await enforceLocationLimit(actor.id);
    const input = await parseRequestBody(request, courierLocationSchema, 1024);
    const result = await updateCourierLocation(actor, input);
    return successResponse("Location updated", result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "COURIER");
    await stopCourierLocation(actor);
    return successResponse("Location sharing stopped", { sharing: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
