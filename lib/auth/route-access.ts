import type { UserRole } from "@/types/api";

export function roleHome(role: UserRole) {
  return `/${role.toLowerCase()}`;
}
export function permittedPath(path: string, role: UserRole) {
  return (
    path === "/profile" ||
    path === roleHome(role) ||
    path.startsWith(`${roleHome(role)}/`) ||
    (role === "CUSTOMER" &&
      ["/checkout/success", "/checkout/cancel"].includes(path))
  );
}
export function safeReturnUrl(value: string | null, role: UserRole) {
  const fallback = roleHome(role);
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return fallback;
  const url = new URL(value, "https://expresshub.invalid");
  return url.origin === "https://expresshub.invalid" &&
    !url.pathname.includes("%") &&
    permittedPath(url.pathname, role)
    ? `${url.pathname}${url.search}${url.hash}`
    : fallback;
}

export function isProtectedPage(path: string) {
  return ["/admin", "/customer", "/courier", "/profile", "/checkout"].some(
    root => path === root || path.startsWith(`${root}/`),
  );
}
