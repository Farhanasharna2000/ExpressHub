"use client";

import { useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { errorMessage } from "@/lib/client/api";
import { useAppLocale } from "@/lib/i18n/use-format";
import { useTranslations } from "next-intl";

// The API authenticates with an in-memory bearer token, so the PDF is fetched here and
// shown from a blob URL. The tab is opened during the click so popup blockers allow it.
export function PrintLabelButton({ shipmentId, trackingNumber }: { shipmentId: string; trackingNumber: string }) {
  const t = useTranslations("label");
  const locale = useAppLocale();
  const { store } = useSession();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function open() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const tab = window.open("", "_blank");
    try {
      const blob = await store.api.request<Blob>(`/shipments/${encodeURIComponent(shipmentId)}/label?lang=${locale}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      if (tab && !tab.closed) {
        tab.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `expresshub-label-${trackingNumber}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      toast.error(t("openFailed"), errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={() => void open()} disabled={busy} aria-label={t("aria", { trackingNumber })}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Printer aria-hidden="true" />}
      {t("print")}
    </Button>
  );
}
