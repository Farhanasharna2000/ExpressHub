"use client";

import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

import { useTranslations } from "next-intl";
// Shows a key or signing secret that the server returns only once.
export function OneTimeSecret({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const t = useTranslations("developer");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copiedNamed", { label }), t("storeItSomewhereSafe"));
    } catch {
      toast.error(t("couldNotCopy"), t("selectTheTextAnd"));
    }
  }

  return (
    <div role="status" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" aria-hidden="true" /> {t("copyNow", { label: label.toLowerCase() })}
      </p>
      <p>{t("itWillNotBe")}</p>
      <code data-testid="one-time-secret" className="block overflow-x-auto rounded-md bg-white px-3 py-2 font-mono text-xs break-all text-ink">
        {value}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void copy()}>
          <Copy aria-hidden="true" /> {t("copyNamed", { label: label.toLowerCase() })}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>{t("iHaveSavedIt")}</Button>
      </div>
    </div>
  );
}
