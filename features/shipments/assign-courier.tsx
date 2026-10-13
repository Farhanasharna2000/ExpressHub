"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { courierFormSchema } from "@/lib/client/form-schemas";
import { useEffect, useState, useRef } from "react";
import { UserCheck, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { ApiError, errorMessage } from "@/lib/client/api";
import type { CurrentUser } from "@/types/api";
import { isCourierAssignable, statusLabel, type Shipment } from "./contracts";

interface AssignCourierControlProps {
  shipment: Shipment;
  onSuccess: () => void;
}

export function AssignCourierControl({
  shipment,
  onSuccess,
}: AssignCourierControlProps) {
  const { store } = useSession();

  const [couriers, setCouriers] = useState<CurrentUser[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [couriersError, setCouriersError] = useState<unknown>(null);

  const form = useForm({ mode: "onChange", resolver: zodResolver(courierFormSchema), defaultValues: { courierId: shipment.courierId ?? "" } });
  const selectedCourierId = form.watch("courierId");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const assignable = isCourierAssignable(shipment.status);

  // Sync selected ID when shipment changes
  useEffect(() => {
    form.reset({ courierId: shipment.courierId ?? "" });
  }, [shipment.courierId, form.reset]);

  // Load active couriers for admin selection
  async function loadCouriers() {
    setLoadingCouriers(true);
    setCouriersError(null);
    try {
      const res = await store.api.request<{ users: CurrentUser[] }>(
        "/users?role=COURIER&isActive=true&limit=100"
      );
      setCouriers(res.users ?? []);
    } catch (err) {
      setCouriersError(err);
    } finally {
      setLoadingCouriers(false);
    }
  }

  useEffect(() => {
    void loadCouriers();
  }, [store]);

  async function handleAssign() {
    if (pendingRef.current || !selectedCourierId || !assignable) return;
    if (selectedCourierId === (shipment.courierId ?? "")) return;

    if (!await form.trigger(undefined, { shouldFocus: true }) || pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setMutationError(null);
    setSuccessNotice(null);

    try {
      await store.api.request(`/shipments/${encodeURIComponent(shipment.id)}/assign-courier`, {
        method: "PATCH",
        body: {
          courierId: selectedCourierId,
          expectedCourierId: shipment.courierId ?? null,
        },
      });

      const assignedCourier = couriers.find((c) => c.id === selectedCourierId);
      const msg = `Courier ${assignedCourier ? `${assignedCourier.name} (${assignedCourier.email})` : selectedCourierId} assigned successfully.`;
      setSuccessNotice(msg);
      toast.success("Assignment Confirmed", msg);
      onSuccess();
    } catch (err) {
      setMutationError(err);
      const isConflict = err instanceof ApiError && err.status === 409;
      toast.error(
        isConflict ? "Assignment conflict detected" : "Failed to assign courier",
        isConflict
          ? `${err.message}. The shipment has been refreshed with the latest data.`
          : errorMessage(err)
      );
      if (isConflict) {
        // Concurrent conflict: reload latest shipment data
        onSuccess();
      }
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  const assignedCourierObj = couriers.find((c) => c.id === shipment.courierId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <UserCheck className="size-5" />
            Courier Assignment
          </span>
          {loadingCouriers && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 font-normal">
              <Loader2 className="size-3 animate-spin" /> Loading Couriers…
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Current status display */}
        <div className="p-3 rounded-lg border bg-muted/30">
          <span className="text-xs text-muted-foreground block">Currently Assigned:</span>
          {shipment.courierId ? (
            <p className="font-medium text-sm mt-0.5">
              {assignedCourierObj ? (
                <>
                  <span className="font-semibold">{assignedCourierObj.name}</span>{" "}
                  <span className="text-muted-foreground">({assignedCourierObj.email})</span>
                  {assignedCourierObj.phone && (
                    <span className="text-muted-foreground"> • Tel: {assignedCourierObj.phone}</span>
                  )}
                </>
              ) : (
                `Courier ID: ${shipment.courierId}`
              )}
            </p>
          ) : (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mt-0.5">
              Unassigned - No courier currently assigned
            </p>
          )}
        </div>

        {/* Form controls if assignable */}
        {assignable ? (
          <div className="space-y-3 pt-1">
            <div className="field">
              <label htmlFor="courier-select" className="text-sm font-medium">
                Select Active Courier to Assign:
              </label>
              <div className="flex gap-2 mt-1">
                <select
                  id="courier-select"
                  {...form.register("courierId")}
                  aria-invalid={Boolean(form.formState.errors.courierId)}
                  disabled={busy || loadingCouriers}
                  className="flex-1 h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">-- Choose active courier --</option>
                  {couriers.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.name} ({courier.email}) {courier.phone ? ` - ${courier.phone}` : ""}
                    </option>
                  ))}
                </select>
                {form.formState.errors.courierId && <p role="alert" className="text-xs text-destructive">{form.formState.errors.courierId.message}</p>}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={loadCouriers}
                  disabled={loadingCouriers}
                  title="Reload courier list"
                >
                  <RefreshCw className={`size-4 ${loadingCouriers ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {!!couriersError && (
                <p className="text-xs text-destructive mt-1">
                  Could not load couriers: {errorMessage(couriersError)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="default"
                disabled={
                  busy ||
                  !selectedCourierId ||
                  selectedCourierId === (shipment.courierId ?? "") ||
                  loadingCouriers
                }
                onClick={() => void handleAssign()}
                className="min-h-10"
              >
                {busy && <Loader2 className="animate-spin size-4 mr-2" />}
                {busy ? "Assigning…" : shipment.courierId ? "Reassign Courier" : "Assign Courier"}
              </Button>
              {shipment.courierId && selectedCourierId === shipment.courierId && (
                <span className="text-xs text-muted-foreground">Courier is currently assigned.</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-md border">
            <AlertCircle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <p>
              Courier assignment is restricted to <strong>CREATED</strong> or <strong>FAILED</strong> status shipments.
              This shipment is currently <strong>{statusLabel(shipment.status)}</strong> and cannot be reassigned during active transit or after terminal completion.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
