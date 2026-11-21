import { getTranslations } from "next-intl/server";
import { AdminAnalyticsView } from "@/features/admin/analytics";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_analytics") };
}

export default function Page() {
  return <AdminAnalyticsView />;
}
