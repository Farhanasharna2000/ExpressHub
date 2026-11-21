import { getTranslations } from "next-intl/server";
import { ShipmentImportPage } from "@/features/shipments/import/import-page";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer_shipments_import") };
}

export default function Page() {
  return <ShipmentImportPage />;
}
