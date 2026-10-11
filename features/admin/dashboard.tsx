"use client";

import Link from "next/link";
import {
  Users,
  Package,
  CreditCard,
  History,
  TrendingUp,
  RefreshCw,
  Truck,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ErrorNotice, LoadingState, StatusBadge } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/client/api";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { statusLabel, money } from "@/features/shipments/contracts";
import type { DashboardStats } from "./contracts";
import type { ShipmentStatus, PaymentStatus } from "@/types/api";

export function AdminDashboard() {
  const { data, loading, error, reload } = useResource<DashboardStats>("/admin/dashboard-stats");
  const delay = useRetryDelay(error);

  const stats = data;

  const totalDelivered = stats?.shipments.byStatus.DELIVERED ?? 0;
  const deliveryRate =
    stats && stats.shipments.total > 0
      ? Math.round((totalDelivered / stats.shipments.total) * 100)
      : 0;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Enterprise Operations</p>
          <h1>Operations Overview</h1>
          <p>Real-time telemetry across shipments, logistics fleet, customer accounts, and revenue.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={loading || delay > 0} onClick={reload}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/admin/shipments">
              <Package className="size-4 mr-2" /> Manage Shipments
            </Link>
          </Button>
        </div>
      </div>

      {!!error && (
        <ErrorNotice
          title="Could not load operations stats"
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? `Retry in ${delay}s` : "Try again"}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {loading && !stats && <LoadingState label="Calculating operations metrics…" />}

      {stats && (
        <>
          {/* Top Headline Metric Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Total Shipments</span>
                  <Package className="size-4 text-primary" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.shipments.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-primary">{stats.shipments.active}</span> active in transit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Registered Users</span>
                  <Users className="size-4 text-emerald-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.users.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-emerald-600">{stats.users.active}</span> active accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Payment Transactions</span>
                  <CreditCard className="size-4 text-blue-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.payments.total}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-blue-600">
                    {stats.payments.byStatus.PAID ?? 0}
                  </span>{" "}
                  settled with Stripe
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span>Delivery Success Rate</span>
                  <TrendingUp className="size-4 text-violet-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{deliveryRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalDelivered} of {stats.shipments.total} completed
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Hub Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="size-4 text-primary" />
                    Shipment Operations
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/shipments">View All →</Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  Review courier assignments, resolve transit exceptions, and manage parcels.
                </p>
                <div className="flex gap-2 pt-1 text-xs">
                  <span className="bg-muted px-2 py-1 rounded">
                    Active: {stats.shipments.active}
                  </span>
                  <span className="bg-muted px-2 py-1 rounded">
                    Failed: {stats.shipments.byStatus.FAILED ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="size-4 text-emerald-600" />
                    User Directory
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/users">View All →</Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  Manage accounts, configure courier and admin permissions, and inspect access.
                </p>
                <div className="flex gap-2 pt-1 text-xs">
                  <span className="bg-muted px-2 py-1 rounded">
                    Couriers: {stats.users.byRole.COURIER ?? 0}
                  </span>
                  <span className="bg-muted px-2 py-1 rounded">
                    Admins: {stats.users.byRole.ADMIN ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="size-4 text-violet-600" />
                    Audit Log
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/audit-logs">View Logs →</Link>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">
                  Immutable security records of administrative actions, status updates, and deletions.
                </p>
                <div className="pt-1">
                  <span className="text-xs text-muted-foreground font-mono">
                    System-wide activity ledger
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
                  Shipment Pipeline by Status
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
                          {stats.shipments.byStatus[st] ?? 0}
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
                    User Directory by Role
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs text-muted-foreground uppercase font-medium">
                        Customers
                      </span>
                      <p className="text-2xl font-bold mt-1 text-primary">
                        {stats.users.byRole.CUSTOMER ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">End users</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs text-muted-foreground uppercase font-medium">
                        Couriers
                      </span>
                      <p className="text-2xl font-bold mt-1 text-emerald-600">
                        {stats.users.byRole.COURIER ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Delivery fleet</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs text-muted-foreground uppercase font-medium">
                        Admins
                      </span>
                      <p className="text-2xl font-bold mt-1 text-violet-600">
                        {stats.users.byRole.ADMIN ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">System operators</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Settlement Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="size-4 text-blue-600" />
                    Stripe Payment Settlements
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
                              ({item.count} {item.count === 1 ? "transaction" : "transactions"})
                            </span>
                          </div>
                          <span className="font-semibold">
                            {money(item.amount, item.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No payment settlements recorded yet.
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
