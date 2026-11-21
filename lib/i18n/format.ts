import { type Locale, defaultLocale } from "@/lib/i18n/config";

// Every user-visible date, number and amount goes through these, so switching language
// changes digits, month names and day periods everywhere at once. English output is kept
// exactly as it was before translation was added.

const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export const toBanglaDigits = (value: string) => value.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)]);
export const fromBanglaDigits = (value: string) => value.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
export const localizeDigits = (value: string, locale: Locale) => (locale === "bn" ? toBanglaDigits(value) : value);

// ICU prints "AM"/"PM" for Bangla; Bangladeshi Bangla uses these words instead.
const BANGLA_DAY_PERIOD: Record<string, string> = { AM: "পূর্বাহ্ণ", PM: "অপরাহ্ণ" };

type DateParts = Record<string, string>;
const partCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(locale: Locale, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? ""}`;
  let formatter = partCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
        day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone,
      });
    } catch {
      return partsFormatter(locale, undefined);
    }
    partCache.set(key, formatter);
  }
  return formatter;
}

function dateParts(value: string | Date, locale: Locale, timeZone?: string): DateParts {
  const part: DateParts = {};
  for (const { type, value: text } of partsFormatter(locale, timeZone).formatToParts(new Date(value))) part[type] = text;
  return part;
}

// "19 Nov 2026, 10:19 AM" / "১৯ নভে ২০২৬, ১০:১৯ পূর্বাহ্ণ"
export function formatClockDate(value: string | Date, locale: Locale, timeZone?: string, withYear = true) {
  const part = dateParts(value, locale, timeZone);
  const period = (part.dayPeriod ?? "").toUpperCase();
  const dayPeriod = locale === "bn" ? (BANGLA_DAY_PERIOD[period] ?? part.dayPeriod ?? "") : period;
  const date = withYear ? `${part.day} ${part.month} ${part.year}` : `${part.day} ${part.month}`;
  return `${date}, ${part.hour}:${part.minute} ${dayPeriod}`.trimEnd();
}

// General date and time in the viewer's device timezone. English keeps the runtime's
// medium/short format exactly as before.
export function formatDateTime(value: string | Date, locale: Locale = defaultLocale) {
  if (locale === "bn") return formatClockDate(value, "bn");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDate(value: string | Date, locale: Locale = defaultLocale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : undefined, options).format(new Date(value));
}

// Server amounts are exact decimal strings; only the digits are swapped, never recomputed.
export function formatMoney(amount: string, currency: string, locale: Locale = defaultLocale) {
  if (locale !== "bn") return `${currency} ${amount}`;
  return currency === "BDT" ? `৳${toBanglaDigits(amount)}` : `${currency} ${toBanglaDigits(amount)}`;
}

export function formatNumber(value: number, locale: Locale = defaultLocale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", options).format(value);
}

export function formatPercent(ratio: number, locale: Locale = defaultLocale, maximumFractionDigits = 1) {
  return formatNumber(ratio, locale, { style: "percent", maximumFractionDigits });
}

export function formatRelativeMinutes(minutes: number, locale: Locale = defaultLocale) {
  return new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en", { numeric: "auto" }).format(-Math.max(0, Math.round(minutes)), "minute");
}
