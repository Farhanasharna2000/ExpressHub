"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Users, Package, CreditCard, History, TrendingUp, RefreshCw, Truck, ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ErrorNotice,  StatusBadge } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/client/api";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
import type { DashboardStats } from "./contracts";
import { OpsBriefCard } from "@/features/ai/ops-brief";
import { useCountUpOnce } from "@/lib/gsap";
import { useRef } from "react";
import { FailedNotificationsCard } from "./failed-notifications";
import { DispatchQueueCard } from "./dispatch-suggestions";
import type { ShipmentStatus, PaymentStatus } from "@/types/api";

import { useTranslations } from "next-intl";
export function AdminDashboard() {
  const t = useTranslations("admin.dashboard");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
  const { data, loading, refreshing, error, reload } = useResource<DashboardStats>("/admin/dashboard-stats");
  const delay = useRetryDelay(error);

  const stats = data;

  const totalDelivered = stats?.shipments.byStatus.DELIVERED ?? 0;
  const deliveryRate =
    stats && stats.shipments.total > 0
      ? Math.round((totalDelivered / stats.shipments.total) * 100)
      : 0;

  const scope = useRef<HTMLDivElement>(null);
  useCountUpOnce(scope, Boolean(stats));

  return (
    <div className="page-stack" ref={scope}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("enterpriseOperations")}</p>
          <h1>{t("operationsOverview")}</h1>
          <p>{t("realTimeTelemetryAcross")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={loading || refreshing || delay > 0} onClick={reload}>
            <RefreshCw className={`size-4 mr-2 ${loading || refreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
          <Button asChild>
            <Link href="/admin/shipments">
              <Package className="size-4 mr-2" /> {t("manageShipments")}
            </Link>
          </Button>
        </div>
      </div>

      {!!error && (
        <ErrorNotice
          title={t("couldNotLoadOperations")}
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? tf("retryIn", { seconds: f.digits(delay) }) : t("tryAgain")}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {refreshing && <ResourceRefresh />}
      {loading && !stats && <ResourceSkeleton variant="dashboard" label={t("calculatingOperationsMetrics")} />}

      {stats && (
        <>
          {/* Operations Command Center Visual Banner */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-line bg-linear-to-r from-white via-[#f7f9f4] to-[#edf3e8] p-6 shadow-sm overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#196547]/10 text-[#196547] text-xs font-bold uppercase tracking-wider">
                <span className="size-2 rounded-full bg-[#196547] animate-pulse" />
                {t("liveLogisticsCommandTelemetry")}
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-ink">
                {t("realTimeOperationsCourier")}
              </h2>
              <p className="text-sm text-text-muted leading-relaxed">
                {t("superviseEndToEnd")}
              </p>
              <div className="flex flex-wrap gap-3 pt-1 text-xs">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
                  <ShieldCheck className="size-3.5 text-primary" /> {t("immutableLedger")}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
                  <Truck className="size-3.5 text-emerald-600" /> {t("activeCouriersCount", { count: stats.users.byRole.COURIER ?? 0 })}
                </span>
              </div>
            </div>
            <div className="relative shrink-0 w-full md:w-72 h-44 rounded-xl overflow-hidden border border-line/80 shadow-md bg-white">
              <Image
                src="/admin-center.jpg"
                alt={t("n3dLogisticsCommandCenter")}
                fill
                sizes="(max-width: 768px) 100vw, 288px"
                className="object-cover object-top transition-transform duration-500 hover:scale-105"
              />
            </div>
          </motion.div>

          <OpsBriefCard />

          <DispatchQueueCard />

          <FailedNotificationsCard />

          {/* Top Headline Metric Strip with Motion Hover */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t("totalShipments")}</span>
                    <Package className="size-4 text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-count-up>{f.digits(stats.shipments.total)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.rich("activeInTransit", { b: (chunks) => <span className="font-semibold text-primary">{chunks}</span>, count: stats.shipments.active })}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t("registeredUsers")}</span>
                    <Users className="size-4 text-emerald-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-count-up>{f.digits(stats.users.total)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.rich("activeAccounts", { b: (chunks) => <span className="font-semibold text-emerald-700">{chunks}</span>, count: stats.users.active })}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t("paymentTransactions")}</span>
                    <CreditCard className="size-4 text-blue-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-count-up>{f.digits(stats.payments.total)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-semibold text-blue-600">
                      {f.number(stats.payments.byStatus.PAID ?? 0)}
                    </span>{" "}
                    {t("settledWithStripe")}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t("deliverySuccessRate")}</span>
                    <TrendingUp className="size-4 text-violet-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" data-count-up>{f.digits(`${deliveryRate}%`)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("completedOf", { done: totalDelivered, total: stats.shipments.total })}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Quick Hub Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="size-4 text-primary" />
                    {t("shipmentOperations")}
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/shipments">{t("viewAll")} <ArrowRight className="inline size-4" aria-hidden="true" /></Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  {t("reviewCourierAssignmentsResolve")}
                </p>
                <div className="flex gap-2 pt-1 text-xs">
                  <span className="bg-muted px-2 py-1 rounded">
                    {t("activeCount", { count: stats.shipments.active })}
                  </span>
                  <span className="bg-muted px-2 py-1 rounded">
                    {t("failedCount", { count: stats.shipments.byStatus.FAILED ?? 0 })}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="size-4 text-emerald-600" />
                    {t("userDirectory")}
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/users">{t("viewAll")} <ArrowRight className="inline size-4" aria-hidden="true" /></Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  {t("manageAccountsConfigureCourier")}
                </p>
                <div className="flex gap-2 pt-1 text-xs">
                  <span className="bg-muted px-2 py-1 rounded">
                    {t("couriersCount", { count: stats.users.byRole.COURIER ?? 0 })}
                  </span>
                  <span className="bg-muted px-2 py-1 rounded">
                    {t("adminsCount", { count: stats.users.byRole.ADMIN ?? 0 })}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="size-4 text-violet-600" />
                    {t("auditLog")}
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/audit-logs">{t("viewLogs")} <ArrowRight className="inline size-4" aria-hidden="true" /></Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  {t("immutableSecurityRecordsOf")}
                </p>
                <div className="pt-1">
                  <span className="text-xs text-muted-foreground font-mono">
                    {t("systemWideActivityLedger")}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Shipment Pipeline Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="size-4 text-primary" />
                  {t("shipmentPipelineByStatus")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(
                    [
                      "CREATED",
                      "PICKED_UP",
                      "IN_TRANSIT",
                      "OUT_FOR_DELIVERY",
                      "DELIVERED",
                      "FAILED",
                      "RETURNED",
                      "CANCELLED",
                    ] as ShipmentStatus[]
                  ).map((st) => (
                    <div
                      key={st}
                      className="p-3 rounded-lg border bg-muted/20 flex flex-col justify-between"
                    >
                      <StatusBadge status={st} />
                      <div className="mt-3">
                        <span className="text-2xl font-bold">
                          {f.number(stats.shipments.byStatus[st] ?? 0)}
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {statusLabel(st)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* User Roles & Payment Collections Breakdown */}
            <div className="space-y-6">
              {/* Users by Role */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    {t("userDirectoryByRole")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs text-muted-foreground uppercase font-medium">
                        {t("customers")}
                      </span>
                      <p className="text-2xl font-bold mt-1 text-primary">
                        {f.number(stats.users.byRole.CUSTOMER ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("endUsers")}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs text-muted-foreground uppercase font-medium">
                        {t("couriers")}
                      </span>
                      <p className="text-2xl font-bold mt-1 text-emerald-600">
                        {f.number(stats.users.byRole.COURIER ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("deliveryFleet")}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs text-muted-foreground uppercase font-medium">
                        {t("admins")}
                      </span>
                      <p className="text-2xl font-bold mt-1 text-violet-600">
                        {f.number(stats.users.byRole.ADMIN ?? 0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("systemOperators")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Settlement Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="size-4 text-blue-600" />
                    {t("stripePaymentSettlements")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.payments.amounts.length > 0 ? (
                    <div className="space-y-2">
                      {stats.payments.amounts.map((item, idx) => (
                        <div
                          key={`${item.currency}-${item.status}-${idx}`}
                          className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/10 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <StatusBadge status={item.status} />
                            <span className="text-xs text-muted-foreground">
                              {t("transactions", { count: item.count })}
                            </span>
                          </div>
                          <span className="font-semibold">
                            {f.money(item.amount, item.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("noPaymentSettlementsRecorded")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
