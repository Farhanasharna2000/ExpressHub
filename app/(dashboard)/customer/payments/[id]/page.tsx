import { Suspense } from "react";
import { PaymentDetailsView } from "@/features/payments/detail";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Payment details" };

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<ResourceSkeleton variant="detail" label="Loading payment details…" />}>
      <PaymentDetailsView id={id} />
    </Suspense>
  );
}
