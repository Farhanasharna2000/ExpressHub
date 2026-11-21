"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MailWarning, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/client/api";
import { useSession } from "@/features/auth/provider";
import { useFormat } from "@/lib/i18n/use-format";
import { useResource } from "@/features/shipments/use-resource";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.notifications");
  const f = useFormat();
  const kind = (type: string) => { const key = `type.${type}` as Parameters<typeof t>[0]; return t.has(key) ? t(key) : notificationLabel(type); };
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
    [t("emailDismissed"), t("itWillNotBe")],
    t("couldNotDismissEmail"),
  );

  const dismissAll = () => act(
    "dismiss-all",
    () => store.api.request("/admin/notifications/dismiss-all", { method: "POST" }),
    [t("failedEmailsDismissed"), t("noneOfThemWill")],
    t("couldNotDismissEmails"),
  );

  const retry = (id: string) => act(
    `retry:${id}`,
    () => store.api.request(`/admin/notifications/${encodeURIComponent(id)}/retry`, { method: "POST" }),
    [t("emailQueued"), t("itWillBeSent")],
    t("couldNotRetryEmail"),
  );

  return (
    <Card className="border-amber-300/60 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <MailWarning className="size-4 text-amber-600" aria-hidden="true" /> {t("title")}
            </CardTitle>
            <CardDescription>
              {t("intro", { count: data.pagination.total })}
            </CardDescription>
          </div>
          {confirmAll ? (
            <div className="flex items-center gap-2" role="group" aria-label={t("confirmDismissingAllFailed")}>
              <span className="text-xs text-muted-foreground">{t("confirmAll", { count: data.pagination.total })}</span>
              <Button type="button" size="sm" variant="destructive" onClick={() => void dismissAll()} disabled={busyId !== null}>
                {t("dismissAll")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmAll(false)} disabled={busyId !== null}>
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmAll(true)} disabled={busyId !== null}>
              <X aria-hidden="true" /> {t("dismissAll")}
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
                  {kind(notification.type)} ·{" "}
                  <Link href={`/admin/shipments/${encodeURIComponent(notification.shipment.id)}`} className="font-mono text-primary hover:underline">
                    {notification.shipment.trackingNumber}
                  </Link>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t("meta", { name: notification.recipient.name, attempts: notification.attempts, time: f.dateTime(notification.updatedAt) })}
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
                  aria-label={t("retryLabel", { kind: kind(notification.type).toLowerCase(), tracking: notification.shipment.trackingNumber })}
                >
                  <RotateCcw className={busyId === `retry:${notification.id}` ? "animate-spin" : undefined} aria-hidden="true" /> {t("retry")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void dismiss(notification.id)}
                  disabled={busyId !== null}
                  aria-label={t("dismissLabel", { kind: kind(notification.type).toLowerCase(), tracking: notification.shipment.trackingNumber })}
                >
                  <X aria-hidden="true" /> {t("dismiss")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
