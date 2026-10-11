"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ErrorNotice } from "@/components/ui/primitives";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import { isShipmentArchivable } from "@/features/admin/contracts";
import { statusLabel, type Shipment } from "./contracts";

interface ArchiveShipmentControlProps {
  shipment: Shipment;
  onSuccess?: () => void;
}

export function ArchiveShipmentControl({
  shipment,
  onSuccess,
}: ArchiveShipmentControlProps) {
  const router = useRouter();
  const { store } = useSession();

  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>(null);

  const archivable = isShipmentArchivable(shipment.status);

  async function handleArchive() {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setReasonError("An archival reason of at least 3 characters is required.");
      return;
    }

    setBusy(true);
    setMutationError(null);

    try {
      await store.api.request(`/shipments/${encodeURIComponent(shipment.id)}`, {
        method: "DELETE",
        body: { reason: cleanReason },
      });

      setModalOpen(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/shipments");
      }
    } catch (err) {
      setMutationError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Archive className="size-4 text-destructive" />
            Shipment Archival (Soft Delete)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {archivable ? (
          <>
            <p className="text-xs text-muted-foreground">
              This shipment is in terminal status ({statusLabel(shipment.status)}). You can archive this record to remove it from operational dispatch while retaining permanent audit logs.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setReason("");
                setReasonError("");
                setMutationError(null);
                setModalOpen(true);
              }}
            >
              <Trash2 className="size-4 mr-1.5" />
              Archive Shipment Record
            </Button>
          </>
        ) : (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p>
              Shipment archival is only permitted for terminal records (<strong>Delivered</strong>, <strong>Returned</strong>, or <strong>Cancelled</strong>).
              Active shipments in transit cannot be archived until their lifecycle is settled.
            </p>
          </div>
        )}

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>Confirm Shipment Archival</DialogTitle>
              <DialogDescription>
                Archiving softly deletes this shipment from operational lists.
                All audit event records will be permanently retained.
              </DialogDescription>
            </DialogHeader>

            {!!mutationError && (
              <ErrorNotice
                title={
                  mutationError instanceof ApiError && mutationError.status === 409
                    ? "Archival conflict"
                    : "Failed to archive shipment"
                }
              >
                {errorMessage(mutationError)}
              </ErrorNotice>
            )}

            <div className="space-y-4 py-2">
              <div className="field">
                <label htmlFor="shipment-archive-reason" className="text-sm font-medium">
                  Archival Reason (Required):
                </label>
                <textarea
                  id="shipment-archive-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError("");
                  }}
                  disabled={busy}
                  placeholder="e.g., Routine archival of delivered shipment, Customer request, Billing cycle closure..."
                  className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {reasonError && <p className="text-xs text-destructive mt-1">{reasonError}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" disabled={busy} onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => void handleArchive()}>
                  {busy && <Loader2 className="animate-spin size-4 mr-2" />}
                  Confirm Archival
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
