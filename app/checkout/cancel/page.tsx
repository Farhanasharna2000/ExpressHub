import { Suspense } from "react";
import { CheckoutReturnView } from "@/features/payments/return-view";
import { LoadingState } from "@/components/ui/primitives";

export const metadata = { title: "Checkout cancelled" };

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={<LoadingState label="Checking payment session…" />}>
      <CheckoutReturnView type="cancel" />
    </Suspense>
  );
}
