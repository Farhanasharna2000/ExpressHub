import { getTranslations } from "next-intl/server";
import { AdminUserDetailView } from "@/features/admin/user-detail";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_users_id") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminUserDetailView key={id} id={id} />;
}
