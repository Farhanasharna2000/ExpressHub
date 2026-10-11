import { Suspense } from "react";
import { ShipmentListView } from "@/features/shipments/list";
import { LoadingState } from "@/components/ui/primitives";
export const metadata = { title: "Your deliveries, together" };
export default function Page() { return <Suspense fallback={<LoadingState label="Loading shipments…" />}><ShipmentListView recent /></Suspense>; }
