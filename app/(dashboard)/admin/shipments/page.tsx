import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Shipment operations" };
export default function Page() {
  return (
    <PageShell
      title={"Shipment operations"}
      description={"Review shipments and coordinate courier assignments."}
      kind={"list"}
    />
  );
}
