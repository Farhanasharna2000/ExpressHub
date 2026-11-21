"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type AnalyticsReport } from "./analytics-contracts";
import { useAnalyticsFormat } from "./analytics";

import { useTranslations } from "next-intl";
// Colours come from the theme variables, so the charts follow the app's palette.
const BOOKED = "var(--color-primary)";
const DELIVERED = "#2064c7";
const NEGATIVE = "var(--color-destructive)";
const GRID = "var(--color-border)";
const AXIS = "var(--color-muted-foreground)";
const tooltipStyle = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" };

// Decorative for screen readers: the same numbers are in the data table beside them.
export default function AnalyticsCharts({ report }: { report: AnalyticsReport }) {
  const t = useTranslations("admin.analytics");
  const { f, period } = useAnalyticsFormat();
  const tick = (value: number | string) => f.digits(value);
  const data = report.series.map((row) => ({
    label: period(row.period, report.range.granularity),
    booked: row.booked,
    delivered: row.delivered,
    revenue: Number(row.revenue),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
      <figure className="rounded-lg border bg-card p-4">
        <figcaption className="mb-3 text-sm font-semibold">{t("shipmentsBookedAndDelivered")}</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} tickFormatter={tick} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [tick(Number(value)), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="booked" name={t("booked")} stroke={BOOKED} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="delivered" name={t("delivered")} stroke={DELIVERED} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="rounded-lg border bg-card p-4">
        <figcaption className="mb-3 text-sm font-semibold">{t("netRevenueCurrency", { currency: report.currency })}</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fill: AXIS, fontSize: 12 }} tickFormatter={tick} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [f.locale === "en" ? `${report.currency} ${Number(value).toFixed(2)}` : f.money(Number(value).toFixed(2), report.currency), t("netRevenue")]} />
              <Bar dataKey="revenue" name={t("netRevenue")} isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {data.map((row, index) => <Cell key={index} fill={row.revenue < 0 ? NEGATIVE : BOOKED} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
