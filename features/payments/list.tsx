"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RefreshCw, CreditCard, RotateCcw, Search, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Input,
  Select,
  StatusBadge,
  ResponsiveTable,
  EmptyState,
  ErrorNotice,
  type Column,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/interactive";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
import { errorMessage } from "@/lib/client/api";
import {
  dateTime,
  money,
  parsePaymentFilters,
  statusLabel,
  type Payment,
  type PaymentsListResponse,
} from "./contracts";
import type { PaymentStatus } from "@/types/api";

const paymentStatuses: PaymentStatus[] = [
  "PAID",
  "PENDING",
  "REFUNDED",
  "REFUND_PENDING",
  "FAILED",
];

const quickPaymentPresets = [
  { label: "All Payments", value: "", dotColor: "bg-muted-foreground" },
  { label: "Paid", value: "PAID", dotColor: "bg-emerald-500" },
  { label: "Pending", value: "PENDING", dotColor: "bg-amber-500" },
  { label: "Refunded", value: "REFUNDED", dotColor: "bg-sky-500" },
  { label: "Refund Pending", value: "REFUND_PENDING", dotColor: "bg-purple-500" },
  { label: "Failed", value: "FAILED", dotColor: "bg-red-500" },
];

const friendlyPaymentNames: Record<string, string> = {
  PAID: "Paid",
  PENDING: "Pending verification",
  REFUNDED: "Refunded",
  REFUND_PENDING: "Refund pending",
  FAILED: "Payment failed",
};

const columns: Column<Payment>[] = [
  {
    key: "id",
    label: "Payment ID",
    render: (payment) => (
      <Link
        href={`/customer/payments/${encodeURIComponent(payment.id)}`}
        className="font-semibold font-mono text-xs text-primary hover:underline break-all"
      >
        {payment.id}
      </Link>
    ),
  },
  {
    key: "shipment",
    label: "Shipment",
    render: (payment) => (
      <Link
        href={`/customer/shipments/${encodeURIComponent(payment.shipmentId)}`}
        className="text-xs font-mono text-muted-foreground hover:underline break-all"
      >
        {payment.shipmentId}
      </Link>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    render: (payment) => (
      <span className="font-semibold whitespace-nowrap">
        {money(payment.amount, payment.currency)}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (payment) => <StatusBadge status={payment.status} />,
  },
  {
    key: "date",
    label: "Date",
    render: (payment) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {dateTime(payment.paidAt || payment.createdAt)}
      </span>
    ),
  },
];

export function PaymentsListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parsePaymentFilters(searchParams);

  const query = new URLSearchParams();
  query.set("page", String(filters.page));
  query.set("limit", String(filters.limit));
  if (filters.status) query.set("status", filters.status);
  if (filters.shipmentId) query.set("shipmentId", filters.shipmentId);

  const resourcePath = `/payments?${query.toString()}`;
  const { data, loading, refreshing, error, reload } = useResource<PaymentsListResponse>(resourcePath);
  const delay = useRetryDelay(error);

  const payments = data?.payments ?? [];
  const pagination = data?.pagination ?? {
    page: filters.page,
    limit: filters.limit,
    total: 0,
    totalPages: 1,
  };

  const [shipmentSearch, setShipmentSearch] = useState(filters.shipmentId ?? "");
  const urlShipment = filters.shipmentId ?? "";

  useEffect(() => {
    setShipmentSearch(urlShipment);
  }, [urlShipment]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== "page") next.set("page", "1");
    router.replace(`/customer/payments?${next.toString()}`);
  }

  useEffect(() => {
    if (shipmentSearch.trim() === urlShipment) return;
    const timer = window.setTimeout(() => update("shipmentId", shipmentSearch.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [shipmentSearch, urlShipment]);

  function clearFilters() {
    setShipmentSearch("");
    router.replace("/customer/payments");
  }

  const activeCount = [
    Boolean(filters.status),
    Boolean(filters.shipmentId),
  ].filter(Boolean).length;

  const isFiltered = Boolean(filters.status || filters.shipmentId);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Billing & Transactions</p>
          <h1>My payments</h1>
          <p>Review payment records, verify transaction receipts, and track refund requests.</p>
        </div>
        <Button
          variant="outline"
          disabled={loading || refreshing || delay > 0}
          onClick={reload}
          className="gap-2 cursor-pointer"
        >
          <RefreshCw className={loading || refreshing ? "animate-spin size-4" : "size-4"} />
          {loading ? "Updating payments…" : "Refresh"}
        </Button>
      </div>

      <Card className="shipment-filter-panel gap-0 overflow-hidden py-0 shadow-sm border border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <CreditCard className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Filter Payments
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    Live transaction history
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quickly filter by payment status or search by shipment ID reference.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {isFiltered && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs text-muted-foreground hover:text-destructive font-medium cursor-pointer"
              >
                <RotateCcw className="size-3.5 mr-1" aria-hidden="true" />
                Reset filters
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Quick Payment Status Pill Bar */}
        <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6">
          <div className="quick-filter-options">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="size-3 text-muted-foreground" /> Status:
            </span>
            {quickPaymentPresets.map((preset) => {
              const isActive = (filters.status ?? "") === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => update("status", preset.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#196547] text-white shadow-xs font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isActive ? "bg-white" : preset.dotColor
                    }`}
                  />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <CardContent className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative min-w-0">
              <Input
                id="payment-shipment-id"
                label="Search by shipment ID"
                placeholder="Enter shipment ID reference..."
                maxLength={100}
                value={shipmentSearch}
                onChange={(e) => setShipmentSearch(e.target.value)}
                className="shipment-search-input pr-8"
              />
              <Search className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden="true" />
              {shipmentSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setShipmentSearch("");
                    update("shipmentId", "");
                  }}
                  className="absolute bottom-3.5 right-3 size-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Select
              id="payment-status-filter"
              label="Payment status"
              value={filters.status ?? ""}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">All payment statuses</option>
              {paymentStatuses.map((st) => (
                <option key={st} value={st}>
                  {friendlyPaymentNames[st] ?? statusLabel(st)}
                </option>
              ))}
            </Select>
          </div>

          {/* Active Filter Chips Bar */}
          {isFiltered && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Active filters:</span>

              {filters.status && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <span>Status: {friendlyPaymentNames[filters.status] ?? statusLabel(filters.status)}</span>
                  <button
                    type="button"
                    onClick={() => update("status", "")}
                    className="text-primary hover:text-primary/70 cursor-pointer"
                    title="Remove status filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {filters.shipmentId && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <span>Shipment: &ldquo;{filters.shipmentId}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShipmentSearch("");
                      update("shipmentId", "");
                    }}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Remove shipment filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer ml-auto"
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Result count */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <span>Instant Stripe-verified settlements</span>
            {pagination.total > 0 && (
              <span className="font-medium text-foreground">
                Showing {payments.length} of {pagination.total} {pagination.total === 1 ? "payment" : "payments"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {refreshing && <ResourceRefresh />}
      {loading && <ResourceSkeleton variant="list" label="Loading your payment history…" />}

      {!!error && (
        <ErrorNotice
          title="Could not load payment records"
          action={
            <Button
              variant="outline"
              onClick={reload}
              disabled={delay > 0}
              className="mt-2"
            >
              {delay > 0 ? `Retry in ${delay}s` : "Try again"}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {data && (
        <Card>
          <CardContent className="shipment-results p-4 sm:p-6">
            <ResponsiveTable
              caption="Your payment transactions"
              columns={columns}
              rows={payments}
              rowKey={(p) => p.id}
              empty={
                <EmptyState
                  title={
                    pagination.total > 0
                      ? "No payments on this page"
                      : isFiltered
                      ? "No matching payments"
                      : "No payments recorded yet"
                  }
                  description={
                    pagination.total > 0
                      ? "Return to the first page to view your payments."
                      : isFiltered
                      ? "Try selecting another status or clear the filter."
                      : "Payments for your shipments will appear here."
                  }
                  action={
                    pagination.total > 0 ? (
                      <Button variant="outline" onClick={() => update("page", "1")}>
                        Go to first page
                      </Button>
                    ) : isFiltered ? (
                      <Button variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link href="/customer/shipments/new">Book a shipment</Link>
                      </Button>
                    )
                  }
                />
              }
            />

            <div>
              <Pagination
                meta={pagination}
                onPageSizeChange={(size) => update("limit", String(size))}
                onPageChange={(p) => update("page", String(p))}
                busy={loading}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
