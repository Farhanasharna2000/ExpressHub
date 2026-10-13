"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  RotateCcw,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  ArrowDown,
  SlidersHorizontal,
  Package,
  CreditCard,
  Calendar,
  Clock,
  X,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

const columns: Column<Shipment>[] = [
  {
    key: "tracking",
    label: "Tracking number",
    render: (shipment) => (
      <Link
        className="font-semibold break-all text-primary hover:underline"
        href={`/admin/shipments/${encodeURIComponent(shipment.id)}`}
      >
        {shipment.trackingNumber}
      </Link>
    ),
  },
  {
    key: "route",
    label: "Pickup → Delivery",
    render: (shipment) => (
      <div className="shipment-route text-xs">
        <span title={shipment.pickupAddress} className="truncate max-w-xs block">
          From: {shipment.pickupAddress}
        </span>
        <span aria-hidden="true" className="text-muted-foreground"><ArrowDown className="inline size-4" aria-hidden="true" /></span>
        <span title={shipment.deliveryAddress} className="truncate max-w-xs block">
          To: {shipment.deliveryAddress}
        </span>
      </div>
    ),
  },
  {
    key: "courier",
    label: "Assigned Courier",
    render: (shipment) =>
      shipment.courierId ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
          <UserCheck className="size-3" />
          Assigned
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
          <ShieldAlert className="size-3" />
          Unassigned
        </span>
      ),
  },
  {
    key: "status",
    label: "Shipment status",
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
      <span className="whitespace-nowrap font-medium text-sm">
        {money(shipment.price, shipment.currency)}
      </span>
    ),
  },
  {
    key: "date",
    label: "Created",
    render: (shipment) => (
      <time dateTime={shipment.createdAt} className="text-xs text-muted-foreground">
        {dateTime(shipment.createdAt)}
      </time>
    ),
  },
  {
    key: "manage",
    label: "Operations",
    render: (shipment) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/shipments/${encodeURIComponent(shipment.id)}`}>
          Manage <ArrowRight className="size-3 ml-1" />
        </Link>
      </Button>
    ),
  },
];

export function AdminShipmentsListView() {
  const params = useSearchParams();
  const serialized = params.toString();

  const query = useMemo(() => {
    try {
      return { value: readShipmentQuery(new URLSearchParams(serialized)), error: "" };
    } catch (err) {
      return {
        value: null,
        error: err instanceof Error ? err.message : "Invalid filter parameters",
      };
    }
  }, [serialized]);

  const { data, loading, refreshing, error, reload } = useResource<ShipmentList>(
    query.value ? `/admin/shipments${queryString(query.value)}` : null
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
    const href = `/admin/shipments${next.size ? `?${next}` : ""}`;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = window.setTimeout(() => update("q", search.trim(), true), 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch]);

  function clear() {
    setSearch("");
    setDateError("");
    window.history.pushState(null, "", "/admin/shipments");
  }

  function dateFilter(key: string, value: string) {
    try {
      update(key, value ? localToISO(value) : "");
      setDateError("");
    } catch (err) {
      setDateError(err instanceof Error ? err.message : "Invalid date/time");
    }
  }

  const filtered = Boolean(
    query.value &&
      [
        query.value.q,
        query.value.status,
        query.value.paymentStatus,
        query.value.from,
        query.value.to,
      ].some(Boolean)
  );

  const quickStatusPresets = [
    { label: "All", value: "", dotColor: "bg-muted-foreground" },
    { label: "Created", value: "CREATED", dotColor: "bg-amber-500" },
    { label: "Picked Up", value: "PICKED_UP", dotColor: "bg-blue-500" },
    { label: "In Transit", value: "IN_TRANSIT", dotColor: "bg-sky-500" },
    { label: "Out for Delivery", value: "OUT_FOR_DELIVERY", dotColor: "bg-purple-500" },
    { label: "Delivered", value: "DELIVERED", dotColor: "bg-emerald-500" },
    { label: "Failed", value: "FAILED", dotColor: "bg-rose-500" },
    { label: "Cancelled", value: "CANCELLED", dotColor: "bg-gray-400" },
  ];

  const activeCount = [
    Boolean(search.trim()),
    Boolean(params.get("status")),
    Boolean(params.get("paymentStatus")),
    Boolean(params.get("from")),
    Boolean(params.get("to")),
  ].filter(Boolean).length;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations & Dispatch</p>
          <h1>Shipment Operations</h1>
          <p>Supervise network shipments, assign couriers, and manage delivery exceptions.</p>
        </div>
      </div>

      <Card className="shipment-filter-panel gap-0 overflow-hidden py-0 shadow-sm border border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <SlidersHorizontal className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Filter Operations
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    Live logistics search
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Refine active network dispatches, courier delivery statuses, and payment records.
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
                className="h-8 text-xs text-muted-foreground hover:text-destructive font-medium"
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
              <Layers className="size-3 text-muted-foreground" /> Status:
            </span>
            {quickStatusPresets.map((preset) => {
              const isActive = (params.get("status") ?? "") === preset.value;
              return (
                <button
                  key={preset.value || "all"}
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
          {/* Primary Filter Grid: Search, Status, Payment */}
          <div className="shipment-filter-primary">
            <div className="relative min-w-0">
              <Input
                id="admin-shipment-search"
                label="Search all shipments"
                placeholder="Tracking number, contact, address..."
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
              id="admin-shipment-status"
              label="Shipment status"
              value={params.get("status") ?? ""}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {shipmentStatuses.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(st)}
                </option>
              ))}
            </Select>

            <Select
              id="admin-payment-status"
              label="Payment status"
              value={params.get("paymentStatus") ?? ""}
              onChange={(e) => update("paymentStatus", e.target.value)}
            >
              <option value="">All payment statuses</option>
              {paymentStatuses.map((p) => (
                <option key={p} value={p}>
                  {statusLabel(p)}
                </option>
              ))}
            </Select>
          </div>

          {/* Secondary Row: Date Range & Quick Presets */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="sm:col-span-1">
                <Input
                  id="admin-created-from"
                  label="Created from"
                  type="datetime-local"
                  value={toLocalInput(params.get("from") ?? "")}
                  onChange={(e) => dateFilter("from", e.target.value)}
                />
              </div>
              <div className="sm:col-span-1">
                <Input
                  id="admin-created-to"
                  label="Created to"
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
                      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      update("from", past7.toISOString());
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
                      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                      update("from", past30.toISOString());
                      update("to", "");
                    }}
                    className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                  >
                    Last 30 days
                  </button>
                  {(params.has("from") || params.has("to")) && (
                    <button
                      type="button"
                      onClick={() => {
                        update("from", "");
                        update("to", "");
                      }}
                      className="text-xs px-2 py-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    >
                      Clear dates
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Active Filter Chips */}
          {filtered && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
              <span className="text-xs font-semibold text-muted-foreground mr-1">
                Active filters:
              </span>
              {query.value?.q && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <Search className="size-3 text-muted-foreground" />
                  <span>Search: &ldquo;{query.value.q}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      update("q", "", true);
                    }}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove search filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.status && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <Package className="size-3" />
                  <span>Status: {statusLabel(query.value.status)}</span>
                  <button
                    type="button"
                    onClick={() => update("status", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove status filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.paymentStatus && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                  <CreditCard className="size-3" />
                  <span>Payment: {statusLabel(query.value.paymentStatus)}</span>
                  <button
                    type="button"
                    onClick={() => update("paymentStatus", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove payment filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.from && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <Calendar className="size-3 text-muted-foreground" />
                  <span>From: {dateTime(query.value.from)}</span>
                  <button
                    type="button"
                    onClick={() => update("from", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove from date filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.to && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <Calendar className="size-3 text-muted-foreground" />
                  <span>To: {dateTime(query.value.to)}</span>
                  <button
                    type="button"
                    onClick={() => update("to", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove to date filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Footer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
            {data && (
              <span className="font-medium text-foreground">
                Showing {data.shipments.length} of {data.pagination.total} operational shipments
              </span>
            )}
          </div>

          {dateError && <p role="alert" className="text-destructive text-sm font-medium">{dateError}</p>}
        </CardContent>
      </Card>

      {query.error && (
        <ErrorNotice
          title="Filter error"
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
          title="Could not load operations list"
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
      {loading && <ResourceSkeleton variant="list" label="Loading operational shipments…" />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption="Operational shipments"
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
                        : "No shipments in network"
                  }
                  description={
                    data.pagination.total > 0
                      ? "Return to the first page to view available records."
                      : filtered
                        ? "Adjust your search terms or reset the filters."
                        : "There are currently no shipments registered in the logistics network."
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
                    ) : undefined
                  }
                />
              }
            />
            <Pagination
              meta={data.pagination} onPageSizeChange={size => update("limit", String(size))} busy={loading}
              onPageChange={(page) => update("page", String(page))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
