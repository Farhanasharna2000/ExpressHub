import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Assigned shipments" };
export default function Page() {
  return (
    <PageShell
      title={"Assigned shipments"}
      description={"Your pickup and delivery assignments."}
      kind={"list"}
    />
  );
}
