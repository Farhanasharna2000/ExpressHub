"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, RotateCcw, UserCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Input,
  Select,
  StatusBadge,
  ResponsiveTable,
  EmptyState,
  ErrorNotice,
  LoadingState,
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
        <span aria-hidden="true" className="text-muted-foreground">↓</span>
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

  const { data, loading, error, reload } = useResource<ShipmentList>(
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

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations & Dispatch</p>
          <h1>Shipment Operations</h1>
          <p>Supervise network shipments, assign couriers, and manage delivery exceptions.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Filter Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="shipment-filters">
            <Input
              id="admin-shipment-search"
              label="Search all shipments"
              placeholder="Tracking number, contact, address"
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            <Input
              id="admin-created-from"
              label="Created from"
              type="datetime-local"
              value={toLocalInput(params.get("from") ?? "")}
              onChange={(e) => dateFilter("from", e.target.value)}
            />
            <Input
              id="admin-created-to"
              label="Created to"
              type="datetime-local"
              value={toLocalInput(params.get("to") ?? "")}
              onChange={(e) => dateFilter("to", e.target.value)}
            />
            <Select
              id="admin-sort-by"
              label="Sort by"
              value={params.get("sortBy") ?? "createdAt"}
              onChange={(e) => update("sortBy", e.target.value)}
            >
              <option value="createdAt">Created Date</option>
              <option value="updatedAt">Last Updated</option>
              <option value="price">Price</option>
            </Select>
            <Select
              id="admin-sort-order"
              label="Order"
              value={params.get("order") ?? "desc"}
              onChange={(e) => update("order", e.target.value)}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </Select>
            <Select
              id="admin-page-size"
              label="Per page"
              value={params.get("limit") ?? "20"}
              onChange={(e) => update("limit", e.target.value)}
            >
              {[10, 20, 50, 100].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Device timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
            <Button variant="ghost" onClick={clear}>
              <RotateCcw className="size-4 mr-1" /> Clear filters
            </Button>
          </div>
          {dateError && <p role="alert" className="text-destructive text-sm">{dateError}</p>}
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

      {loading && <LoadingState label="Loading operational shipments…" />}

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
              meta={data.pagination}
              onPageChange={(page) => update("page", String(page))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
