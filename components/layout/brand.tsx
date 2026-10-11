import Link from "next/link";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark" aria-hidden="true">
        E↗
      </span>
      Express<span>Hub</span>
    </Link>
  );
}
