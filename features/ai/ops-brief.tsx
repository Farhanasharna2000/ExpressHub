"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/features/auth/provider";
import { dateTime, statusLabel } from "@/features/shipments/contracts";
import { useResource } from "@/features/shipments/use-resource";
import { aiErrorMessage } from "./ai-error";
import { bangladeshDate, briefFigures, briefShipments, latestBrief, type OpsBrief } from "./contracts";

export function OpsBriefCard() {
  const { data: status } = useResource<{ opsBrief?: boolean }>("/ai/status");
  if (!status?.opsBrief) return null;
  return <OpsBriefPanel />;
}

function OpsBriefPanel() {
  const { store } = useSession();
  const { data, loading, error: readError, reload } = useResource<{ brief: OpsBrief | null }>("/ai/ops-brief");
  const [generated, setGenerated] = useState<OpsBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brief = latestBrief(bangladeshDate(), generated, data?.brief);

  async function generate(refresh: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await store.api.request<{ brief: OpsBrief }>("/ai/ops-brief", { method: "POST", body: { refresh } });
      setGenerated(result.brief);
    } catch (cause) {
      setError(aiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" aria-hidden="true" /> Daily operations brief
            </CardTitle>
            <CardDescription>
              An AI summary of today&apos;s figures with suggested next steps. Check the numbers beside it before acting.
            </CardDescription>
          </div>
          {brief && (
            <Button type="button" variant="outline" size="sm" onClick={() => void generate(true)} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden="true" /> Refresh brief
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3" aria-live="polite" aria-busy={busy}>
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}

        {/* A failed read must not look like "no brief yet", or the admin spends a generation. */}
        {!brief && readError && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Couldn&apos;t check for today&apos;s saved brief. {aiErrorMessage(readError)}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {!brief && !readError && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void generate(false)} disabled={busy || loading}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {busy ? "Reading today's figures…" : "Prepare today's brief"}
            </Button>
            <span className="text-xs text-muted-foreground">Prepared once a day and saved for you. Shipment figures are sent to our AI provider; customer details are not.</span>
          </div>
        )}

        {brief && <BriefBody brief={brief} />}
      </CardContent>
    </Card>
  );
}

function BriefBody({ brief }: { brief: OpsBrief }) {
  const shipments = briefShipments(brief.facts);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3 rounded-lg border border-primary/20 bg-background p-4 text-sm">
        <p className="text-base font-semibold text-ink">{brief.brief.headline}</p>
        <p className="leading-relaxed text-muted-foreground">{brief.brief.summary}</p>

        {brief.brief.actions.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Suggested next steps</h3>
            <ol className="space-y-2">
              {brief.brief.actions.map((action, index) => (
                <li key={`${index}-${action.title}`} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>
                    <span className="font-medium">{action.title}</span>
                    {action.detail && <span className="text-muted-foreground"> {action.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {brief.brief.unverified.length > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Not found in today&apos;s figures: {brief.brief.unverified.join(", ")}. Rely on the figures beside the brief for these.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Prepared {dateTime(brief.generatedAt)} with {brief.model}
          {brief.cached ? " · saved brief" : ""}
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border bg-background p-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Based on these figures</h3>
          <dl className="grid grid-cols-2 gap-2">
            {briefFigures(brief.facts).map((figure) => (
              <div key={figure.label} className="rounded-md bg-muted/40 px-2.5 py-2">
                <dt className="text-[11px] text-muted-foreground">{figure.label}</dt>
                <dd className={`text-lg font-bold ${figure.alert ? "text-destructive" : ""}`}>{figure.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {shipments.length > 0 && (
          <div className="rounded-lg border bg-background p-3">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Shipments to check</h3>
            <ul className="space-y-1.5 text-xs">
              {shipments.map((shipment) => (
                <li key={shipment.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/shipments/${encodeURIComponent(shipment.id)}`}
                    className="truncate font-mono font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <span className="shrink-0 text-muted-foreground">
                    {shipment.reason} · {statusLabel(shipment.status)} · {shipment.hoursSinceUpdate}h
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
