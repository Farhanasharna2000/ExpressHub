import { AdminAuditLogsView } from "@/features/admin/audit-logs";

export const metadata = { title: "Audit History" };

export default function Page() {
  return <AdminAuditLogsView />;
}
