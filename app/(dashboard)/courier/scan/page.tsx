import { getTranslations } from "next-intl/server";
import { CourierScanner } from "@/features/courier/scanner";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("courier_scan") };
}

export default function Page() {
  return <CourierScanner />;
}
