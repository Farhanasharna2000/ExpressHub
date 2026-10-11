import Link from "next/link";
import type { ReactNode } from "react";
import type { UserRole } from "@/types/api";
import { Navigation } from "./navigation";

export function Brand() { return <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">E↗</span>Express<span>Hub</span></Link>; }
export function PublicShell({ children }: { children: ReactNode }) {
  return <><header className="public-header"><Brand /><Navigation /></header><main id="main-content" className="public-main" tabIndex={-1}>{children}</main><footer className="site-footer"><Brand /><span>From your doorstep to theirs.</span><Link href="/login">Your account →</Link></footer></>;
}
export function DashboardShell({ children, role }: { children: ReactNode; role?: UserRole }) {
  return <div className="workspace"><aside className="sidebar"><Brand /><p className="eyebrow">{role ? `${role.toLowerCase()} workspace` : "Your account"}</p><Navigation role={role} /><div className="sidebar-note">Every delivery starts with a connection.</div></aside><div className="workspace-body"><header className="workspace-header"><span>Workspace preview</span><Link href="/">Back to home ↗</Link></header><main id="main-content" tabIndex={-1}><div className="preview-notice">Preview only · Sign-in and live records are not connected yet.</div>{children}</main></div></div>;
}
