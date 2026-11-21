import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CheckoutReturnView } from "@/features/payments/return-view";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export async function generateMetadata() {
  const t = await getTranslations("pages");
  return { title: t("paymentReturned") };
}

export default async function CheckoutSuccessPage() {
  const t = await getTranslations("pages");
  return (
    <Suspense fallback={<ResourceSkeleton variant="detail" label={t("verifyingPayment")} />}>
      <CheckoutReturnView type="success" />
    </Suspense>
  );
}
