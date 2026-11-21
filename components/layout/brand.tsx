"use client";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";

export function Brand({ className }: { className?: string }) {
  const t = useTranslations("shell");
  return (
    <Link
      href="/"
      className={`brand ${className ?? ""}`.trim()}
      aria-label={t("brandHome")}
    >
      <Image
        src="/ex-logo.png"
        alt="ExpressHub"
        width={180}
        height={60}
        className="h-auto w-[180px]"
      />
    </Link>
  );
}
