export const locales = ["en", "bn"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "locale";

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);

// The BCP 47 tag used for Intl formatting. English keeps the runtime default so its
// output stays exactly as before; Bangla uses Bangladesh conventions (Bangla digits).
export const intlLocale = (locale: Locale) => (locale === "bn" ? "bn-BD" : undefined);
