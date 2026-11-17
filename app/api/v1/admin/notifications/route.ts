import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { uniqueQueryParameters } from "@/lib/http/query";
import { listDeadNotifications } from "@/services/notifications/outbox";
import { listDeadNotificationsSchema } from "@/validators/notification";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const input = listDeadNotificationsSchema.parse(uniqueQueryParameters(request.nextUrl.searchParams));
    return successResponse("Failed notifications fetched successfully", await listDeadNotifications(actor, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
