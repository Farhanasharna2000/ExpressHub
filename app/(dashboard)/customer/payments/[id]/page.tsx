import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Payment details" };
export default function Page() {
  return (
    <PageShell
      title={"Payment details"}
      description={
        "Payment status is confirmed by the service after provider verification."
      }
      kind={"detail"}
      back={{ href: "/customer/payments", label: "My payments" }}
    />
  );
}
