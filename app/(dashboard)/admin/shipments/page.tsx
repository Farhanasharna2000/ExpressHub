import { getTranslations } from "next-intl/server";
import { AdminShipmentsListView } from "@/features/admin/shipments-list";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_shipments") };
}

export default function Page() {
  return <AdminShipmentsListView />;
}
