import { Suspense } from "react";
import { PaymentsListView } from "@/features/payments/list";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export const metadata = { title: "My payments" };

export default function CustomerPaymentsPage() {
  return (
    <Suspense fallback={<ResourceSkeleton variant="list" label="Loading payments…" />}>
      <PaymentsListView />
    </Suspense>
  );
}
