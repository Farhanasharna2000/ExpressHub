"use client";

import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import zodBangla from "zod/v4/locales/bn.js";
import zodEnglish from "zod/v4/locales/en.js";
import { setMessageTranslator } from "@/lib/i18n/bridge";

let configuredLocale: string | null = null;

// Registers the active language for code that runs outside hooks: errorMessage(),
// field errors and Zod's built-in validation messages. Rendered once near the root.
export function I18nBridge() {
  const t = useTranslations();
  const locale = useLocale();
  setMessageTranslator((key, values) => {
    const typed = key as Parameters<typeof t>[0];
    return t.has(typed) ? t(typed, values) : undefined;
  });
  if (configuredLocale !== locale) {
    z.config(locale === "bn" ? zodBangla() : zodEnglish());
    configuredLocale = locale;
  }
  return null;
}
