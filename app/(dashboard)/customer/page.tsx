import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ShipmentListView } from "@/features/shipments/list";
import { ResourceSkeleton } from "@/components/ui/skeleton";
export async function generateMetadata() {
  const t = await getTranslations("titles");
  return { title: t("customer") };
}
export default async function Page() {
  const tp = await getTranslations("fallback"); return <Suspense fallback={<ResourceSkeleton variant="list" label={tp("loadingShipments")} />}><ShipmentListView recent /></Suspense>; }
