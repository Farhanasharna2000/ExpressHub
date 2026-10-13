"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
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
  "PENDING",
  "PAID",
  "FAILED",
  "REFUND_PENDING",
  "REFUNDED",
];

const columns: Column<Payment>[] = [
  {
    key: "id",
    label: "Payment ID",
    render: (payment) => (
      <Link
        href={`/customer/payments/${encodeURIComponent(payment.id)}`}
        className="font-semibold font-mono text-xs text-foreground hover:underline break-all"
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

  function clearFilters() {
    router.replace("/customer/payments");
  }

  const isFiltered = Boolean(filters.status || filters.shipmentId);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1>My payments</h1>
        </div>
        <Button
          variant="outline"
          disabled={loading || refreshing || delay > 0}
          onClick={reload}
          className="gap-2"
        >
          <RefreshCw className={loading || refreshing ? "animate-spin size-4" : "size-4"} />
          {loading ? "Updating payments…" : "Refresh"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Select
              id="payment-status-filter"
              label="Payment status"
              value={filters.status ?? ""}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {paymentStatuses.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(st)}
                </option>
              ))}
            </Select>


          </div>

          {isFiltered && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}
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
                  meta={pagination} onPageSizeChange={size => update("limit", String(size))}
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
