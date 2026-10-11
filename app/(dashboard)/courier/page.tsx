import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Ready for the next stop" };
export default function Page() {
  return (
    <PageShell
      title={"Ready for the next stop"}
      description={"Keep your assigned deliveries in view."}
      kind={"overview"}
      action={{ href: "/courier/shipments", label: "View assigned shipments" }}
    />
  );
}
