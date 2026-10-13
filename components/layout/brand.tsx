import Link from "next/link";
import Image from "next/image";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`brand ${className ?? ""}`.trim()}
      aria-label="ExpressHub home"
    >
      <Image
        src="/ex-logo.png"
        alt="ExpressHub"
        width={180}
        height={60}
        className="h-auto w-[180px]"
      />
    </Link>
  );
}
