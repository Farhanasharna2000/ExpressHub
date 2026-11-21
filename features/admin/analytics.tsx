"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useCountUpOnce } from "@/lib/gsap";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorNotice } from "@/components/ui/primitives";
import { ResourceSkeleton, Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/client/api";
import { useSession } from "@/features/auth/provider";
import { useFormat } from "@/lib/i18n/use-format";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import {
  PRESETS, analyticsQuery, changeTone, formatChange, formatHours, formatRate, periodLabel, presetRange,
  type AnalyticsFilter, type AnalyticsReport, type Granularity,
} from "./analytics-contracts";

import { useTranslations } from "next-intl";

function ChartsLoading() {
  const t = useTranslations("admin.analytics");
  return <Skeleton className="h-72 w-full" aria-label={t("loadingCharts")} />;
}

const AnalyticsCharts = dynamic(() => import("./analytics-charts"), {
  ssr: false,
  loading: () => <ChartsLoading />,
});

// Localized analytics figures. English output is exactly the shared helpers' text.
export function useAnalyticsFormat() {
  const t = useTranslations("admin.analytics");
  const f = useFormat();
  const bn = f.locale === "bn";
  return {
    f,
    rate: (value: number | null) => f.digits(formatRate(value)),
    hours: (value: number | null) => (bn && value !== null ? t("hoursValue", { value: f.digits(value) }) : formatHours(value)),
    change: (value: number | null, kind: Parameters<typeof formatChange>[1]) => {
      const text = formatChange(value, kind);
      return text && bn ? f.digits(text).replace(" pts", " পয়েন্ট").replace(/ h$/, " ঘণ্টা") : text;
    },
    period: (period: string, granularity: Granularity) => {
      if (!bn) return periodLabel(period, granularity);
      const label = periodLabel(period, "day", "bn-BD");
      return granularity === "week" ? t("weekOf", { label }) : label;
    },
  };
}

const toneClass = { good: "text-emerald-700", bad: "text-destructive", neutral: "text-muted-foreground" } as const;

function Kpi({ label, value, change, tone, hint }: { label: string; value: string; change: string | null; tone: keyof typeof toneClass; hint: string }) {
  const t = useTranslations("admin.analytics");
  return (
    <div className="rounded-lg border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold" data-count-up>{value}</dd>
      <dd className={`mt-1 text-xs ${toneClass[tone]}`}>
        {change ? t("vsPrevious", { change, hint }) : t("noPrevious", { hint })}
      </dd>
    </div>
  );
}

export function AdminAnalyticsView() {
  const t = useTranslations("admin.analytics");
  const tf = useTranslations("filters");
  const { f, rate, hours, change, period: periodText } = useAnalyticsFormat();
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
      toast.error(t("checkTheDates"), t("chooseAStartDate"));
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
      toast.error(t("couldNotExportAnalytics"), errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }

  const period = report ? t("daysPeriod", { days: report.range.days }) : t("periodWord");
  const hasActivity = Boolean(report && (report.summary.booked || report.summary.delivered || report.summary.failed || Number(report.summary.revenue)));
  const scope = useRef<HTMLDivElement>(null);
  useCountUpOnce(scope, Boolean(report));

  return (
    <div className="page-stack" ref={scope}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("businessInsights")}</p>
          <h1>{t("analytics")}</h1>
          <p>{t("bookingsDeliveriesRevenueAnd")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={reload} disabled={loading || refreshing || delay > 0}>
            <RefreshCw className={`size-4 ${loading || refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> {t("refresh")}
          </Button>
          <Button variant="outline" onClick={() => void downloadCsv()} disabled={exporting || !report}>
            <Download className="size-4" aria-hidden="true" /> {exporting ? t("preparing") : t("exportCsv")}
          </Button>
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div role="group" aria-label={t("dateRange")} className="flex flex-wrap gap-2">
            {PRESETS.map((days) => (
              <Button key={days} size="sm" variant={preset === days ? "default" : "outline"} aria-pressed={preset === days} onClick={() => choosePreset(days)}>
                {t("lastDays", { days })}
              </Button>
            ))}
          </div>
          <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-2" aria-label={t("customDateRange")}>
            <label className="grid gap-1 text-xs font-medium">
              {t("from")}
              <input type="date" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={draft.from} max={draft.to} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} required />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              {t("to")}
              <input type="date" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={draft.to} min={draft.from} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} required />
            </label>
            <Button type="submit" size="sm" variant="outline">{t("apply")}</Button>
          </form>
          <div role="group" aria-label={t("groupBy")} className="flex gap-2">
            {(["day", "week"] as const).map((granularity) => (
              <Button key={granularity} size="sm" variant={filter.granularity === granularity ? "default" : "outline"} aria-pressed={filter.granularity === granularity} onClick={() => chooseGranularity(granularity)}>
                {t(`by.${granularity}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {!!error && (
        <ErrorNotice
          title={t("couldNotLoadAnalytics")}
          action={<Button variant="outline" onClick={reload} disabled={delay > 0}>{delay ? tf("retryIn", { seconds: f.digits(delay) }) : t("tryAgain")}</Button>}
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {loading && !report && <ResourceSkeleton variant="dashboard" label={t("calculatingAnalytics")} />}

      {report && (
        <div className="space-y-4" aria-busy={refreshing}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t("shipmentsBooked")} value={f.digits(report.summary.booked)} change={change(report.change.booked, "percent")} tone={changeTone(report.change.booked, true)} hint={period} />
            <Kpi label={t("delivered")} value={f.digits(report.summary.delivered)} change={change(report.change.delivered, "percent")} tone={changeTone(report.change.delivered, true)} hint={period} />
            <Kpi label={t("netRevenue")} value={f.money(report.summary.revenue, report.currency)} change={change(report.change.revenue, "percent")} tone={changeTone(report.change.revenue, true)} hint={period} />
            <Kpi label={t("onTimeWithin", { hours: f.digits(report.onTimeHours) })} value={rate(report.summary.onTimeRate)} change={change(report.change.onTimeRate, "points")} tone={changeTone(report.change.onTimeRate, true)} hint={period} />
            <Kpi label={t("medianDeliveryTime")} value={hours(report.summary.medianDeliveryHours)} change={change(report.change.medianDeliveryHours, "hours")} tone={changeTone(report.change.medianDeliveryHours, false)} hint={period} />
            <Kpi label={t("failureRate")} value={rate(report.summary.failureRate)} change={change(report.change.failureRate, "points")} tone={changeTone(report.change.failureRate, false)} hint={period} />
          </dl>

          {!hasActivity ? (
            <EmptyState title={t("noActivityInThis")} description={t("noShipmentsWereBooked")} />
          ) : (
            <>
              <AnalyticsCharts report={report} />

              <table className="sr-only">
                <caption>{t(`tableCaption.${report.range.granularity}`)}</caption>
                <thead>
                  <tr><th scope="col">{t("period")}</th><th scope="col">{t("booked")}</th><th scope="col">{t("delivered")}</th><th scope="col">{t("netRevenueCurrency", { currency: report.currency })}</th></tr>
                </thead>
                <tbody>
                  {report.series.map((row) => (
                    <tr key={row.period}><th scope="row">{periodText(row.period, report.range.granularity)}</th><td>{f.digits(row.booked)}</td><td>{f.digits(row.delivered)}</td><td>{f.digits(row.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Card className="shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-base">{t("courierLeaderboard")}</CardTitle></CardHeader>
                  <CardContent>
                    {report.couriers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noCourierDeliveriesOr")}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <caption className="sr-only">{t("couriersByDeliveriesIn")}</caption>
                          <thead className="text-left text-xs text-muted-foreground">
                            <tr><th scope="col" className="py-2 pr-3">{t("courier")}</th><th scope="col" className="py-2 pr-3 text-right">{t("delivered")}</th><th scope="col" className="py-2 pr-3 text-right">{t("onTime")}</th><th scope="col" className="py-2 text-right">{t("failed")}</th></tr>
                          </thead>
                          <tbody>
                            {report.couriers.map((courier) => (
                              <tr key={courier.id} className="border-t">
                                <th scope="row" className="py-2 pr-3 text-left font-medium">{courier.name}</th>
                                <td className="py-2 pr-3 text-right">{f.number(courier.deliveries)}</td>
                                <td className="py-2 pr-3 text-right">{rate(courier.onTimeRate)}</td>
                                <td className="py-2 text-right">{f.number(courier.failed)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-2"><CardTitle className="text-base">{t("busiestOriginHubs")}</CardTitle></CardHeader>
                  <CardContent>
                    {report.hubs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noShipmentsWithAn")}</p>
                    ) : (
                      <ol className="space-y-2 text-sm">
                        {report.hubs.map((hub) => (
                          <li key={hub.name} className="flex justify-between gap-3"><span>{hub.name}</span><span className="font-semibold">{f.number(hub.shipments)}</span></li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {t("rangeNote", { from: f.digits(report.range.from), to: f.digits(report.range.to), previousFrom: f.digits(report.range.previousFrom), previousTo: f.digits(report.range.previousTo) })}
            {" "}{t("preparedAt", { time: f.dateTime(report.generatedAt) })}{report.cached ? t("cachedForUpTo") : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
