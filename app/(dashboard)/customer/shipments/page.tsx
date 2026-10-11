import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "My shipments" };
export default function Page() {
  return (
    <PageShell
      title={"My shipments"}
      description={"Find and follow your shipments."}
      kind={"list"}
      action={{ href: "/customer/shipments/new", label: "Book a shipment" }}
    />
  );
}
