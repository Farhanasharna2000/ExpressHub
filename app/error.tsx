"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, ErrorNotice } from "@/components/ui/primitives";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("pages");
  return <main id="main-content" className="narrow-page"><ErrorNotice action={<Button onClick={reset}>{t("tryAgain")}</Button>}>{t("errorText")}</ErrorNotice><Link href="/">{t("backHome")}</Link></main>;
}
