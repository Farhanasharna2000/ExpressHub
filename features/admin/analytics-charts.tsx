"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { periodLabel, type AnalyticsReport } from "./analytics-contracts";

// Colours come from the theme variables, so the charts follow the app's palette.
const BOOKED = "var(--color-primary)";
const DELIVERED = "#2064c7";
const NEGATIVE = "var(--color-destructive)";
const GRID = "var(--color-border)";
const AXIS = "var(--color-muted-foreground)";
const tooltipStyle = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-foreground)" };

// Decorative for screen readers: the same numbers are in the data table beside them.
export default function AnalyticsCharts({ report }: { report: AnalyticsReport }) {
  const data = report.series.map((row) => ({
    label: periodLabel(row.period, report.range.granularity),
    booked: row.booked,
    delivered: row.delivered,
    revenue: Number(row.revenue),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
      <figure className="rounded-lg border bg-card p-4">
        <figcaption className="mb-3 text-sm font-semibold">Shipments booked and delivered</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="booked" name="Booked" stroke={BOOKED} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="delivered" name="Delivered" stroke={DELIVERED} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="rounded-lg border bg-card p-4">
        <figcaption className="mb-3 text-sm font-semibold">Net revenue ({report.currency})</figcaption>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fill: AXIS, fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${report.currency} ${Number(value).toFixed(2)}`, "Net revenue"]} />
              <Bar dataKey="revenue" name="Net revenue" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {data.map((row, index) => <Cell key={index} fill={row.revenue < 0 ? NEGATIVE : BOOKED} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
