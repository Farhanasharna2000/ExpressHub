import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Your deliveries, together" };
export default function Page() {
  return (
    <PageShell
      title={"Your deliveries, together"}
      description={"A home for your recent shipments and next delivery."}
      kind={"overview"}
      action={{ href: "/customer/shipments/new", label: "Book a shipment" }}
    />
  );
}
