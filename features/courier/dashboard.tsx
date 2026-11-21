"use client";

import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";
import { ErrorNotice } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/client/api";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Truck, PackageCheck, Clock, CheckCircle2, Navigation } from "lucide-react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useResource } from "@/features/shipments/use-resource";
import type { CourierDashboardStats } from "./contracts";
import { CourierShipmentListView } from "./list";
import { useCountUpOnce } from "@/lib/gsap";
import { useRef } from "react";
import { LiveLocationToggle } from "./live-location";

import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";
export function CourierDashboard() {
  const t = useTranslations("courier");
  const f = useFormat();
  const { data: stats, loading, refreshing, error, reload } = useResource<CourierDashboardStats>("/courier/stats");

  const total = stats?.total ?? 0;
  const readyPickup = stats?.readyPickup ?? 0;
  const inRoute = stats?.inRoute ?? 0;
  const delivered = stats?.delivered ?? 0;

  const scope = useRef<HTMLDivElement>(null);
  useCountUpOnce(scope, Boolean(stats));

  return (
    <div className="page-stack" ref={scope}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("courierOperationsWorkspace")}</p>
          <h1>{t("deliveryDashboard")}</h1>
          <p>{t("trackYourAssignmentsOrganize")}</p>
        </div>
        <Button asChild>
          <Link href="/courier/shipments">
            <Truck className="size-4 mr-2" /> {t("viewAllAssignments")}
          </Link>
        </Button>
      </div>

      {loading && <ResourceSkeleton variant="dashboard" label={t("loadingDeliveryMetrics")} />}
      {refreshing && <ResourceRefresh />}
      {!!error && <ErrorNotice title={t("couldNotLoadDelivery")} action={<Button variant="outline" onClick={reload}>{t("tryAgain")}</Button>}>{errorMessage(error)}</ErrorNotice>}
      {stats && <>
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
            {t("activeRouteDispatch")}
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-ink">
            {t("expressCourierTransitMilestone")}
          </h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {t("recordParcelPickupsUpdate")}
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
              <Navigation className="size-3.5 text-primary" /> {t("activeInRouteCount", { count: inRoute })}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
              <Clock className="size-3.5 text-amber-600" /> {t("pendingPickupsCount", { count: readyPickup })}
            </span>
          </div>
        </div>
        <div className="relative shrink-0 w-full md:w-72 h-44 rounded-xl overflow-hidden border border-line/80 shadow-md bg-white">
          <Image
            src="/courier-workspace.jpg"
            alt={t("n3dExpressCourierTransit")}
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
                <span>{t("totalAssigned")}</span>
                <Truck className="size-4 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-count-up>{f.digits(total)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("lifetimeAssignedDeliveries")}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                <span>{t("readyForPickup")}</span>
                <Clock className="size-4 text-amber-600" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700" data-count-up>{f.digits(readyPickup)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("awaitingCourierPickup")}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                <span>{t("activeInRoute")}</span>
                <PackageCheck className="size-4 text-blue-600" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700" data-count-up>{f.digits(inRoute)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("inTransitOrOut")}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                <span>{t("completedDeliveries")}</span>
                <CheckCircle2 className="size-4 text-emerald-600" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-700" data-count-up>{f.digits(delivered)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("successfullyDelivered")}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      </>}
      <LiveLocationToggle />
      {/* Recent Deliveries list */}
      <CourierShipmentListView recent={true} />
    </div>
  );
}
