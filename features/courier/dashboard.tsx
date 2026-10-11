"use client";

import Link from "next/link";
import { Truck, PackageCheck, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useResource } from "@/features/shipments/use-resource";
import type { ShipmentList } from "@/features/shipments/contracts";
import { CourierShipmentListView } from "./list";

export function CourierDashboard() {
  const { data } = useResource<ShipmentList>("/shipments/my-shipments?limit=100");

  const shipments = data?.shipments ?? [];
  const total = data?.pagination.total ?? shipments.length;

  const readyPickup = shipments.filter((s) => s.status === "CREATED").length;
  const inRoute = shipments.filter((s) =>
    ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(s.status)
  ).length;
  const delivered = shipments.filter((s) => s.status === "DELIVERED").length;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Courier Operations Workspace</p>
          <h1>Delivery Dashboard</h1>
          <p>Track your assignments, organize your delivery route, and record status updates.</p>
        </div>
        <Button asChild>
          <Link href="/courier/shipments">
            <Truck className="size-4 mr-2" /> View all assignments
          </Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Total Assigned</span>
              <Truck className="size-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">Lifetime assigned deliveries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Ready for Pickup</span>
              <Clock className="size-4 text-amber-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{readyPickup}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting courier pickup</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Active in Route</span>
              <PackageCheck className="size-4 text-blue-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{inRoute}</div>
            <p className="text-xs text-muted-foreground mt-1">In transit or out for delivery</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Completed Deliveries</span>
              <CheckCircle2 className="size-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{delivered}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully delivered</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Deliveries list */}
      <CourierShipmentListView recent={true} />
    </div>
  );
}
