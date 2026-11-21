import { getTranslations } from "next-intl/server";
import { AdminDashboard } from "@/features/admin/dashboard";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin") };
}

export default function Page() {
  return <AdminDashboard />;
}
