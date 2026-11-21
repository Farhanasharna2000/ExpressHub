"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { archiveFormSchema } from "@/lib/client/form-schemas";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import { isShipmentArchivable } from "@/features/admin/contracts";
import { type Shipment } from "./contracts";
import { useTranslations } from "next-intl";
import { useStatusLabel } from "@/lib/i18n/use-format";
import { translateKnownMessage } from "@/lib/i18n/bridge";

interface ArchiveShipmentControlProps {
  shipment: Shipment;
  onSuccess?: () => void;
}

export function ArchiveShipmentControl({
  shipment,
  onSuccess,
}: ArchiveShipmentControlProps) {
  const t = useTranslations("archive");
  const statusLabel = useStatusLabel();
  const router = useRouter();
  const { store } = useSession();

  const [modalOpen, setModalOpen] = useState(false);
  const form = useForm({ mode: "onChange", resolver: zodResolver(archiveFormSchema("An archival reason")), defaultValues: { reason: "" } });
  const reasonError = form.formState.errors.reason?.message;
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const [mutationError, setMutationError] = useState<unknown>(null);

  const archivable = isShipmentArchivable(shipment.status);

  async function handleArchive() {
    if (pendingRef.current) return;
    if (!await form.trigger(undefined, { shouldFocus: true }) || pendingRef.current) return;
    pendingRef.current = true;
    const cleanReason = form.getValues("reason").trim();
    setBusy(true);
    setMutationError(null);

    try {
      await store.api.request(`/shipments/${encodeURIComponent(shipment.id)}`, {
        method: "DELETE",
        body: { reason: cleanReason },
      });

      setModalOpen(false);
      toast.success(t("archived"), t("archivedText"));
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/shipments");
      }
    } catch (err) {
      setMutationError(err);
      toast.error(
        err instanceof ApiError && err.status === 409
          ? t("conflict")
          : t("failed"),
        errorMessage(err)
      );
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Archive className="size-4 text-destructive" />
            {t("title")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {archivable ? (
          <>
            <p className="text-xs text-muted-foreground">
              {t("terminal", { status: statusLabel(shipment.status) })}
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                form.reset();
                setMutationError(null);
                setModalOpen(true);
              }}
            >
              <Trash2 className="size-4 mr-1.5" />
              {t("archiveButton")}
            </Button>
          </>
        ) : (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p>
              {t.rich("notAllowed", { b: (chunks) => <strong>{chunks}</strong> })}
            </p>
          </div>
        )}

        <Dialog open={modalOpen} onOpenChange={(open) => { if (!pendingRef.current) setModalOpen(open); }}>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("confirmText")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="field">
                <label htmlFor="shipment-archive-reason" className="text-sm font-medium">
                  {t("reason")}
                </label>
                <textarea
                  id="shipment-archive-reason"
                  rows={3}
                  {...form.register("reason")}
                  aria-invalid={Boolean(reasonError)}
                  aria-describedby={reasonError ? "archive-reason-error" : undefined}
                  disabled={busy}
                  placeholder={t("reasonPlaceholder")}
                  className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {reasonError && <p id="archive-reason-error" role="alert" className="text-xs text-destructive mt-1">{translateKnownMessage(reasonError)}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => void handleArchive()}>
                  {busy && <Loader2 className="animate-spin size-4 mr-2" />}
                  {t("confirm")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
