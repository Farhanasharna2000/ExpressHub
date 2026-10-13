"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
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
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const updateHeight = () => workspaceRef.current?.style.setProperty("--sidebar-height", `${sidebar.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="workspace" ref={workspaceRef}>
      <aside className="sidebar" ref={sidebarRef}>
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
          <Link href="/" className="workspace-title">
            <span className="workspace-title-desktop">ExpressHub workspace</span>
            <span className="workspace-title-mobile">{currentRole ? `${currentRole.toLowerCase()} workspace` : "Your workspace"}</span>
          </Link>
          <AccountMenu />
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
