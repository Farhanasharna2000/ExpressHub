import { Suspense } from "react";
import { ShipmentListView } from "@/features/shipments/list";
import { ResourceSkeleton } from "@/components/ui/skeleton";
export const metadata = { title: "Your deliveries, together" };
export default function Page() { return <Suspense fallback={<ResourceSkeleton variant="list" label="Loading shipments…" />}><ShipmentListView recent /></Suspense>; }
