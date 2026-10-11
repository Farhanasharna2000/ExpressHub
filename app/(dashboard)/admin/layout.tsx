import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/shells";
export default function Layout({ children }: { children: ReactNode }) {
  return <DashboardShell role="ADMIN">{children}</DashboardShell>;
}
