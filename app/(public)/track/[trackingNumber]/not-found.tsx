import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackForm } from "@/features/tracking/track-form";
import { getTranslations } from "next-intl/server";

export default async function TrackingNotFound() {
  const t = await getTranslations("tracking");
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("page.notFoundTitle")}</h1>
          <p>{t("page.notFoundText")}</p>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>{t("form.label")}</CardTitle></CardHeader>
        <CardContent><TrackForm /></CardContent>
      </Card>
    </div>
  );
}
