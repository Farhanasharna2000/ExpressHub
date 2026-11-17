import type { NextRequest } from "next/server";
import { checkAuthRateLimit, handleRouteError } from "@/lib/auth/route-helpers";
import { AppError } from "@/lib/http/errors";
import { createTrackingStream } from "@/services/tracking-stream";
import { getPublicTracking } from "@/services/tracking.service";
import { trackingNumberSchema } from "@/validators/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const limited = await checkAuthRateLimit(request, "track:stream", 30);
    if (limited) return limited;
    const trackingNumber = trackingNumberSchema.parse((await context.params).trackingNumber);
    const initial = await getPublicTracking(trackingNumber);
    if (!initial) throw new AppError(404, "No shipment matches this tracking number", "NOT_FOUND");
    const stream = createTrackingStream({ initial, load: () => getPublicTracking(trackingNumber), signal: request.signal });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
