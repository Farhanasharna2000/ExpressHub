import { getTranslations } from "next-intl/server";
import { CourierShipmentListView } from "@/features/courier/list";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("courier_shipments") };
}

export default function Page() {
  return <CourierShipmentListView />;
}
