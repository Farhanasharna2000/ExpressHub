import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PaymentDetailsView } from "@/features/payments/detail";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer_payments_id") };
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tp = await getTranslations("fallback");
  return (
    <Suspense fallback={<ResourceSkeleton variant="detail" label={tp("loadingPayment")} />}>
      <PaymentDetailsView id={id} />
    </Suspense>
  );
}
