"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, X, Menu } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { UserRole } from "@/types/api";
import { useSession } from "@/features/auth/provider";
import { roleHome } from "@/features/auth/session";

type Item = { href: string; label: string; mobileOnly?: boolean };
const navigation: Record<UserRole, Item[]> = {
  CUSTOMER: [
    { href: "/customer", label: "Overview" },
    { href: "/customer/shipments", label: "My shipments" },
    { href: "/customer/shipments/new", label: "Book a shipment" },
    { href: "/customer/payments", label: "Payments" },
  ],
  COURIER: [
    { href: "/courier", label: "Overview" },
    { href: "/courier/shipments", label: "Assigned shipments" },
  ],
  ADMIN: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/shipments", label: "Shipments" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/audit-logs", label: "Audit logs" },
  ],
};

export function Navigation({ role }: { role?: UserRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, store } = useSession();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = openAt === pathname;

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await store.logout();
      setOpenAt(null);
      router.replace("/login");
    } catch {
      setOpenAt(null);
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  const isDashboard = Boolean(role);
  const activeRole = role ?? (status === "authenticated" && user ? user.role : undefined);

  let items: Item[] = [];
  if (role) {
    items = [...navigation[role], { href: "/profile", label: "Profile" }];
  } else if (status === "authenticated" && user) {
    items = [
      ...(user.role === "CUSTOMER"
        ? [
            { href: "/customer/shipments", label: "My shipments" },
            { href: "/customer/shipments/new", label: "Book a shipment" },
            { href: "/customer/payments", label: "Payments" },
          ]
        : user.role === "COURIER"
        ? [{ href: "/courier/shipments", label: "Assigned shipments" }]
        : [
            { href: "/admin/shipments", label: "Shipments" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/audit-logs", label: "Audit logs" },
          ]),
    ];
  } else if (status !== "loading") {
    items = [
      { href: "/login", label: "Sign in", mobileOnly: true },
      { href: "/register", label: "Create account", mobileOnly: true },
    ];
  }

  const active = items
    .filter(
      (i) =>
        pathname === i.href ||
        (i.href !== "/" && pathname.startsWith(`${i.href}/`)),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  if (items.length === 0) return null;

  return (
    <div className={items.every((item) => item.mobileOnly) ? "navigation sm:hidden" : "navigation"}>
      <Button
        variant="secondary"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="primary-navigation"
        onClick={() => setOpenAt(open ? null : pathname)}
      >
        Menu {open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
      </Button>
      <nav
        id="primary-navigation"
        className={open ? "nav-links is-open" : "nav-links"}
        aria-label={
          activeRole ? `${activeRole.toLowerCase()} navigation` : "Main navigation"
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpenAt(null);
            event.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>("button")
              ?.focus();
          }
        }}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.mobileOnly ? "sm:!hidden" : undefined}
            aria-current={active === item.href ? "page" : undefined}
            onClick={() => setOpenAt(null)}
          >
            {item.label}
          </Link>
        ))}

        {!isDashboard && open && status === "authenticated" && user && (
          <div className="pt-3 mt-3 border-t border-[var(--line)] flex flex-col gap-2 sm:hidden">
            <Link
              href={roleHome(user.role)}
              onClick={() => setOpenAt(null)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[#e5ecdf] rounded-lg transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/profile"
              onClick={() => setOpenAt(null)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[#e5ecdf] rounded-lg transition-colors"
            >
              Profile
            </Link>
            <div className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="font-semibold text-[var(--ink)] truncate">
                {user.name}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#e5ecdf] text-[#196547] uppercase">
                {user.role}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span>{busy ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
