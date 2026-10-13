"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, RotateCcw, Truck, MapPin } from "lucide-react";
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
  readShipmentQuery,
  statusLabel,
  toLocalInput,
  type Shipment,
  type ShipmentList,
} from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

const courierStatuses = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
] as const;

const columns: Column<Shipment>[] = [
  {
    key: "tracking",
    label: "Tracking number",
    render: (shipment) => (
      <Link
        className="font-semibold break-all text-primary hover:underline"
        href={`/courier/shipments/${encodeURIComponent(shipment.id)}`}
      >
        {shipment.trackingNumber}
      </Link>
    ),
  },
  {
    key: "route",
    label: "Pickup → Delivery",
    render: (shipment) => (
      <div className="space-y-1 text-sm">
        <div className="flex items-start gap-1">
          <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="truncate max-w-xs" title={shipment.pickupAddress}>
            <strong>{shipment.pickupContactName}</strong>: {shipment.pickupAddress}
          </span>
        </div>
        <div className="flex items-start gap-1">
          <Truck className="size-3.5 text-primary shrink-0 mt-0.5" />
          <span className="truncate max-w-xs" title={shipment.deliveryAddress}>
            <strong>{shipment.deliveryContactName}</strong>: {shipment.deliveryAddress}
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "status",
    label: "Delivery status",
    render: (shipment) => <StatusBadge status={shipment.status} />,
  },
  {
    key: "payment",
    label: "Payment",
    render: (shipment) => <StatusBadge status={shipment.paymentStatus} />,
  },
  {
    key: "date",
    label: "Assigned / Created",
    render: (shipment) => (
      <time dateTime={shipment.createdAt} className="text-xs text-muted-foreground">
        {dateTime(shipment.createdAt)}
      </time>
    ),
  },
  {
    key: "action",
    label: "Action",
    render: (shipment) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/courier/shipments/${encodeURIComponent(shipment.id)}`}>
          View & Update
        </Link>
      </Button>
    ),
  },
];

export function CourierShipmentListView({ recent = false }: { recent?: boolean }) {
  const params = useSearchParams();
  const serialized = recent ? "limit=5&sortBy=createdAt&order=desc" : params.toString();

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

  // Using /shipments/my-shipments which is securely scoped to the authenticated courier
  const { data, loading, refreshing, error, reload } = useResource<ShipmentList>(
    query.value ? `/shipments/my-shipments${queryString(query.value)}` : null
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
    const href = `/courier/shipments${next.size ? `?${next}` : ""}`;
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
    window.history.pushState(null, "", "/courier/shipments");
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
      [query.value.q, query.value.status, query.value.from, query.value.to].some(Boolean)
  );

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">On the Road</p>
          <h1>{recent ? "Recent Deliveries" : "Assigned Shipments"}</h1>
          <p>
            {recent
              ? "Your most recently assigned shipments and upcoming stops."
              : "Review your delivery route, update transit states, and record proof of delivery."}
          </p>
        </div>
      </div>

      {!recent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="size-4" />
              Filter Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="shipment-filters">
              <Input
                id="courier-search"
                label="Search deliveries"
                placeholder="Tracking number, recipient, address"
                maxLength={100}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select
                id="courier-status"
                label="Delivery status"
                value={params.get("status") ?? ""}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="">All statuses</option>
                {courierStatuses.map((st) => (
                  <option key={st} value={st}>
                    {statusLabel(st)}
                  </option>
                ))}
              </Select>
              <Input
                id="created-from"
                label="Assigned from"
                type="datetime-local"
                value={toLocalInput(params.get("from") ?? "")}
                onChange={(e) => dateFilter("from", e.target.value)}
              />
              <Input
                id="created-to"
                label="Assigned to"
                type="datetime-local"
                value={toLocalInput(params.get("to") ?? "")}
                onChange={(e) => dateFilter("to", e.target.value)}
              />
              <Select
                id="sort-by"
                label="Sort by"
                value={params.get("sortBy") ?? "createdAt"}
                onChange={(e) => update("sortBy", e.target.value)}
              >
                <option value="createdAt">Assignment Date</option>
                <option value="updatedAt">Last Updated</option>
              </Select>
              <Select
                id="sort-order"
                label="Order"
                value={params.get("order") ?? "desc"}
                onChange={(e) => update("order", e.target.value)}
              >
                <option value="desc">Newest First</option>
                <option value="asc">Oldest First</option>
              </Select>

            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
              <Button variant="ghost" onClick={clear}>
                <RotateCcw className="size-4 mr-1" /> Clear filters
              </Button>
            </div>
            {dateError && <p role="alert" className="text-destructive text-sm">{dateError}</p>}
          </CardContent>
        </Card>
      )}

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
          title="Could not load assignments"
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
      {loading && <ResourceSkeleton variant="list" label="Loading assigned shipments…" />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption={recent ? "Recent deliveries" : "Assigned shipments"}
              columns={columns}
              rows={data.shipments}
              rowKey={(shipment) => shipment.id}
              empty={
                <EmptyState
                  title={
                    data.pagination.total > 0
                      ? "No shipments on this page"
                      : filtered
                        ? "No matching assignments"
                        : "No assignments yet"
                  }
                  description={
                    data.pagination.total > 0
                      ? "Return to the first page to view your assignments."
                      : filtered
                        ? "Try clearing filters to see all assigned shipments."
                        : "You currently have no assigned deliveries. Check back when an Admin assigns shipments to you."
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
            {!recent && (
              <Pagination
                meta={data.pagination} onPageSizeChange={size => update("limit", String(size))} busy={loading}
                onPageChange={(page) => update("page", String(page))}
              />
            )}
            {recent && (
              <div className="mt-6">
                <Button asChild variant="outline">
                  <Link href="/courier/shipments">View all assignments</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
