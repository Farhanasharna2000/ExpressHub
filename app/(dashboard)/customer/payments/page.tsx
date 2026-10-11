import { Suspense } from "react";
import { PaymentsListView } from "@/features/payments/list";
import { LoadingState } from "@/components/ui/primitives";

export const metadata = { title: "My payments" };

export default function CustomerPaymentsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading payments…" />}>
      <PaymentsListView />
    </Suspense>
  );
}
