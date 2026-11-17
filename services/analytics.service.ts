import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import { cached, type CacheFn } from "@/lib/cache";
import { toCsv } from "@/lib/csv";
import { daysBetween, type AnalyticsQueryInput } from "@/validators/analytics";

export const ANALYTICS_TIME_ZONE = "Asia/Dhaka";
export const ANALYTICS_CURRENCY = "BDT";
export const ON_TIME_HOURS = 72;
const CACHE_SECONDS = 300;
// Bangladesh has no daylight saving time, so local midnight is always UTC+6.
const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Granularity = "day" | "week";

export interface AnalyticsRange {
  from: string;
  to: string;
  days: number;
  granularity: Granularity;
  start: Date;
  end: Date;
  previous: { from: string; to: string; start: Date; end: Date };
}

export interface RawTotals {
  booked: number;
  delivered: number;
  timed: number;
  onTime: number;
  medianHours: number | null;
  p90Hours: number | null;
  failed: number;
  revenue: string;
}

export interface RawAnalytics {
  booked: { bucket: string; value: number }[];
  delivered: { bucket: string; value: number }[];
  revenue: { bucket: string; value: string }[];
  current: RawTotals;
  previous: RawTotals;
  hubs: { name: string; shipments: number }[];
  couriers: { id: string; name: string; deliveries: number; onTime: number; timed: number; failed: number }[];
}

export function dhakaToday(now: Date) {
  return new Date(now.getTime() + BANGLADESH_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function dhakaMidnight(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - BANGLADESH_OFFSET_MS);
}

// Monday, matching Postgres date_trunc('week').
function weekStart(date: string) {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

// The comparison period is the same number of days immediately before the range.
export function resolveRange(input: AnalyticsQueryInput, now: Date): AnalyticsRange {
  const to = input.to ?? dhakaToday(now);
  const from = input.from ?? addDays(to, -29);
  const days = daysBetween(from, to) + 1;
  const previousFrom = addDays(from, -days);
  return {
    from,
    to,
    days,
    granularity: input.granularity,
    start: dhakaMidnight(from),
    end: dhakaMidnight(addDays(to, 1)),
    previous: { from: previousFrom, to: addDays(from, -1), start: dhakaMidnight(previousFrom), end: dhakaMidnight(from) },
  };
}

// Every bucket in the range, so days or weeks without activity still appear as zero.
export function bucketLabels(from: string, to: string, granularity: Granularity) {
  const labels: string[] = [];
  const step = granularity === "week" ? 7 : 1;
  for (let cursor = granularity === "week" ? weekStart(from) : from; cursor <= to; cursor = addDays(cursor, step)) labels.push(cursor);
  return labels;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const rate = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);

export function summarize(totals: RawTotals) {
  return {
    booked: totals.booked,
    delivered: totals.delivered,
    failed: totals.failed,
    revenue: totals.revenue,
    onTimeRate: rate(totals.onTime, totals.timed),
    failureRate: rate(totals.failed, totals.delivered + totals.failed),
    medianDeliveryHours: totals.medianHours === null ? null : round1(totals.medianHours),
    p90DeliveryHours: totals.p90Hours === null ? null : round1(totals.p90Hours),
  };
}

export type AnalyticsSummary = ReturnType<typeof summarize>;

// Percentage change for counts and money; null when there is nothing to compare with.
export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / previous) * 100);
}

const difference = (current: number | null, previous: number | null) =>
  current === null || previous === null ? null : round1(current - previous);

export function buildReport(range: AnalyticsRange, raw: RawAnalytics, generatedAt: Date) {
  const booked = new Map(raw.booked.map((row) => [row.bucket, row.value]));
  const delivered = new Map(raw.delivered.map((row) => [row.bucket, row.value]));
  const revenue = new Map(raw.revenue.map((row) => [row.bucket, row.value]));
  const summary = summarize(raw.current);
  const previous = summarize(raw.previous);
  return {
    range: {
      from: range.from,
      to: range.to,
      days: range.days,
      granularity: range.granularity,
      timeZone: ANALYTICS_TIME_ZONE,
      previousFrom: range.previous.from,
      previousTo: range.previous.to,
    },
    currency: ANALYTICS_CURRENCY,
    onTimeHours: ON_TIME_HOURS,
    summary,
    previous,
    change: {
      booked: percentChange(summary.booked, previous.booked),
      delivered: percentChange(summary.delivered, previous.delivered),
      revenue: percentChange(Number(summary.revenue), Number(previous.revenue)),
      onTimeRate: difference(summary.onTimeRate, previous.onTimeRate),
      failureRate: difference(summary.failureRate, previous.failureRate),
      medianDeliveryHours: difference(summary.medianDeliveryHours, previous.medianDeliveryHours),
    },
    series: bucketLabels(range.from, range.to, range.granularity).map((period) => ({
      period,
      booked: booked.get(period) ?? 0,
      delivered: delivered.get(period) ?? 0,
      revenue: revenue.get(period) ?? "0.00",
    })),
    hubs: raw.hubs,
    couriers: raw.couriers.map((courier) => ({
      id: courier.id,
      name: courier.name,
      deliveries: courier.deliveries,
      failed: courier.failed,
      onTimeRate: rate(courier.onTime, courier.timed),
    })),
    generatedAt: generatedAt.toISOString(),
  };
}

export type AnalyticsReport = ReturnType<typeof buildReport>;

export function analyticsCsv(report: AnalyticsReport) {
  return toCsv([
    ["Period starting", "Shipments booked", "Shipments delivered", `Net revenue (${report.currency})`],
    ...report.series.map((row) => [row.period, row.booked, row.delivered, row.revenue]),
  ]);
}

// Stored timestamps are UTC without a time zone; this turns a column into Bangladesh local time.
const local = (column: string) => Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${ANALYTICS_TIME_ZONE})`;
const bucket = (column: string, granularity: Granularity) =>
  Prisma.sql`to_char(date_trunc(${granularity}, ${local(column)}), 'YYYY-MM-DD')`;

// Delivered shipments with hours from first pickup to delivery (null if pickup was never recorded).
const deliveredRows = (start: Date, end: Date) => Prisma.sql`
  SELECT s."id", s."courierId", s."deliveredAt",
    EXTRACT(EPOCH FROM (s."deliveredAt" - p."pickedUpAt")) / 3600.0 AS "hours"
  FROM "shipments" s
  LEFT JOIN LATERAL (
    SELECT min(e."occurredAt") AS "pickedUpAt" FROM "shipment_events" e
    WHERE e."shipmentId" = s."id" AND e."toStatus" = 'PICKED_UP'
  ) p ON true
  WHERE s."deletedAt" IS NULL AND s."deliveredAt" >= ${start} AND s."deliveredAt" < ${end}`;

const failedRows = (start: Date, end: Date) => Prisma.sql`
  SELECT e."shipmentId", s."courierId" FROM "shipment_events" e
  JOIN "shipments" s ON s."id" = e."shipmentId"
  WHERE s."deletedAt" IS NULL AND e."toStatus" = 'FAILED' AND e."occurredAt" >= ${start} AND e."occurredAt" < ${end}`;

// Money received when paid, minus full refunds when refunded. Payment history is kept for
// deleted shipments, so payments are not filtered by shipment deletion.
const revenueRows = (start: Date, end: Date, granularity: Granularity) => Prisma.sql`
  SELECT ${bucket('p."paidAt"', granularity)} AS "bucket", p."amount" FROM "payments" p
  WHERE p."currency" = ${ANALYTICS_CURRENCY} AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
  UNION ALL
  SELECT ${bucket('p."refundedAt"', granularity)} AS "bucket", -p."amount" FROM "payments" p
  WHERE p."currency" = ${ANALYTICS_CURRENCY} AND p."status" = 'REFUNDED' AND p."refundedAt" >= ${start} AND p."refundedAt" < ${end}`;

type TotalsRow = { booked: number; delivered: number; timed: number; onTime: number; medianHours: number | null; p90Hours: number | null; failed: number; revenue: string };

function totalsQuery(start: Date, end: Date) {
  return prisma.$queryRaw<TotalsRow[]>`
    WITH delivered AS (${deliveredRows(start, end)})
    SELECT
      (SELECT count(*)::int FROM "shipments" s WHERE s."deletedAt" IS NULL AND s."createdAt" >= ${start} AND s."createdAt" < ${end}) AS "booked",
      (SELECT count(*)::int FROM delivered) AS "delivered",
      (SELECT count(*)::int FROM delivered WHERE "hours" IS NOT NULL) AS "timed",
      (SELECT count(*)::int FROM delivered WHERE "hours" <= ${ON_TIME_HOURS}) AS "onTime",
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "hours") FROM delivered) AS "medianHours",
      (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY "hours") FROM delivered) AS "p90Hours",
      (SELECT count(DISTINCT f."shipmentId")::int FROM (${failedRows(start, end)}) f) AS "failed",
      (SELECT COALESCE(sum(r."amount"), 0)::numeric(14, 2)::text FROM (${revenueRows(start, end, "day")}) r) AS "revenue"`;
}

export async function loadAnalyticsData(range: AnalyticsRange): Promise<RawAnalytics> {
  const { start, end, granularity } = range;
  const [booked, delivered, revenue, current, previous, hubs, couriers] = await prisma.$transaction(
    [
      prisma.$queryRaw<{ bucket: string; value: number }[]>`
        SELECT ${bucket('s."createdAt"', granularity)} AS "bucket", count(*)::int AS "value"
        FROM "shipments" s WHERE s."deletedAt" IS NULL AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
        GROUP BY 1`,
      prisma.$queryRaw<{ bucket: string; value: number }[]>`
        SELECT ${bucket('d."deliveredAt"', granularity)} AS "bucket", count(*)::int AS "value"
        FROM (${deliveredRows(start, end)}) d GROUP BY 1`,
      prisma.$queryRaw<{ bucket: string; value: string }[]>`
        SELECT r."bucket", sum(r."amount")::numeric(14, 2)::text AS "value"
        FROM (${revenueRows(start, end, granularity)}) r GROUP BY 1`,
      totalsQuery(start, end),
      totalsQuery(range.previous.start, range.previous.end),
      prisma.$queryRaw<{ name: string; shipments: number }[]>`
        SELECT h."name", count(*)::int AS "shipments"
        FROM "shipments" s JOIN "hubs" h ON h."id" = s."originHubId"
        WHERE s."deletedAt" IS NULL AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
        GROUP BY h."id", h."name" ORDER BY "shipments" DESC, h."name" ASC LIMIT 5`,
      prisma.$queryRaw<RawAnalytics["couriers"]>`
        WITH delivered AS (${deliveredRows(start, end)}),
        done AS (
          SELECT "courierId", count(*)::int AS "deliveries",
            (count(*) FILTER (WHERE "hours" <= ${ON_TIME_HOURS}))::int AS "onTime",
            (count(*) FILTER (WHERE "hours" IS NOT NULL))::int AS "timed"
          FROM delivered WHERE "courierId" IS NOT NULL GROUP BY 1
        ),
        failed AS (
          SELECT f."courierId", count(DISTINCT f."shipmentId")::int AS "failed"
          FROM (${failedRows(start, end)}) f WHERE f."courierId" IS NOT NULL GROUP BY 1
        )
        SELECT u."id", u."name",
          COALESCE(d."deliveries", 0) AS "deliveries", COALESCE(d."onTime", 0) AS "onTime",
          COALESCE(d."timed", 0) AS "timed", COALESCE(f."failed", 0) AS "failed"
        FROM done d FULL OUTER JOIN failed f ON f."courierId" = d."courierId"
        JOIN "users" u ON u."id" = COALESCE(d."courierId", f."courierId")
        ORDER BY "deliveries" DESC, "failed" ASC, u."name" ASC LIMIT 10`,
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return { booked, delivered, revenue, current: current[0], previous: previous[0], hubs, couriers };
}

export interface AnalyticsDeps {
  now: () => Date;
  cache: CacheFn;
  loadRaw: (range: AnalyticsRange) => Promise<RawAnalytics>;
}

const defaultDeps: AnalyticsDeps = { now: () => new Date(), cache: cached, loadRaw: loadAnalyticsData };

export async function getAnalytics(actor: AuthenticatedUser, input: AnalyticsQueryInput, deps: AnalyticsDeps = defaultDeps) {
  requireRole(actor, "ADMIN");
  const range = resolveRange(input, deps.now());
  const key = `expresshub:analytics:v1:${range.from}:${range.to}:${range.granularity}`;
  const { value, hit } = await deps.cache(key, CACHE_SECONDS, async () => buildReport(range, await deps.loadRaw(range), deps.now()));
  return { ...value, cached: hit };
}

export async function exportAnalyticsCsv(actor: AuthenticatedUser, input: AnalyticsQueryInput, deps: AnalyticsDeps = defaultDeps) {
  const report = await getAnalytics(actor, input, deps);
  return {
    filename: `expresshub-analytics-${report.range.from}-to-${report.range.to}.csv`,
    contentType: "text/csv; charset=utf-8",
    content: analyticsCsv(report),
  };
}
