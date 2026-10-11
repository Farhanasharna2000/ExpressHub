import { ShipmentDetails } from "@/features/shipments/detail";
export const metadata = { title: "Shipment details" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentDetails key={id} id={id} />;
}
