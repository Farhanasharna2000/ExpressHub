"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { locationAge } from "@/lib/courier-location";
import { type Locale, isLocale, defaultLocale } from "@/lib/i18n/config";
import {
  formatClockDate, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatRelativeMinutes, localizeDigits,
} from "@/lib/i18n/format";

export function useAppLocale(): Locale {
  const locale = useLocale();
  return isLocale(locale) ? locale : defaultLocale;
}

// Formatters bound to the active language, for client components.
export function useFormat() {
  const locale = useAppLocale();
  return useMemo(() => ({
    locale,
    dateTime: (value: string | Date) => formatDateTime(value, locale),
    date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => formatDate(value, locale, options),
    clock: (value: string | Date, timeZone?: string, withYear = true) => formatClockDate(value, locale, timeZone, withYear),
    money: (amount: string, currency: string) => formatMoney(amount, currency, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
    percent: (ratio: number, digits?: number) => formatPercent(ratio, locale, digits),
    minutesAgo: (minutes: number) => formatRelativeMinutes(minutes, locale),
    digits: (value: string | number) => localizeDigits(String(value), locale),
    // "just now" / "7 min ago" for a recent timestamp.
    age: (updatedAt: string, now = Date.now()) => {
      if (locale === "en") return locationAge(updatedAt, now);
      const seconds = Math.max(0, Math.round((now - Date.parse(updatedAt)) / 1000));
      return seconds < 45 ? "এইমাত্র" : formatRelativeMinutes(seconds / 60, locale);
    },
  }), [locale]);
}

// Shipment, payment and role values ("OUT_FOR_DELIVERY") shown as words.
export function useStatusLabel() {
  const t = useTranslations("status");
  return (value: string) => {
    const key = value as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : value.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
  };
}
