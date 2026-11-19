import type { NextRequest } from "next/server";
import { requireRole, requireUser } from "@/lib/auth/require-user";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { dismissNotification } from "@/services/notifications/outbox";
import { notificationIdSchema } from "@/validators/notification";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireRole(await requireUser(request), "ADMIN");
    const id = notificationIdSchema.parse((await context.params).id);
    const notification = await dismissNotification(actor, id);
    return successResponse("Notification dismissed", { notification });
  } catch (error) {
    return handleRouteError(error);
  }
}
