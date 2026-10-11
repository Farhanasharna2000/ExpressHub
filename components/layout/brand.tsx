import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`brand ${className ?? ""}`.trim()}
      aria-label="ExpressHub home"
    >
      <Logo size={28} variant="icon" className="mr-1" />
      Express<span>Hub</span>
    </Link>
  );
}
