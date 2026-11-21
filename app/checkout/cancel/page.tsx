import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CheckoutReturnView } from "@/features/payments/return-view";
import { ResourceSkeleton } from "@/components/ui/skeleton";

export async function generateMetadata() {
  const t = await getTranslations("pages");
  return { title: t("checkoutCancelled") };
}

export default async function CheckoutCancelPage() {
  const t = await getTranslations("pages");
  return (
    <Suspense fallback={<ResourceSkeleton variant="detail" label={t("checkingPayment")} />}>
      <CheckoutReturnView type="cancel" />
    </Suspense>
  );
}
