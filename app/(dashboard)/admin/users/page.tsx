import { getTranslations } from "next-intl/server";
import { AdminUsersListView } from "@/features/admin/users-list";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_users") };
}

export default function Page() {
  return <AdminUsersListView />;
}
