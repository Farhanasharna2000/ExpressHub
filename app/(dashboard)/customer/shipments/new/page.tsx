import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Book a shipment" };
export default function Page() {
  return (
    <PageShell
      title={"Book a shipment"}
      description={
        "Start with pickup details, then tell us where your parcel is going."
      }
      kind={"booking"}
      back={{ href: "/customer/shipments", label: "My shipments" }}
    />
  );
}
