import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_Bengali } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { SessionProvider } from "@/features/auth/provider";
import { Toaster } from "@/components/ui/toast";
import { MotionProvider } from "@/components/motion-provider";

// Bundled at build time (no runtime request to Google), used only for Bangla text.
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], display: "swap", variable: "--font-bangla" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: t("title"), template: "%s | ExpressHub" },
    description: t("description"),
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "32x32" },
      ],
      apple: "/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("shell");
  return (
    <html lang={locale} className={bangla.variable}>
      <body>
        <a className="skip-link" href="#main-content">
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Dhaka">
          <MotionProvider>
            <SessionProvider>
              {children}
              <Toaster />
            </SessionProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
