"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import type { UserRole } from "@/types/api";

type Item = { href: string; label: string };
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
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const items = role
    ? [...navigation[role], { href: "/profile", label: "Profile" }]
    : [
        { href: "/", label: "Home" },
        { href: "/login", label: "Sign in" },
        { href: "/register", label: "Create account" },
      ];
  const active = items
    .filter(
      (i) =>
        pathname === i.href ||
        (i.href !== "/" && pathname.startsWith(`${i.href}/`)),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="navigation">
      <Button
        variant="secondary"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="primary-navigation"
        onClick={() => setOpenAt(open ? null : pathname)}
      >
        Menu {open ? "−" : "+"}
      </Button>
      <nav
        id="primary-navigation"
        className={open ? "nav-links is-open" : "nav-links"}
        aria-label={
          role ? `${role.toLowerCase()} navigation` : "Main navigation"
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
            aria-current={active === item.href ? "page" : undefined}
            onClick={() => setOpenAt(null)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
