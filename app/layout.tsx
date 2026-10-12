import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionProvider } from "@/features/auth/provider";
import { Toaster } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: {
    default: "ExpressHub - Every delivery connected",
    template: "%s | ExpressHub",
  },
  description:
    "Book, follow, and manage your courier deliveries with ExpressHub.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SessionProvider>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
