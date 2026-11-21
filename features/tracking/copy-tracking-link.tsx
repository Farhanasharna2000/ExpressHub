"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { trackingPath } from "./contracts";
import { useTranslations } from "next-intl";

export function CopyTrackingLink({ trackingNumber }: { trackingNumber: string }) {
  const t = useTranslations("tracking.copyLink");
  async function copy() {
    const url = `${window.location.origin}${trackingPath(trackingNumber)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"), t("copiedText"));
    } catch {
      toast.error(t("failed"), url);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      <Link2 aria-hidden="true" /> {t("button")}
    </Button>
  );
}
