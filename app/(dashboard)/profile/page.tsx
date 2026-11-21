import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/features/auth/forms";
export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("profile") };
}
export default function Page() {
  return <ProfileForm />;
}
