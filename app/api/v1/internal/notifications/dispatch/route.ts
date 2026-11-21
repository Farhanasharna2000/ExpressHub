import type { NextRequest } from "next/server";
import { handleRouteError } from "@/lib/auth/route-helpers";
import { hasCronSecret } from "@/lib/http/cron-auth";
import { AppError } from "@/lib/http/errors";
import { successResponse } from "@/lib/http/responses";
import { dispatchPendingNotifications } from "@/services/notifications/outbox";
import { dispatchPendingWebhooks } from "@/services/webhooks/outbox";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BATCHES = 5;

async function sweep(request: NextRequest) {
  try {
    if (!hasCronSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
      throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
    }
    const totals = { claimed: 0, sent: 0, skipped: 0, retrying: 0, dead: 0 };
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const summary = await dispatchPendingNotifications();
      totals.claimed += summary.claimed;
      totals.sent += summary.sent;
      totals.skipped += summary.skipped;
      totals.retrying += summary.retrying;
      totals.dead += summary.dead;
      if (summary.claimed === 0) break;
    }
    // The same scheduled sweep retries merchant webhook deliveries.
    const webhooks = { claimed: 0, sent: 0, retrying: 0, dead: 0 };
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const summary = await dispatchPendingWebhooks();
      webhooks.claimed += summary.claimed;
      webhooks.sent += summary.sent;
      webhooks.retrying += summary.retrying;
      webhooks.dead += summary.dead;
      if (summary.claimed === 0) break;
    }
    return successResponse("Notifications dispatched", { summary: totals, webhooks });
  } catch (error) {
    return handleRouteError(error, request);
  }
}

// Vercel Cron sends GET; POST suits manual runs and external schedulers.
export const GET = sweep;
export const POST = sweep;
