"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/provider";
import { deliveryQueue, flushDeliveryQueue, QUEUE_EVENT, type PendingDelivery } from "./proof-queue";

import { useTranslations } from "next-intl";
const RETRY_INTERVAL_MS = 60_000;

export function useDeliveryQueue(courierId: string | undefined) {
  const [items, setItems] = useState<PendingDelivery[]>([]);
  const load = useCallback(() => {
    deliveryQueue.list()
      .then((all) => setItems(all.filter((item) => item.courierId === courierId)))
      .catch(() => setItems([]));
  }, [courierId]);
  useEffect(() => {
    load();
    window.addEventListener(QUEUE_EVENT, load);
    return () => window.removeEventListener(QUEUE_EVENT, load);
  }, [load]);
  return items;
}

// Registers the courier service worker and sends queued deliveries whenever the
// phone is back online. Background Sync is not used: the access token lives only
// in page memory, so uploads run from the open courier app.
export function CourierPwa() {
  const t = useTranslations("courier");
  const { store, user } = useSession();
  const courierId = user?.id;
  const items = useDeliveryQueue(courierId);
  const [sending, setSending] = useState(false);
  const waiting = items.filter((item) => !item.failed);
  const failed = items.filter((item) => item.failed);

  const flush = useCallback(async () => {
    if (!navigator.onLine || !courierId) return;
    setSending(true);
    try {
      await flushDeliveryQueue(store.api, courierId);
    } finally {
      setSending(false);
    }
  }, [store, courierId]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/courier" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!waiting.length) return;
    const first = window.setTimeout(() => void flush(), 0);
    window.addEventListener("online", flush);
    const timer = window.setInterval(() => void flush(), RETRY_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", flush);
      window.clearInterval(timer);
    };
  }, [waiting.length, flush]);

  if (!items.length) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="flex items-center gap-2">
        {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="size-4" aria-hidden="true" />}
        {waiting.length > 0 && <span>{t.rich("waitingUpload", { b: (chunks) => <strong>{chunks}</strong>, count: waiting.length })}</span>}
        {failed.length > 0 && <span>{t("failedUpload", { count: failed.length })}</span>}
      </span>
      {waiting.length > 0 && (
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => void flush()} disabled={sending}>
          {sending ? t("uploading") : t("uploadNow")}
        </Button>
      )}
    </div>
  );
}
