export type Granularity = "day" | "week";

export interface AnalyticsSummary {
  booked: number;
  delivered: number;
  failed: number;
  revenue: string;
  onTimeRate: number | null;
  failureRate: number | null;
  medianDeliveryHours: number | null;
  p90DeliveryHours: number | null;
}

export interface AnalyticsReport {
  range: { from: string; to: string; days: number; granularity: Granularity; timeZone: string; previousFrom: string; previousTo: string };
  currency: string;
  onTimeHours: number;
  summary: AnalyticsSummary;
  previous: AnalyticsSummary;
  change: {
    booked: number | null;
    delivered: number | null;
    revenue: number | null;
    onTimeRate: number | null;
    failureRate: number | null;
    medianDeliveryHours: number | null;
  };
  series: { period: string; booked: number; delivered: number; revenue: string }[];
  hubs: { name: string; shipments: number }[];
  couriers: { id: string; name: string; deliveries: number; failed: number; onTimeRate: number | null }[];
  generatedAt: string;
  cached: boolean;
}

export interface AnalyticsFilter {
  from: string;
  to: string;
  granularity: Granularity;
}

export const PRESETS = [7, 30, 90] as const;

const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function bangladeshToday(now = new Date()) {
  return new Date(now.getTime() + BANGLADESH_OFFSET_MS).toISOString().slice(0, 10);
}

// The last `days` Bangladesh calendar days, including today.
export function presetRange(days: number, now = new Date()): { from: string; to: string } {
  const to = bangladeshToday(now);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

export function analyticsQuery(filter: AnalyticsFilter) {
  return new URLSearchParams({ from: filter.from, to: filter.to, granularity: filter.granularity }).toString();
}

type ChangeKind = "percent" | "points" | "hours";

// "+12.5%", "-3 pts", "+1.5 h", or null when there is nothing to compare with.
export function formatChange(value: number | null, kind: ChangeKind) {
  if (value === null) return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  const amount = Math.abs(value);
  const suffix = kind === "percent" ? "%" : kind === "points" ? " pts" : " h";
  return `${sign}${amount}${suffix}`;
}

// Whether a change is good news. Failures and slower deliveries going up is bad.
export function changeTone(value: number | null, higherIsBetter: boolean): "good" | "bad" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 === higherIsBetter ? "good" : "bad";
}

export const GAUGE_RADIUS = 15;
export const GAUGE_LENGTH = 2 * Math.PI * GAUGE_RADIUS;
// Dash offset that fills a ring to a percentage. Empty when there is no figure yet, and clamped so a stray value cannot overdraw it.
export const gaugeOffset = (percent: number | null) => GAUGE_LENGTH * (1 - Math.min(100, Math.max(0, percent ?? 0)) / 100);

export const formatRate = (value: number | null) => (value === null ? "—" : `${value}%`);
export const formatHours = (value: number | null) => (value === null ? "—" : `${value} h`);

// Short axis labels in the viewer's locale; the period string is a Bangladesh date.
export function periodLabel(period: string, granularity: Granularity, locale?: string) {
  const date = new Date(`${period}T00:00:00Z`);
  const label = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  return granularity === "week" ? `Week of ${label}` : label;
}
