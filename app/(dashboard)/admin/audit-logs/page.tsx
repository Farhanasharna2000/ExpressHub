import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Audit history" };
export default function Page() {
  return (
    <PageShell
      title={"Audit history"}
      description={"Review recorded changes across your operations."}
      kind={"list"}
    />
  );
}
