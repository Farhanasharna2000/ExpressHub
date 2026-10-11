import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Operations overview" };
export default function Page() {
  return (
    <PageShell
      title={"Operations overview"}
      description={"A shared view of shipment and user operations."}
      kind={"overview"}
      action={{ href: "/admin/shipments", label: "View shipments" }}
    />
  );
}
