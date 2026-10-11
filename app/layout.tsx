import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionProvider } from "@/features/auth/provider";

export const metadata: Metadata = {
  title: {
    default: "ExpressHub — Every delivery connected",
    template: "%s | ExpressHub",
  },
  description:
    "Book, follow, and manage your courier deliveries with ExpressHub.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
