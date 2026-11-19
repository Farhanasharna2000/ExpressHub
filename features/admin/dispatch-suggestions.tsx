"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Loader2, Route, Sparkles, TriangleAlert, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/features/auth/provider";
import { useResource } from "@/features/shipments/use-resource";
import { ApiError, errorMessage } from "@/lib/client/api";
import { dispatchSourceNote, waitingLabel, type DispatchQueue, type DispatchResult, type DispatchSuggestion } from "./dispatch-contracts";

// Assigns through the existing endpoint. The shipment has no courier yet, so the expected
// courier is null; a 409 means someone else assigned it first.
function useAssign(onDone: () => void) {
  const { store } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);
  async function assign(shipmentId: string, trackingNumber: string, suggestion: DispatchSuggestion) {
    if (pending.current) return;
    pending.current = true;
    setBusy(`${shipmentId}:${suggestion.courierId}`);
    try {
      await store.api.request(`/shipments/${encodeURIComponent(shipmentId)}/assign-courier`, {
        method: "PATCH",
        body: { courierId: suggestion.courierId, expectedCourierId: null },
      });
      toast.success("Courier assigned", `${suggestion.name} will collect ${trackingNumber}.`);
      onDone();
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      toast.error(conflict ? "Already assigned" : "Could not assign courier", conflict ? "Someone assigned this shipment first. The list has been refreshed." : errorMessage(error));
      if (conflict) onDone();
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }
  return { assign, busy };
}

function SuggestionRow({ suggestion, busy, onAssign, primary }: { suggestion: DispatchSuggestion; busy: boolean; onAssign: () => void; primary?: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">{suggestion.name}</p>
        <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
      </div>
      <Button type="button" size="sm" variant={primary ? "default" : "outline"} onClick={onAssign} disabled={busy} aria-label={`Assign ${suggestion.name}`}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserCheck aria-hidden="true" />} Assign
      </Button>
    </li>
  );
}

// Admin dashboard: the oldest paid shipments still waiting for a courier, each with the
// rule-based top pick and a one-click Assign. Hidden when nothing is waiting.
export function DispatchQueueCard() {
  const { data, error, reload } = useResource<DispatchQueue>("/admin/dispatch/queue");
  const { assign, busy } = useAssign(reload);
  if (error && !data) {
    return (
      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-destructive"><TriangleAlert className="size-4" aria-hidden="true" /> Dispatch suggestions could not be loaded. {errorMessage(error)}</span>
          <Button type="button" size="sm" variant="outline" onClick={reload}>Try again</Button>
        </CardContent>
      </Card>
    );
  }
  if (!data || data.shipments.length === 0) return null;

  return (
    <Card className="border-primary/20 shadow-none" data-testid="dispatch-queue">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Route className="size-4 text-primary" aria-hidden="true" /> Dispatch suggestions</CardTitle>
        <CardDescription>
          {data.total} paid {data.total === 1 ? "shipment is" : "shipments are"} waiting for a courier. The best match by workload, area and delivery record is shown; open a shipment for AI-ranked options.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.shipments.map((shipment) => (
            <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 space-y-0.5">
                <Link href={`/admin/shipments/${encodeURIComponent(shipment.id)}`} className="font-mono text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {shipment.trackingNumber}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {waitingLabel(shipment.waitingHours)} · {shipment.weightKg} kg{shipment.originHub ? ` · from ${shipment.originHub}` : ""}
                </p>
                {shipment.suggestion ? (
                  <p className="text-xs"><span className="font-semibold">{shipment.suggestion.name}</span> <span className="text-muted-foreground">· {shipment.suggestion.reason}</span></p>
                ) : (
                  <p className="text-xs text-muted-foreground">No active couriers to suggest.</p>
                )}
              </div>
              {shipment.suggestion && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void assign(shipment.id, shipment.trackingNumber, shipment.suggestion!)}
                  disabled={busy !== null}
                  aria-label={`Assign ${shipment.suggestion.name} to ${shipment.trackingNumber}`}
                >
                  {busy === `${shipment.id}:${shipment.suggestion.courierId}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserCheck aria-hidden="true" />} Assign
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// Admin shipment detail: up to three couriers, ranked by AI when it is on, otherwise by rules.
export function ShipmentDispatchSuggestions({ shipmentId, trackingNumber, onAssigned }: { shipmentId: string; trackingNumber: string; onAssigned: () => void }) {
  const { store } = useSession();
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef(false);
  const { assign, busy } = useAssign(() => {
    setResult(null);
    onAssigned();
  });

  async function suggest() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      setResult(await store.api.request<DispatchResult>("/admin/dispatch/suggestions", { method: "POST", body: { shipmentId } }));
    } catch (cause) {
      setError(cause);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none" data-testid="dispatch-suggestions">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" aria-hidden="true" /> Courier suggestions</CardTitle>
        <CardDescription>Ranked by workload, area, live location and delivery record. You choose who is assigned.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite" aria-busy={loading}>
        <Button type="button" variant={result ? "outline" : "default"} size="sm" onClick={() => void suggest()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {loading ? "Ranking couriers…" : result ? "Suggest again" : "Suggest couriers"}
        </Button>
        {Boolean(error) && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {errorMessage(error)}
          </p>
        )}
        {result && (
          result.suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no active couriers to suggest.</p>
          ) : (
            <>
              <ol className="space-y-2">
                {result.suggestions.map((suggestion, index) => (
                  <SuggestionRow
                    key={suggestion.courierId}
                    suggestion={suggestion}
                    primary={index === 0}
                    busy={busy !== null}
                    onAssign={() => void assign(shipmentId, trackingNumber, suggestion)}
                  />
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">{dispatchSourceNote(result)}</p>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
