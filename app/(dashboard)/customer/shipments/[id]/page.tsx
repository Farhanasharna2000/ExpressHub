import { getTranslations } from "next-intl/server";
import { ShipmentDetails } from "@/features/shipments/detail";
export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer_shipments_id") };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentDetails key={id} id={id} />;
}
