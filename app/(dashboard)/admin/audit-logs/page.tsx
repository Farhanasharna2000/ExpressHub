import { getTranslations } from "next-intl/server";
import { AdminAuditLogsView } from "@/features/admin/audit-logs";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("admin_audit_logs") };
}

export default function Page() {
  return <AdminAuditLogsView />;
}
