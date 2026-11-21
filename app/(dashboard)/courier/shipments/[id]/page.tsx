import { getTranslations } from "next-intl/server";
import { CourierShipmentDetailView } from "@/features/courier/detail";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("courier_shipments_id") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CourierShipmentDetailView key={id} id={id} />;
}
