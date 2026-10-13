"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  RotateCcw,
  Package,
  ShieldCheck,
  ArrowDown,
  SlidersHorizontal,
  Clock3,
  X,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { queryString, errorMessage } from "@/lib/client/api";
import {
  dateTime,
  localToISO,
  money,
  paymentStatuses,
  readShipmentQuery,
  shipmentStatuses,
  statusLabel,
  toLocalInput,
  type Shipment,
  type ShipmentList,
} from "./contracts";
import { useResource, useRetryDelay } from "./use-resource";

const columns: Column<Shipment>[] = [
  {
    key: "tracking",
    label: "Tracking number",
    render: (shipment) => (
      <Link
        className="font-semibold break-all text-primary hover:underline"
        href={`/customer/shipments/${encodeURIComponent(shipment.id)}`}
      >
        {shipment.trackingNumber}
      </Link>
    ),
  },
  {
    key: "route",
    label: "Pickup → Delivery",
    render: (shipment) => (
      <div className="shipment-route">
        <span title={shipment.pickupAddress}>{shipment.pickupAddress}</span>
        <span aria-hidden="true">
          <ArrowDown className="inline size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span title={shipment.deliveryAddress}>{shipment.deliveryAddress}</span>
      </div>
    ),
  },
  {
    key: "status",
    label: "Shipment",
    render: (shipment) => <StatusBadge status={shipment.status} />,
  },
  {
    key: "payment",
    label: "Payment",
    render: (shipment) => <StatusBadge status={shipment.paymentStatus} />,
  },
  {
    key: "price",
    label: "Price",
    render: (shipment) => (
      <span className="whitespace-nowrap font-medium">
        {money(shipment.price, shipment.currency)}
      </span>
    ),
  },
  {
    key: "date",
    label: "Created",
    render: (shipment) => (
      <time dateTime={shipment.createdAt} className="text-muted-foreground text-xs">
        {dateTime(shipment.createdAt)}
      </time>
    ),
  },
];

const friendlyStatusNames: Record<string, string> = {
  CREATED: "Order placed",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery issue",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

const friendlyPaymentNames: Record<string, string> = {
  PAID: "Paid",
  PENDING: "Pending payment",
  FAILED: "Payment failed",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};

const quickStatusPresets = [
  { label: "All Shipments", value: "", dotColor: "bg-muted-foreground" },
  { label: "Order Placed", value: "CREATED", dotColor: "bg-blue-500" },
  { label: "Picked Up", value: "PICKED_UP", dotColor: "bg-sky-500" },
  { label: "In Transit", value: "IN_TRANSIT", dotColor: "bg-amber-500" },
  { label: "Out for Delivery", value: "OUT_FOR_DELIVERY", dotColor: "bg-purple-500" },
  { label: "Delivered", value: "DELIVERED", dotColor: "bg-emerald-500" },
  { label: "Delivery Issue", value: "FAILED", dotColor: "bg-red-500" },
  { label: "Cancelled", value: "CANCELLED", dotColor: "bg-neutral-400" },
];

export function ShipmentListView({ recent = false }: { recent?: boolean }) {
  const params = useSearchParams();
  const serialized = recent ? "limit=5&sortBy=createdAt&order=desc" : params.toString();
  const query = useMemo(() => {
    try {
      return { value: readShipmentQuery(new URLSearchParams(serialized)), error: "" };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Invalid filters" };
    }
  }, [serialized]);
  const { data, loading, refreshing, error, reload } = useResource<ShipmentList>(
    query.value ? `/shipments${queryString(query.value)}` : null
  );
  const delay = useRetryDelay(error);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [dateError, setDateError] = useState("");
  const urlSearch = params.get("q") ?? "";

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    const href = `/customer/shipments${next.size ? `?${next}` : ""}`;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }

  useEffect(() => {
    if (recent || search.trim() === urlSearch) return;
    const timer = window.setTimeout(() => update("q", search.trim(), true), 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, recent]);

  function clear() {
    setSearch("");
    setDateError("");
    window.history.pushState(null, "", "/customer/shipments");
  }

  function dateFilter(key: string, value: string) {
    try {
      update(key, value ? localToISO(value) : "");
      setDateError("");
    } catch (error) {
      setDateError(error instanceof Error ? error.message : "Invalid date/time");
    }
  }

  const sortBy = params.get("sortBy") ?? "createdAt";
  const order = params.get("order") ?? "desc";
  const isDateSort = sortBy === "createdAt" || sortBy === "updatedAt";

  const activeCount = [
    Boolean(search.trim()),
    Boolean(params.get("status")),
    Boolean(params.get("paymentStatus")),
    Boolean(params.get("from")),
    Boolean(params.get("to")),
    Boolean(params.get("sortBy") && params.get("sortBy") !== "createdAt"),
    Boolean(params.get("order") && (isDateSort ? params.get("order") !== "desc" : params.get("order") !== "asc")),
  ].filter(Boolean).length;

  const filtered = Boolean(
    query.value &&
      [
        query.value.q,
        query.value.status,
        query.value.paymentStatus,
        query.value.from,
        query.value.to,
        params.get("sortBy") && params.get("sortBy") !== "createdAt",
        params.get("order") && (isDateSort ? params.get("order") !== "desc" : params.get("order") !== "asc"),
      ].some(Boolean)
  );

  return (
    <div className="page-stack">
      {recent && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-line bg-linear-to-r from-white via-[#f7f9f4] to-[#edf3e8] p-6 shadow-sm overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#196547]/10 text-[#196547] text-xs font-bold uppercase tracking-wider">
              <span className="size-2 rounded-full bg-[#196547] animate-pulse" />
              Customer Delivery Portal
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-ink">
              Smart Parcel Booking & Live Milestone Tracking
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">
              Create doorstep pickup requests, settle payments with Stripe Checkout, and follow real-time courier milestone updates.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
                <Package className="size-3.5 text-primary" /> Weight-based pricing
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-line font-semibold text-ink">
                <ShieldCheck className="size-3.5 text-emerald-600" /> Stripe Verified Payments
              </span>
            </div>
          </div>
          <div className="relative shrink-0 w-full md:w-72 h-44 rounded-xl overflow-hidden border border-line/80 shadow-md bg-white">
            <Image
              src="/courier-customer.jpg"
              alt="Customer workspace overview"
              fill
              sizes="(max-width: 768px) 100vw, 288px"
              className="object-cover object-top transition-transform duration-500 hover:scale-105"
            />
          </div>
        </motion.div>
      )}

      <div className="page-heading">
        <div>
          <p className="eyebrow">Your parcels, in one place</p>
          <h1>{recent ? "Your deliveries, together" : "My shipments"}</h1>
          <p>
            {recent
              ? "Your five most recent shipments. Ready for the next delivery?"
              : "Search, track, and manage your deliveries."}
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link href="/customer/shipments/new">
            <Plus />
            Book a shipment
          </Link>
        </Button>
      </div>

      {!recent && (
        <Card className="shipment-filter-panel gap-0 overflow-hidden py-0 shadow-sm border border-border/80">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 bg-muted/20">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                <SlidersHorizontal className="size-4.5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-bold text-foreground">
                    Filter Shipments
                  </CardTitle>
                  {activeCount > 0 ? (
                    <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                      {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                      Quick parcel search
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filter by status, search by tracking number or address, or select a booking date.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {filtered && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  className="h-8 text-xs text-muted-foreground hover:text-destructive font-medium cursor-pointer"
                >
                  <RotateCcw className="size-3.5 mr-1" aria-hidden="true" />
                  Reset filters
                </Button>
              )}
            </div>
          </CardHeader>

          {/* Quick Status Pill Bar */}
          <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5 min-w-max">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <Filter className="size-3 text-muted-foreground" /> Status:
              </span>
              {quickStatusPresets.map((preset) => {
                const isActive = (params.get("status") ?? "") === preset.value;
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
            {/* Primary Filter Grid: Search, Status, Payment Status */}
            <div className="shipment-filter-primary">
              <div className="relative min-w-0">
                <Input
                  id="shipment-search"
                  label="Search shipments"
                  placeholder="Tracking number, recipient, address..."
                  maxLength={100}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="shipment-search-input pr-8"
                />
                <Search className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden="true" />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      update("q", "", true);
                    }}
                    className="absolute bottom-3.5 right-3 size-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Select
                id="shipment-status"
                label="Delivery status"
                value={params.get("status") ?? ""}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="">All statuses</option>
                {shipmentStatuses.map((st) => (
                  <option key={st} value={st}>
                    {friendlyStatusNames[st] ?? statusLabel(st)}
                  </option>
                ))}
              </Select>

              <Select
                id="payment-status"
                label="Payment status"
                value={params.get("paymentStatus") ?? ""}
                onChange={(e) => update("paymentStatus", e.target.value)}
              >
                <option value="">All payments</option>
                {paymentStatuses.map((st) => (
                  <option key={st} value={st}>
                    {friendlyPaymentNames[st] ?? statusLabel(st)}
                  </option>
                ))}
              </Select>
            </div>

            {/* Secondary Row: Date Range & Quick Presets & Sorting */}
            <div className="pt-4 border-t border-border/60 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="sm:col-span-1">
                  <Input
                    id="created-from"
                    label="Booked from"
                    type="datetime-local"
                    value={toLocalInput(params.get("from") ?? "")}
                    onChange={(e) => dateFilter("from", e.target.value)}
                  />
                </div>

                <div className="sm:col-span-1">
                  <Input
                    id="created-to"
                    label="Booked to"
                    type="datetime-local"
                    value={toLocalInput(params.get("to") ?? "")}
                    onChange={(e) => dateFilter("to", e.target.value)}
                  />
                </div>

                <div className="sm:col-span-2 pb-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1 font-medium">Quick dates:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                        update("from", startOfDay.toISOString());
                        update("to", "");
                      }}
                      className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        update("from", sevenDaysAgo.toISOString());
                        update("to", "");
                      }}
                      className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                    >
                      Last 7 days
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        update("from", thirtyDaysAgo.toISOString());
                        update("to", "");
                      }}
                      className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                    >
                      Last 30 days
                    </button>
                    {(params.get("from") || params.get("to")) && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = new URLSearchParams(window.location.search);
                          next.delete("from");
                          next.delete("to");
                          next.set("page", "1");
                          window.history.pushState(null, "", `/customer/shipments?${next}`);
                        }}
                        className="text-xs px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 font-medium transition-colors cursor-pointer ml-1"
                      >
                        Clear dates
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Filter Chips Bar */}
            {filtered && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Active filters:</span>

                {search.trim() && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                    <span>Search: &ldquo;{search.trim()}&rdquo;</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        update("q", "", true);
                      }}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Remove search filter"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {params.get("status") && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                    <span>Status: {friendlyStatusNames[params.get("status")!] ?? statusLabel(params.get("status")!)}</span>
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

                {params.get("paymentStatus") && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                    <span>Payment: {friendlyPaymentNames[params.get("paymentStatus")!] ?? statusLabel(params.get("paymentStatus")!)}</span>
                    <button
                      type="button"
                      onClick={() => update("paymentStatus", "")}
                      className="text-emerald-800 hover:text-emerald-950 cursor-pointer"
                      title="Remove payment filter"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {params.get("from") && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                    <span>From: {new Date(params.get("from")!).toLocaleDateString()}</span>
                    <button
                      type="button"
                      onClick={() => update("from", "")}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Remove start date filter"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                {params.get("to") && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                    <span>To: {new Date(params.get("to")!).toLocaleDateString()}</span>
                    <button
                      type="button"
                      onClick={() => update("to", "")}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Remove end date filter"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer ml-auto"
                >
                  Clear all
                </Button>
              </div>
            )}

            {/* Error or Timezone and Count */}
            {dateError ? (
              <p role="alert" className="text-sm text-destructive pt-1">{dateError}</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <Clock3 className="size-3.5" aria-hidden="true" />
                  Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
                {data?.pagination && (
                  <p className="font-medium text-foreground">
                    Showing {data.shipments.length} of {data.pagination.total} {data.pagination.total === 1 ? "parcel" : "parcels"}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {query.error && (
        <ErrorNotice
          title="Check the list filters"
          action={
            <Button variant="outline" onClick={clear}>
              Reset filters
            </Button>
          }
        >
          {query.error}
        </ErrorNotice>
      )}

      {!!error && (
        <ErrorNotice
          title="Could not load shipments"
          action={
            <Button variant="outline" onClick={reload} disabled={delay > 0}>
              {delay ? `Retry in ${delay}s` : "Try again"}
            </Button>
          }
        >
          {errorMessage(error)}
        </ErrorNotice>
      )}

      {refreshing && <ResourceRefresh />}
      {loading && <ResourceSkeleton variant="list" label="Loading shipments…" />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption={recent ? "Recent shipments" : "Your shipments"}
              columns={columns}
              rows={data.shipments}
              rowKey={(shipment) => shipment.id}
              empty={
                <EmptyState
                  title={
                    data.pagination.total > 0
                      ? "No shipments on this page"
                      : filtered
                      ? "No matching shipments"
                      : "Your first shipment starts here"
                  }
                  description={
                    data.pagination.total > 0
                      ? "Return to the first page to see available records."
                      : filtered
                      ? "Try another search or clear your filters."
                      : "Book a shipment to start following its journey."
                  }
                  action={
                    data.pagination.total > 0 ? (
                      <Button variant="outline" onClick={() => update("page", "1")}>
                        Go to first page
                      </Button>
                    ) : filtered ? (
                      <Button variant="outline" onClick={clear}>
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
            {!recent && (
              <Pagination
                meta={data.pagination}
                onPageSizeChange={(size) => update("limit", String(size))}
                busy={loading}
                onPageChange={(page) => update("page", String(page))}
              />
            )}
            {recent && (
              <div className="mt-6">
                <Button asChild variant="outline">
                  <Link href="/customer/shipments">View all shipments</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
