"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MailWarning, RotateCcw, X } from "lucide-react";
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
  const [confirmAll, setConfirmAll] = useState(false);
  const pending = useRef(false);
  if (!data || data.notifications.length === 0) return null;

  async function act(key: string, action: () => Promise<unknown>, success: [string, string], failure: string) {
    if (pending.current) return;
    pending.current = true;
    setBusyId(key);
    try {
      await action();
      toast.success(...success);
    } catch (error) {
      toast.error(failure, errorMessage(error));
    } finally {
      pending.current = false;
      setBusyId(null);
      setConfirmAll(false);
    }
  }

  const dismiss = (id: string) => act(
    `dismiss:${id}`,
    () => store.api.request(`/admin/notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
    ["Email dismissed", "It will not be sent."],
    "Could not dismiss email",
  );

  const dismissAll = () => act(
    "dismiss-all",
    () => store.api.request("/admin/notifications/dismiss-all", { method: "POST" }),
    ["Failed emails dismissed", "None of them will be sent."],
    "Could not dismiss emails",
  );

  const retry = (id: string) => act(
    `retry:${id}`,
    () => store.api.request(`/admin/notifications/${encodeURIComponent(id)}/retry`, { method: "POST" }),
    ["Email queued", "It will be sent again in a moment."],
    "Could not retry email",
  );

  return (
    <Card className="border-amber-300/60 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <MailWarning className="size-4 text-amber-600" aria-hidden="true" /> Emails that could not be sent
            </CardTitle>
            <CardDescription>
              {data.pagination.total} customer {data.pagination.total === 1 ? "email has" : "emails have"} failed after every retry.
              Retry to send now, or dismiss old ones you no longer need.
            </CardDescription>
          </div>
          {confirmAll ? (
            <div className="flex items-center gap-2" role="group" aria-label="Confirm dismissing all failed emails">
              <span className="text-xs text-muted-foreground">Dismiss all {data.pagination.total}? They won&apos;t be sent.</span>
              <Button type="button" size="sm" variant="destructive" onClick={() => void dismissAll()} disabled={busyId !== null}>
                Dismiss all
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmAll(false)} disabled={busyId !== null}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmAll(true)} disabled={busyId !== null}>
              <X aria-hidden="true" /> Dismiss all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {data.notifications.map((notification) => (
            <li key={notification.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-0.5">
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
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void retry(notification.id)}
                  disabled={busyId !== null}
                  aria-label={`Retry ${notificationLabel(notification.type).toLowerCase()} email for ${notification.shipment.trackingNumber}`}
                >
                  <RotateCcw className={busyId === `retry:${notification.id}` ? "animate-spin" : undefined} aria-hidden="true" /> Retry
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void dismiss(notification.id)}
                  disabled={busyId !== null}
                  aria-label={`Dismiss ${notificationLabel(notification.type).toLowerCase()} email for ${notification.shipment.trackingNumber}`}
                >
                  <X aria-hidden="true" /> Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
