"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Truck, PackageCheck, Clock, CheckCircle2, Navigation } from "lucide-react";
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

      {/* Courier Route Live Banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-line bg-linear-to-r from-white via-[#f6f9f2] to-[#eaf2e1] p-6 shadow-sm overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6"
      >
        <div className="space-y-3 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#196547]/10 text-[#196547] text-xs font-bold uppercase tracking-wider">
            <span className="size-2 rounded-full bg-[#196547] animate-pulse" />
            Active Route Dispatch
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-ink">
            Express Courier Transit & Milestone Updates
          </h2>
          <p className="text-sm text-text-muted leading-relaxed">
            Record parcel pickups, update express transit steps, and confirm doorstep deliveries with verified proof notes.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
              <Navigation className="size-3.5 text-primary" /> Active in Route: {inRoute} parcels
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
              <Clock className="size-3.5 text-amber-600" /> Pending Pickups: {readyPickup}
            </span>
          </div>
        </div>
        <div className="relative shrink-0 w-full md:w-72 h-44 rounded-xl overflow-hidden border border-line/80 shadow-md bg-white">
          <Image
            src="/courier-workspace.jpg"
            alt="3D express courier transit illustration"
            fill
            sizes="(max-width: 768px) 100vw, 288px"
            className="object-cover object-top transition-transform duration-500 hover:scale-105"
          />
        </div>
      </motion.div>

      {/* KPI Cards with Motion Hover */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
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
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
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
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
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
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
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
        </motion.div>
      </div>

      {/* Recent Deliveries list */}
      <CourierShipmentListView recent={true} />
    </div>
  );
}
