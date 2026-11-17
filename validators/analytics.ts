import { z } from "zod";

export const ANALYTICS_MAX_DAYS = 366;

const calendarDay = z.iso.date();

// Whole calendar days between two YYYY-MM-DD dates, ignoring time zones.
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// from and to are inclusive Bangladesh calendar dates. Both or neither must be sent;
// without them the report covers the last 30 days.
export const analyticsQuerySchema = z
  .object({
    from: calendarDay.optional(),
    to: calendarDay.optional(),
    granularity: z.enum(["day", "week"]).default("day"),
  })
  .strict()
  .refine((value) => Boolean(value.from) === Boolean(value.to), {
    message: "Send both from and to, or neither",
    path: ["from"],
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be on or before to",
    path: ["to"],
  })
  .refine((value) => !value.from || !value.to || daysBetween(value.from, value.to) + 1 <= ANALYTICS_MAX_DAYS, {
    message: `The range can cover at most ${ANALYTICS_MAX_DAYS} days`,
    path: ["to"],
  });

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
