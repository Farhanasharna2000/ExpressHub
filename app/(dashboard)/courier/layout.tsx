import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/shells";
import { CourierPwa } from "@/features/courier/pwa";
import { LiveLocationProvider } from "@/features/courier/live-location";

// Only the courier workspace is installable; its manifest scope is /courier.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ExpressHub Courier", statusBarStyle: "default" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell role="COURIER">
      <CourierPwa />
      <LiveLocationProvider>{children}</LiveLocationProvider>
    </DashboardShell>
  );
}
