import { getTranslations } from "next-intl/server";
import { LiveCouriersView } from "@/features/admin/live-couriers";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_couriers_live") };
}

export default function Page() {
  return <LiveCouriersView />;
}
