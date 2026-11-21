import type en from "@/messages/en.json";
import type { Locale } from "@/lib/i18n/config";

// Message keys are checked at compile time: a typo in t("...") is a type error.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
