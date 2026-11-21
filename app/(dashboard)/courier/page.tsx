import { getTranslations } from "next-intl/server";
import { CourierDashboard } from "@/features/courier/dashboard";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("courier") };
}

export default function Page() {
  return <CourierDashboard />;
}
