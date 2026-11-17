import type { NextRequest } from "next/server";
import { checkAuthRateLimit, handleRouteError } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { getPublicTracking } from "@/services/tracking.service";
import { trackingNumberSchema } from "@/validators/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const limited = await checkAuthRateLimit(request, "track:lookup", 60);
    if (limited) return limited;
    const trackingNumber = trackingNumberSchema.parse((await context.params).trackingNumber);
    const tracking = await getPublicTracking(trackingNumber);
    if (!tracking) throw new AppError(404, "No shipment matches this tracking number", "NOT_FOUND");
    return successResponse("Tracking fetched successfully", { tracking });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
