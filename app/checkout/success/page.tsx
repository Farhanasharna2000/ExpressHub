import { Suspense } from "react";
import { CheckoutReturnView } from "@/features/payments/return-view";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Payment returned" };

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<ResourceSkeleton variant="detail" label="Verifying payment session…" />}>
      <CheckoutReturnView type="success" />
    </Suspense>
  );
}
