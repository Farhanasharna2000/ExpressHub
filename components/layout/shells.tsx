import Link from "next/link";
import type { ReactNode } from "react";
import { Navigation } from "./navigation";

import { Brand } from "./brand";
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="public-header">
        <Brand />
        <Navigation />
      </header>
      <main id="main-content" className="public-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <Brand />
        <span>From your doorstep to theirs.</span>
        <Link href="/login">Your account →</Link>
      </footer>
    </>
  );
}
export { DashboardShell } from "./dashboard-shell";
