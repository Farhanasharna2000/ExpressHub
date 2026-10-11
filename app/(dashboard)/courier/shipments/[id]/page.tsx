import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "Delivery details" };
export default function Page() { return <PageShell title={"Delivery details"} description={"Pickup, recipient information, and delivery progress."} kind={"detail"} back={{"href": "/courier/shipments", "label": "Assigned shipments"}} />; }
