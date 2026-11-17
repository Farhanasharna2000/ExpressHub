"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorNotice } from "@/components/ui/primitives";
import { ResourceSkeleton, Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/client/api";
import { useSession } from "@/features/auth/provider";
import { money, dateTime } from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import {
  PRESETS, analyticsQuery, changeTone, formatChange, formatHours, formatRate, periodLabel, presetRange,
  type AnalyticsFilter, type AnalyticsReport, type Granularity,
} from "./analytics-contracts";

const AnalyticsCharts = dynamic(() => import("./analytics-charts"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" aria-label="Loading charts" />,
});

const toneClass = { good: "text-emerald-700", bad: "text-destructive", neutral: "text-muted-foreground" } as const;

function Kpi({ label, value, change, tone, hint }: { label: string; value: string; change: string | null; tone: keyof typeof toneClass; hint: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
      <dd className={`mt-1 text-xs ${toneClass[tone]}`}>
        {change ? `${change} vs previous ${hint}` : `No previous ${hint} to compare`}
      </dd>
    </div>
  );
}

export function AdminAnalyticsView() {
  const { store } = useSession();
  const [preset, setPreset] = useState<number | null>(30);
  const [filter, setFilter] = useState<AnalyticsFilter>(() => ({ ...presetRange(30), granularity: "day" }));
  const [draft, setDraft] = useState({ from: filter.from, to: filter.to });
  const [exporting, setExporting] = useState(false);
  const query = analyticsQuery(filter);
  const { data, loading, refreshing, error, reload } = useResource<{ analytics: AnalyticsReport }>(`/admin/analytics?${query}`);
  const delay = useRetryDelay(error);
  const report = data?.analytics;

  function choosePreset(days: number) {
    const range = presetRange(days);
    setPreset(days);
    setDraft(range);
    setFilter((current) => ({ ...current, ...range }));
  }

  function applyCustom(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from > draft.to) {
      toast.error("Check the dates", "Choose a start date on or before the end date.");
      return;
    }
    setPreset(null);
    setFilter((current) => ({ ...current, ...draft }));
  }

  function chooseGranularity(granularity: Granularity) {
    setFilter((current) => ({ ...current, granularity }));
  }

  async function downloadCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await store.api.request<{ export: { filename: string; contentType: string; content: string } }>(`/admin/analytics/export?${query}`);
      const url = URL.createObjectURL(new Blob([result.export.content], { type: result.export.contentType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.export.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      toast.error("Could not export analytics", errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }

  const period = report ? `${report.range.days} days` : "period";
  const hasActivity = Boolean(report && (report.summary.booked || report.summary.delivered || report.summary.failed || Number(report.summary.revenue)));

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Business insights</p>
          <h1>Analytics</h1>
          <p>Bookings, deliveries, revenue and courier performance, in Bangladesh time.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={reload} disabled={loading || refreshing || delay > 0}>
            <RefreshCw className={`size-4 ${loading || refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </Button>
          <Button variant="outline" onClick={() => void downloadCsv()} disabled={exporting || !report}>
            <Download className="size-4" aria-hidden="true" /> {exporting ? "Preparing…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
            {PRESETS.map((days) => (
              <Button key={days} size="sm" variant={preset === days ? "default" : "outline"} aria-pressed={preset === days} onClick={() => choosePreset(days)}>
                Last {days} days
              </Button>
            ))}
          </div>
          <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-2" aria-label="Custom date range">
            <label className="grid gap-1 text-xs font-medium">
              From
              <input type="date" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={draft.from} max={draft.to} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} required />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              To
              <input type="date" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={draft.to} min={draft.from} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} required />
            </label>
            <Button type="submit" size="sm" variant="outline">Apply</Button>
          </form>
          <div role="group" aria-label="Group by" className="flex gap-2">
            {(["day", "week"] as const).map((granularity) => (
              <Button key={granularity} size="sm" variant={filter.granularity === granularity ? "default" : "outline"} aria-pressed={filter.granularity === granularity} onClick={() => chooseGranularity(granularity)}>
                By {granularity}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {!!error && (
        <ErrorNotice
          title="Could not load analytics"
          action={<Button variant="outline" onClick={reload} disabled={delay > 0}>{delay ? `Retry in ${delay}s` : "Try again"}</Button>}
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {loading && !report && <ResourceSkeleton variant="dashboard" label="Calculating analytics…" />}

      {report && (
        <div className="space-y-4" aria-busy={refreshing}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Shipments booked" value={String(report.summary.booked)} change={formatChange(report.change.booked, "percent")} tone={changeTone(report.change.booked, true)} hint={period} />
            <Kpi label="Delivered" value={String(report.summary.delivered)} change={formatChange(report.change.delivered, "percent")} tone={changeTone(report.change.delivered, true)} hint={period} />
            <Kpi label="Net revenue" value={money(report.summary.revenue, report.currency)} change={formatChange(report.change.revenue, "percent")} tone={changeTone(report.change.revenue, true)} hint={period} />
            <Kpi label={`On time (within ${report.onTimeHours} h)`} value={formatRate(report.summary.onTimeRate)} change={formatChange(report.change.onTimeRate, "points")} tone={changeTone(report.change.onTimeRate, true)} hint={period} />
            <Kpi label="Median delivery time" value={formatHours(report.summary.medianDeliveryHours)} change={formatChange(report.change.medianDeliveryHours, "hours")} tone={changeTone(report.change.medianDeliveryHours, false)} hint={period} />
            <Kpi label="Failure rate" value={formatRate(report.summary.failureRate)} change={formatChange(report.change.failureRate, "points")} tone={changeTone(report.change.failureRate, false)} hint={period} />
          </dl>

          {!hasActivity ? (
            <EmptyState title="No activity in this range" description="No shipments were booked, delivered or paid for between these dates. Try a longer range." />
          ) : (
            <>
              <AnalyticsCharts report={report} />

              <table className="sr-only">
                <caption>Shipments and net revenue by {report.range.granularity}</caption>
                <thead>
                  <tr><th scope="col">Period</th><th scope="col">Booked</th><th scope="col">Delivered</th><th scope="col">Net revenue ({report.currency})</th></tr>
                </thead>
                <tbody>
                  {report.series.map((row) => (
                    <tr key={row.period}><th scope="row">{periodLabel(row.period, report.range.granularity)}</th><td>{row.booked}</td><td>{row.delivered}</td><td>{row.revenue}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Card className="shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Courier leaderboard</CardTitle></CardHeader>
                  <CardContent>
                    {report.couriers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No courier deliveries or failures in this range.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <caption className="sr-only">Couriers by deliveries in this range</caption>
                          <thead className="text-left text-xs text-muted-foreground">
                            <tr><th scope="col" className="py-2 pr-3">Courier</th><th scope="col" className="py-2 pr-3 text-right">Delivered</th><th scope="col" className="py-2 pr-3 text-right">On time</th><th scope="col" className="py-2 text-right">Failed</th></tr>
                          </thead>
                          <tbody>
                            {report.couriers.map((courier) => (
                              <tr key={courier.id} className="border-t">
                                <th scope="row" className="py-2 pr-3 text-left font-medium">{courier.name}</th>
                                <td className="py-2 pr-3 text-right">{courier.deliveries}</td>
                                <td className="py-2 pr-3 text-right">{formatRate(courier.onTimeRate)}</td>
                                <td className="py-2 text-right">{courier.failed}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Busiest origin hubs</CardTitle></CardHeader>
                  <CardContent>
                    {report.hubs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No shipments with an origin hub in this range.</p>
                    ) : (
                      <ol className="space-y-2 text-sm">
                        {report.hubs.map((hub) => (
                          <li key={hub.name} className="flex justify-between gap-3"><span>{hub.name}</span><span className="font-semibold">{hub.shipments}</span></li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {report.range.from} to {report.range.to} (Bangladesh time), compared with {report.range.previousFrom} to {report.range.previousTo}.
            {" "}Prepared {dateTime(report.generatedAt)}{report.cached ? " · cached for up to 5 minutes" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
