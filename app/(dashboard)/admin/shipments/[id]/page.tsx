import { getTranslations } from "next-intl/server";
import { AdminShipmentDetailView } from "@/features/admin/shipment-detail";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_shipments_id") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminShipmentDetailView key={id} id={id} />;
}
