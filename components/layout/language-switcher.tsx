"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { locales, writeLocaleCookie, type Locale } from "@/lib/i18n/config";
import { useAppLocale } from "@/lib/i18n/use-format";

// EN | বাংলা. The cookie is read on the server, so a refresh re-renders every page in the
// chosen language without changing the URL.
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("language");
  const current = useAppLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current || pending) return;
    writeLocaleCookie(locale);
    startTransition(() => router.refresh());
  }

  return (
    <div role="group" aria-label={t("label")} className={`language-switcher ${className}`.trim()} aria-busy={pending}>
      {locales.map((locale, index) => (
        <span key={locale} className="contents">
          {index > 0 && <span aria-hidden="true" className="text-[var(--line-strong,#c5d1c9)]">|</span>}
          <button
            type="button"
            lang={locale}
            onClick={() => choose(locale)}
            aria-current={locale === current ? "true" : undefined}
            aria-label={locale === current ? t(locale) : t("switchTo", { language: t(locale) })}
            disabled={pending}
            className={locale === current ? "font-bold text-[var(--brand)]" : "text-[var(--text-muted)] hover:text-[var(--brand)]"}
          >
            {locale === "en" ? "EN" : t("bn")}
          </button>
        </span>
      ))}
    </div>
  );
}
