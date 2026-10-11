"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { UserRole } from "@/types/api";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import { useSession } from "@/features/auth/provider";
import { AccountMenu } from "@/features/auth/forms";
export function DashboardShell({
  children,
  role,
}: {
  children: ReactNode;
  role?: UserRole;
}) {
  const { user } = useSession();
  const currentRole = user?.role ?? role;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <p className="eyebrow">
          {currentRole
            ? `${currentRole.toLowerCase()} workspace`
            : "Your account"}
        </p>
        <Navigation role={currentRole} />
        <div className="sidebar-note">
          Every delivery starts with a connection.
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <Link href="/">ExpressHub workspace</Link>
          <AccountMenu />
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
