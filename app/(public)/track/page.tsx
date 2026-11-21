import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackForm } from "@/features/tracking/track-form";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.page");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function TrackPage() {
  const t = await getTranslations("tracking");
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("page.title")}</h1>
          <p>{t("page.intro")}</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>{t("trackingNumber")}</CardTitle></CardHeader>
        <CardContent><TrackForm /></CardContent>
      </Card>
    </div>
  );
}
