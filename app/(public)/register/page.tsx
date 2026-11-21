import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/features/auth/forms";
export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("register") };
}
export default function Page() {
  return <AuthForm register />;
}
