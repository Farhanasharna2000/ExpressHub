"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { UserRole } from "@/types/api";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import { useSession } from "@/features/auth/provider";
import { AccountMenu } from "@/features/auth/forms";
import { AssistantLauncher } from "@/features/ai/assistant-panel";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./language-switcher";
export function DashboardShell({
  children,
  role,
}: {
  children: ReactNode;
  role?: UserRole;
}) {
  const t = useTranslations("shell");
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
          {currentRole ? t(`workspace.${currentRole}`) : t("workspace.none")}
        </p>
        <Navigation role={currentRole} />
        <div className="sidebar-note">
          {t("sidebarNote")}
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <Link href="/" className="workspace-title">
            <span className="workspace-title-desktop">{t("workspaceTitle")}</span>
            <span className="workspace-title-mobile">{currentRole ? t(`workspace.${currentRole}`) : t("workspace.noneMobile")}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <AccountMenu />
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <AssistantLauncher />
      </div>
    </div>
  );
}
