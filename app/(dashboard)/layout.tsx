import type { ReactNode } from "react";
import { AuthGate } from "@/features/auth/provider";
export default function Layout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
