import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "User details" };
export default function Page() { return <PageShell title={"User details"} description={"Account information, role, and active status."} kind={"detail"} back={{"href": "/admin/users", "label": "Users"}} />; }
