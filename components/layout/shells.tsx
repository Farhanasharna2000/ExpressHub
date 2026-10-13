"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowRight, LayoutDashboard, LogOut } from "lucide-react";
import { Navigation } from "./navigation";
import { Brand } from "./brand";
import { useSession } from "@/features/auth/provider";
import { roleHome } from "@/features/auth/session";

export function PublicHeaderAuth() {
  const { user, status, store } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await store.logout();
      router.replace("/login");
    } catch {
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="hidden sm:flex items-center gap-2 shrink-0" aria-hidden="true">
        <div className="h-8 w-24 rounded-full bg-[#e5ecdf]/50 animate-pulse" />
      </div>
    );
  }

  if (status === "authenticated" && user) {
    return (
      <div className="hidden sm:flex items-center gap-2.5 shrink-0">
        <Link
          href="/profile"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-[#e5ecdf]/60 transition-colors border border-[var(--line)] text-inherit no-underline shrink-0"
          title={`Signed in as ${user.name} (${user.email})`}
        >
          <div className="size-7 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-[var(--line)]">
            <Image
              src={user.avatar || "/avatar-placeholder.svg"}
              alt={user.name}
              width={28}
              height={28}
              unoptimized={Boolean(user.avatar)}
              className="size-full object-cover"
            />
          </div>
          <span className="text-xs font-semibold max-w-[130px] truncate text-[var(--ink)]">
            {user.name}
          </span>
        </Link>
        <Link
          href={roleHome(user.role)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#196547] hover:bg-[#135038] text-white text-xs font-semibold transition-colors no-underline shadow-xs shrink-0 whitespace-nowrap"
        >
          <LayoutDashboard className="size-3.5 shrink-0" />
          <span>Dashboard</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          title="Sign out of your account"
        >
          <LogOut className="size-3.5 shrink-0" />
          <span className="hidden md:inline whitespace-nowrap">{busy ? "Signing out…" : "Sign out"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-3 shrink-0">
      <Link
        href="/login"
        className="text-xs font-semibold text-[var(--ink)] hover:text-[#196547] px-2.5 py-1.5 rounded-md transition-colors no-underline shrink-0 whitespace-nowrap"
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#196547] hover:bg-[#135038] text-white text-xs font-semibold shadow-xs transition-colors no-underline shrink-0 whitespace-nowrap"
      >
        <span>Get started</span>
        <ArrowRight className="size-3 shrink-0" />
      </Link>
    </div>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { user, status } = useSession();
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/register") {
    return (
      <main id="main-content" className="public-main auth-main" tabIndex={-1}>
        {children}
      </main>
    );
  }

  return (
    <>
      <header className="public-header">
        <Brand className="shrink-0" />
        <Navigation />
        <PublicHeaderAuth />
      </header>
      <main id="main-content" className="public-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <Brand />
        <span>From your doorstep to theirs. Modern express delivery platform.</span>
        {status === "authenticated" && user ? (
          <Link
            href={roleHome(user.role)}
            className="font-semibold text-[#196547] hover:underline"
          >
            Go to your dashboard ({user.name}) <ArrowRight className="inline size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/#how-it-works">How it works <ArrowRight className="inline size-4" aria-hidden="true" /></Link>
        )}
      </footer>
    </>
  );
}

export { DashboardShell } from "./dashboard-shell";
