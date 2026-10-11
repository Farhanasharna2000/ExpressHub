"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  StatusBadge,
  ResponsiveTable,
  EmptyState,
  ErrorNotice,
  LoadingState,
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
  {
    key: "action",
    label: "Details",
    render: (payment) => (
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/customer/payments/${encodeURIComponent(payment.id)}`}>
          View <ArrowRight className="size-3.5 ml-1" />
        </Link>
      </Button>
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
  const { data, loading, error, reload } = useResource<PaymentsListResponse>(resourcePath);
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
          <p className="eyebrow">Financial activity</p>
          <h1>My payments</h1>
          <p>Verified payment history and Stripe transaction statuses.</p>
        </div>
        <Button
          variant="outline"
          disabled={loading || delay > 0}
          onClick={reload}
          className="gap-2"
        >
          <RefreshCw className={loading ? "animate-spin size-4" : "size-4"} />
          Refresh
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

            <Select
              id="payment-limit"
              label="Per page"
              value={String(filters.limit)}
              onChange={(e) => update("limit", e.target.value)}
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size} records
                </option>
              ))}
            </Select>
          </div>

          {isFiltered && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs text-muted-foreground">
                Showing filtered payment transactions.
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <LoadingState label="Loading payment records…" />}

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
                      : "When you book shipments and complete Stripe Checkout, transactions appear here."
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

            {pagination.totalPages > 1 && (
              <div className="mt-6">
                <Pagination
                  meta={pagination}
                  onPageChange={(p) => update("page", String(p))}
                  busy={loading}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
