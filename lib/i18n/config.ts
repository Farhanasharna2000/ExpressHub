export const locales = ["en", "bn"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "locale";

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);

// The BCP 47 tag used for Intl formatting. English keeps the runtime default so its
// output stays exactly as before; Bangla uses Bangladesh conventions (Bangla digits).
export const intlLocale = (locale: Locale) => (locale === "bn" ? "bn-BD" : undefined);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Remembers the chosen language for a year; the server reads it on the next request.
export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
