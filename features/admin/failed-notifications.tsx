"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MailWarning, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/client/api";
import { useSession } from "@/features/auth/provider";
import { dateTime } from "@/features/shipments/contracts";
import { useResource } from "@/features/shipments/use-resource";

export interface FailedNotification {
  id: string;
  type: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  shipment: { id: string; trackingNumber: string };
  recipient: { id: string; name: string; email: string };
}

export function notificationLabel(type: string) {
  return type.replace(/^SHIPMENT_/, "").toLowerCase().replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}

// Shown only when some emails have used up their retries.
export function FailedNotificationsCard() {
  const { store } = useSession();
  const { data } = useResource<{ notifications: FailedNotification[]; pagination: { total: number } }>("/admin/notifications?limit=5");
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = useRef(false);
  if (!data || data.notifications.length === 0) return null;

  async function retry(id: string) {
    if (pending.current) return;
    pending.current = true;
    setBusyId(id);
    try {
      await store.api.request(`/admin/notifications/${encodeURIComponent(id)}/retry`, { method: "POST" });
      toast.success("Email queued", "It will be sent again in a moment.");
    } catch (error) {
      toast.error("Could not retry email", errorMessage(error));
    } finally {
      pending.current = false;
      setBusyId(null);
    }
  }

  return (
    <Card className="border-amber-300/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MailWarning className="size-4 text-amber-600" aria-hidden="true" /> Emails that could not be sent
        </CardTitle>
        <CardDescription>
          {data.pagination.total} customer {data.pagination.total === 1 ? "email has" : "emails have"} failed after every retry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {data.notifications.map((notification) => (
            <li key={notification.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">
                  {notificationLabel(notification.type)} ·{" "}
                  <Link href={`/admin/shipments/${encodeURIComponent(notification.shipment.id)}`} className="font-mono text-primary hover:underline">
                    {notification.shipment.trackingNumber}
                  </Link>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  To {notification.recipient.name} · {notification.attempts} attempts · {dateTime(notification.updatedAt)}
                </p>
                {notification.lastError && <p className="truncate text-xs text-destructive">{notification.lastError}</p>}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void retry(notification.id)}
                disabled={busyId !== null}
                aria-label={`Retry ${notificationLabel(notification.type).toLowerCase()} email for ${notification.shipment.trackingNumber}`}
              >
                <RotateCcw className={busyId === notification.id ? "animate-spin" : undefined} aria-hidden="true" /> Retry
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
