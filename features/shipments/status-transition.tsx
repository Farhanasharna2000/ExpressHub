"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transitionFormSchema } from "@/lib/client/form-schemas";
import { useState, useRef } from "react";
import { Loader2, ArrowRight, CheckCircle, AlertTriangle, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import type { ShipmentStatus, UserRole } from "@/types/api";
import {
  getAllowedTransitions,
  isNoteRequired,
  statusLabel,
  validateTransitionReadiness,
  type Shipment,
} from "./contracts";

interface StatusTransitionControlProps {
  shipment: Shipment;
  role: UserRole;
  onSuccess: () => void;
}

export function StatusTransitionControl({
  shipment,
  role,
  onSuccess,
}: StatusTransitionControlProps) {
  const { store } = useSession();
  const allowed = getAllowedTransitions(shipment.status, role);

  const [activeTarget, setActiveTarget] = useState<ShipmentStatus | null>(null);
  const form = useForm({ mode: "onChange", resolver: zodResolver(transitionFormSchema(activeTarget !== null && isNoteRequired(activeTarget))), defaultValues: { note: "" } });
  const note = form.watch("note");
  const noteError = form.formState.errors.note?.message;
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [lastActionSuccess, setLastActionSuccess] = useState<string | null>(null);
  const pendingRef = useRef(false);

  if (allowed.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Delivery Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This shipment is in terminal status ({statusLabel(shipment.status)}). No further operational transitions are available.
          </p>
        </CardContent>
      </Card>
    );
  }

  function openDialog(target: ShipmentStatus) {
    setActiveTarget(target);
    form.reset();
    setMutationError(null);
  }

  function closeDialog() {
    if (!pendingRef.current) {
      setActiveTarget(null);
      form.reset();
    }
  }

  async function executeTransition(target: ShipmentStatus) {
    if (pendingRef.current) return;

    if (!await form.trigger(undefined, { shouldFocus: true }) || pendingRef.current) return;

    pendingRef.current = true;
    setBusy(true);
    setMutationError(null);
    setLastActionSuccess(null);

    try {
      const payload: { status: ShipmentStatus; expectedStatus: ShipmentStatus; note?: string } = {
        status: target,
        expectedStatus: shipment.status,
      };
      const clean = form.getValues("note").trim();
      if (clean) payload.note = clean;

      await store.api.request(`/shipments/${encodeURIComponent(shipment.id)}/status`, {
        method: "PATCH",
        body: payload,
      });

      const msg = `Shipment status successfully transitioned to ${statusLabel(target)}.`;
      setLastActionSuccess(msg);
      toast.success("Update Confirmed", msg);
      setActiveTarget(null);
      form.reset();
      onSuccess();
    } catch (err) {
      setMutationError(err);
      const isConflict = err instanceof ApiError && err.status === 409;
      toast.error(
        isConflict ? "Concurrent update detected" : "Status update failed",
        isConflict
          ? `${err.message}. The shipment has been reloaded with its latest state.`
          : errorMessage(err)
      );
      if (isConflict) {
        // Concurrency conflict: reload latest status
        onSuccess();
      }
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  function getButtonIcon(status: ShipmentStatus) {
    switch (status) {
      case "DELIVERED":
        return <CheckCircle className="size-4" />;
      case "FAILED":
        return <AlertTriangle className="size-4" />;
      case "CANCELLED":
        return <XCircle className="size-4" />;
      case "RETURNED":
        return <RotateCcw className="size-4" />;
      default:
        return <ArrowRight className="size-4" />;
    }
  }

  function getButtonVariant(status: ShipmentStatus): "default" | "destructive" | "outline" {
    if (status === "DELIVERED") return "default";
    if (status === "FAILED" || status === "CANCELLED") return "destructive";
    return "outline";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Operational Actions</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Current status: <strong>{statusLabel(shipment.status)}</strong>. Select next operational step:
          </p>

          <div className="flex flex-wrap gap-3">
            {allowed.map((target) => {
              const readiness = validateTransitionReadiness(shipment, target, role);
              const requiresNote = isNoteRequired(target) || target === "CANCELLED";

              return (
                <div key={target} className="flex flex-col gap-1">
                  <Button
                    variant={getButtonVariant(target)}
                    disabled={!readiness.eligible || busy}
                    onClick={() => {
                      if (requiresNote) {
                        openDialog(target);
                      } else {
                        void executeTransition(target);
                      }
                    }}
                    className="min-h-11 flex items-center gap-2"
                  >
                    {busy && activeTarget === target ? (
                      <Loader2 className="animate-spin size-4" />
                    ) : (
                      getButtonIcon(target)
                    )}
                    <span>Mark as {statusLabel(target)}</span>
                  </Button>
                  {!readiness.eligible && readiness.reason && (
                    <span className="text-xs text-destructive max-w-xs">{readiness.reason}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal for notes / confirmations */}
        <Dialog open={activeTarget !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
          <DialogContent
            onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
            onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
            showCloseButton={!busy}
          >
            <DialogHeader>
              <DialogTitle>
                Confirm transition to {activeTarget ? statusLabel(activeTarget) : ""}
              </DialogTitle>
              <DialogDescription>
                {activeTarget === "DELIVERED" && "Provide confirmation details of the completed delivery."}
                {activeTarget === "FAILED" && "Provide the specific reason why this delivery attempt failed."}
                {activeTarget === "RETURNED" && "Provide the reason for returning the parcel to the origin."}
                {activeTarget === "CANCELLED" && "This cancellation is permanent. State any reason or note."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="field">
                <label htmlFor="transition-note" className="text-sm font-medium">
                  {activeTarget && isNoteRequired(activeTarget) ? "Note / Reason (Required):" : "Optional Note:"}
                </label>
                <textarea
                  id="transition-note"
                  rows={3}
                  {...form.register("note")}
                  aria-invalid={Boolean(noteError)}
                  aria-describedby={noteError ? "transition-note-error" : undefined}
                  disabled={busy}
                  maxLength={1000}
                  placeholder={
                    activeTarget === "DELIVERED"
                      ? "e.g., Handed parcel to recipient at door"
                      : activeTarget === "FAILED"
                        ? "e.g., Recipient unavailable after 3 phone calls"
                        : activeTarget === "RETURNED"
                          ? "e.g., Returned to hub after multiple failed attempts"
                          : "Add any optional context..."
                  }
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                  <span>{activeTarget && isNoteRequired(activeTarget) ? "Minimum 3 characters" : ""}</span>
                  <span>{note.length} / 1000</span>
                </div>
                {noteError && <p id="transition-note-error" role="alert" className="text-xs text-destructive mt-1">{noteError}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" disabled={busy} onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  variant={activeTarget ? getButtonVariant(activeTarget) : "default"}
                  disabled={busy}
                  onClick={() => {
                    if (activeTarget) void executeTransition(activeTarget);
                  }}
                >
                  {busy && <Loader2 className="animate-spin size-4" />}
                  {busy ? "Updating…" : `Confirm ${activeTarget ? statusLabel(activeTarget) : ""}`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
