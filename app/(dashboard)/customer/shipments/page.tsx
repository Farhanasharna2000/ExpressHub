import { Suspense } from "react";
import { ShipmentListView } from "@/features/shipments/list";
import { LoadingState } from "@/components/ui/primitives";
export const metadata = { title: "My shipments" };
export default function Page() { return <Suspense fallback={<LoadingState label="Loading shipments…" />}><ShipmentListView /></Suspense>; }
