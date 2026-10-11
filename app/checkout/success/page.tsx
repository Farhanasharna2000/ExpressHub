import { Suspense } from "react";
import { CheckoutReturnView } from "@/features/payments/return-view";
import { LoadingState } from "@/components/ui/primitives";

export const metadata = { title: "Payment returned" };

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<LoadingState label="Verifying payment session…" />}>
      <CheckoutReturnView type="success" />
    </Suspense>
  );
}
