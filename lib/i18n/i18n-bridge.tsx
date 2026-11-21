"use client";

import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import zodBangla from "zod/v4/locales/bn.js";
import zodEnglish from "zod/v4/locales/en.js";
import { setMessageTranslator } from "@/lib/i18n/bridge";

let configuredLocale: string | null = null;

// Idempotent, so it is safe to call on every render before children validate anything.
function applyZodLocale(locale: string) {
  if (configuredLocale === locale) return;
  z.config(locale === "bn" ? zodBangla() : zodEnglish());
  configuredLocale = locale;
}

// Registers the active language for code that runs outside hooks: errorMessage(),
// field errors and Zod's built-in validation messages. Rendered once near the root.
export function I18nBridge() {
  const t = useTranslations();
  const locale = useLocale();
  setMessageTranslator((key, values) => {
    const typed = key as Parameters<typeof t>[0];
    return t.has(typed) ? t(typed, values) : undefined;
  });
  applyZodLocale(locale);
  return null;
}
