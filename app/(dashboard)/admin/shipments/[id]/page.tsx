import { AdminShipmentDetailView } from "@/features/admin/shipment-detail";

export const metadata = { title: "Shipment Operations Detail" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminShipmentDetailView key={id} id={id} />;
}
