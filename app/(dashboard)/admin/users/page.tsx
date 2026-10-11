import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "User management" };
export default function Page() {
  return (
    <PageShell
      title={"User management"}
      description={"Manage customer, courier, and administrator accounts."}
      kind={"list"}
    />
  );
}
