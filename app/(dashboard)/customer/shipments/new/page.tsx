import { getTranslations } from "next-intl/server";
import { ShipmentBooking } from "@/features/shipments/booking";
export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer_shipments_new") };
}
export default function Page() { return <ShipmentBooking />; }
