import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { retryAllDeadNotifications } from "@/services/notifications/outbox";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const result = await retryAllDeadNotifications(actor);
    return successResponse("Failed notifications queued again", result);
  } catch (error) {
    return handleRouteError(error);
  }
}
