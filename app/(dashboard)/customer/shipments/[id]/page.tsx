import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Shipment details" };
export default function Page() {
  return (
    <PageShell
      title={"Shipment details"}
      description={
        "Shipment information, delivery history, and payment status."
      }
      kind={"detail"}
      back={{ href: "/customer/shipments", label: "My shipments" }}
    />
  );
}
