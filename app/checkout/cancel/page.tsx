import { Suspense } from "react";
import { CheckoutReturnView } from "@/features/payments/return-view";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Checkout cancelled" };

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={<ResourceSkeleton variant="detail" label="Checking payment session…" />}>
      <CheckoutReturnView type="cancel" />
    </Suspense>
  );
}
