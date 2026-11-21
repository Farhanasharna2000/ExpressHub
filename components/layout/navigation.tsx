"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, X, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/primitives";
import type { UserRole } from "@/types/api";
import { useSession } from "@/features/auth/provider";
import { roleHome } from "@/features/auth/session";

type NavKey = "overview" | "myShipments" | "bookShipment" | "payments" | "developer" | "assignedShipments" | "scanParcel" | "shipments" | "users" | "analytics" | "liveCouriers" | "auditLogs" | "profile";
type Item = { href: string; label: NavKey | "signIn" | "createAccount"; mobileOnly?: boolean };
const navigation: Record<UserRole, Item[]> = {
  CUSTOMER: [
    { href: "/customer", label: "overview" },
    { href: "/customer/shipments", label: "myShipments" },
    { href: "/customer/shipments/new", label: "bookShipment" },
    { href: "/customer/payments", label: "payments" },
    { href: "/customer/developer", label: "developer" },
  ],
  COURIER: [
    { href: "/courier", label: "overview" },
    { href: "/courier/shipments", label: "assignedShipments" },
    { href: "/courier/scan", label: "scanParcel" },
  ],
  ADMIN: [
    { href: "/admin", label: "overview" },
    { href: "/admin/shipments", label: "shipments" },
    { href: "/admin/users", label: "users" },
    { href: "/admin/analytics", label: "analytics" },
    { href: "/admin/couriers/live", label: "liveCouriers" },
    { href: "/admin/audit-logs", label: "auditLogs" },
  ],
};

export function Navigation({ role }: { role?: UserRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const ts = useTranslations("shell");
  const { user, status, store } = useSession();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = openAt === pathname;
  const navigationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) {
        setOpenAt(null);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

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
    items = [...navigation[role], { href: "/profile", label: "profile" }];
  } else if (status === "authenticated" && user) {
    items = [
      ...((user.role === "CUSTOMER"
        ? [
            { href: "/customer/shipments", label: "myShipments" },
            { href: "/customer/shipments/new", label: "bookShipment" },
            { href: "/customer/payments", label: "payments" },
            { href: "/customer/developer", label: "developer" },
          ]
        : user.role === "COURIER"
        ? [
            { href: "/courier/shipments", label: "assignedShipments" },
            { href: "/courier/scan", label: "scanParcel" },
          ]
        : [
            { href: "/admin/shipments", label: "shipments" },
            { href: "/admin/users", label: "users" },
            { href: "/admin/analytics", label: "analytics" },
            { href: "/admin/couriers/live", label: "liveCouriers" },
            { href: "/admin/audit-logs", label: "auditLogs" },
          ]) as Item[]),
    ];
  } else if (status !== "loading") {
    items = [
      { href: "/login", label: "signIn", mobileOnly: true },
      { href: "/register", label: "createAccount", mobileOnly: true },
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
    <div ref={navigationRef} className={items.every((item) => item.mobileOnly) ? "navigation sm:hidden" : "navigation"}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenAt(null);
      }}
    >
      <Button
        variant="secondary"
        className="menu-toggle"
        aria-expanded={open}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        aria-controls="primary-navigation"
        onClick={() => setOpenAt(open ? null : pathname)}
      >
        {open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
      </Button>
      <nav
        id="primary-navigation"
        className={open ? "nav-links is-open" : "nav-links"}
        aria-label={
          activeRole ? t(`roleNavigation.${activeRole}`) : t("mainNavigation")
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
            {item.label === "signIn" || item.label === "createAccount" ? ts(item.label) : t(item.label)}
          </Link>
        ))}

        {!isDashboard && open && status === "authenticated" && user && (
          <div className="pt-3 mt-3 border-t border-[var(--line)] flex flex-col gap-2 sm:hidden">
            <Link
              href={roleHome(user.role)}
              onClick={() => setOpenAt(null)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[#e5ecdf] rounded-lg transition-colors"
            >
              {ts("dashboard")}
            </Link>
            <Link
              href="/profile"
              onClick={() => setOpenAt(null)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[#e5ecdf] rounded-lg transition-colors"
            >
              {t("profile")}
            </Link>
            <div className="flex items-center gap-2.5 px-2 py-1 text-xs">
              <div className="size-6 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-[var(--line)]">
                <Image
                  src={user.avatar || "/avatar-placeholder.svg"}
                  alt={user.name}
                  width={24}
                  height={24}
                  unoptimized={Boolean(user.avatar)}
                  className="size-full object-cover"
                />
              </div>
              <span className="font-semibold text-[var(--ink)] truncate">
                {user.name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left cursor-pointer"
            >
              <LogOut className="size-3.5" />
              <span>{busy ? ts("signingOut") : ts("signOut")}</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
