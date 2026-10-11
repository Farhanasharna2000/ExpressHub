import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Shipment operations detail" };
export default function Page() { return <PageShell title={"Shipment operations detail"} description={"Assignment, shipment history, and eligible operational actions."} kind={"detail"} back={{"href": "/admin/shipments", "label": "Shipments"}} />; }
