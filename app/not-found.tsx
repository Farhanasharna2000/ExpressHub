import { PublicShell } from "@/components/layout/shells";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { getTranslations } from "next-intl/server";
export default async function NotFound() {
  const t = await getTranslations("pages");
  return (
    <PublicShell>
      <EmptyState
        title={t("notFoundTitle")}
        description={t("notFoundText")}
        action={<ButtonLink href="/">{t("backHome")}</ButtonLink>}
      />
    </PublicShell>
  );
}
