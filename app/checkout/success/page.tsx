import { ButtonLink, Card, EmptyState } from "@/components/ui/primitives";
export const metadata = { title: "You returned from Checkout" };
export default function Page() { return <div className="narrow-page"><Card><EmptyState title="You returned from Checkout" description="This page does not confirm or change a payment. Payment verification is not connected in this preview. Your Checkout session may still be open." action={<ButtonLink href="/customer/payments">View payments</ButtonLink>} /></Card></div>; }
