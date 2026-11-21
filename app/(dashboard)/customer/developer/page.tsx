import { getTranslations } from "next-intl/server";
import { DeveloperPage } from "@/features/developer/developer-page";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer_developer") };
}

export default function CustomerDeveloperPage() {
  return <DeveloperPage />;
}
