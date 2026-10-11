import { PageShell } from "@/components/layout/page-shell";
export const metadata = { title: "My payments" };
export default function Page() {
  return (
    <PageShell
      title={"My payments"}
      description={"Your payment history and verified payment details."}
      kind={"list"}
    />
  );
}
