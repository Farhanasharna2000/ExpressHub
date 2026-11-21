import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PaymentsListView } from "@/features/payments/list";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer_payments") };
}

export default async function CustomerPaymentsPage() {
  const tp = await getTranslations("fallback");
  return (
    <Suspense fallback={<ResourceSkeleton variant="list" label={tp("loadingPayments")} />}>
      <PaymentsListView />
    </Suspense>
  );
}
