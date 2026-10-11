import { Suspense } from "react";
import { PaymentDetailsView } from "@/features/payments/detail";
import { LoadingState } from "@/components/ui/primitives";

export const metadata = { title: "Payment details" };

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingState label="Loading payment details…" />}>
      <PaymentDetailsView id={id} />
    </Suspense>
  );
}
