"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, RotateCcw, Package, ShieldCheck, ArrowRight, ArrowDown, SlidersHorizontal, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, StatusBadge, ResponsiveTable, EmptyState, ErrorNotice, type Column } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/interactive";
import { queryString, errorMessage } from "@/lib/client/api";
import { dateTime, localToISO, money, paymentStatuses, readShipmentQuery, shipmentStatuses, statusLabel, toLocalInput, type Shipment, type ShipmentList } from "./contracts";
import { useResource, useRetryDelay } from "./use-resource";

const columns: Column<Shipment>[] = [
  { key: "tracking", label: "Tracking number", render: shipment => <Link className="font-semibold break-all" href={`/customer/shipments/${encodeURIComponent(shipment.id)}`}>{shipment.trackingNumber}</Link> },
  { key: "route", label: "Pickup → Delivery", render: shipment => <div className="shipment-route"><span title={shipment.pickupAddress}>{shipment.pickupAddress}</span><span aria-hidden="true"><ArrowDown className="inline size-4" aria-hidden="true" /></span><span title={shipment.deliveryAddress}>{shipment.deliveryAddress}</span></div> },
  { key: "status", label: "Shipment", render: shipment => <StatusBadge status={shipment.status} /> },
  { key: "payment", label: "Payment", render: shipment => <StatusBadge status={shipment.paymentStatus} /> },
  { key: "price", label: "Price", render: shipment => <span className="whitespace-nowrap">{money(shipment.price, shipment.currency)}</span> },
  { key: "date", label: "Created", render: shipment => <time dateTime={shipment.createdAt}>{dateTime(shipment.createdAt)}</time> },
];

export function ShipmentListView({ recent = false }: { recent?: boolean }) {
  const params = useSearchParams();
  const serialized = recent ? "limit=5&sortBy=createdAt&order=desc" : params.toString();
  const query = useMemo(() => {
    try { return { value: readShipmentQuery(new URLSearchParams(serialized)), error: "" }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid filters" }; }
  }, [serialized]);
  const { data, loading, refreshing, error, reload } = useResource<ShipmentList>(query.value ? `/shipments${queryString(query.value)}` : null);
  const delay = useRetryDelay(error);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [dateError, setDateError] = useState("");
  const urlSearch = params.get("q") ?? "";

  useEffect(() => { setSearch(urlSearch); }, [urlSearch]);
  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.set("page", "1");
    const href = `/customer/shipments${next.size ? `?${next}` : ""}`;
    if (replace) window.history.replaceState(null, "", href); else window.history.pushState(null, "", href);
  }
  useEffect(() => {
    if (recent || search.trim() === urlSearch) return;
    const timer = window.setTimeout(() => update("q", search.trim(), true), 350);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, recent]);
  function clear() { setSearch(""); setDateError(""); window.history.pushState(null, "", "/customer/shipments"); }
  function dateFilter(key: string, value: string) {
    try { update(key, value ? localToISO(value) : ""); setDateError(""); }
    catch (error) { setDateError(error instanceof Error ? error.message : "Invalid date/time"); }
  }
  const filtered = Boolean(query.value && [query.value.q, query.value.status, query.value.paymentStatus, query.value.from, query.value.to].some(Boolean));

  return <div className="page-stack">
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
    <div className="page-heading"><div><p className="eyebrow">Your parcels, in one place</p><h1>{recent ? "Your deliveries, together" : "My shipments"}</h1><p>{recent ? "Your five most recent shipments. Ready for the next delivery?" : "Search, track, and manage your deliveries."}</p></div><Button asChild className="min-h-11"><Link href="/customer/shipments/new"><Plus />Book a shipment</Link></Button></div>
    {!recent && (
      <Card className="shipment-filter-panel gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <CardTitle className="flex items-center gap-3 text-base">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary"><SlidersHorizontal className="size-4" aria-hidden="true" /></span>
            Find a shipment
          </CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={clear}
            disabled={!search && !filtered && !params.has("sortBy") && !params.has("order") && !dateError && !query.error}
            className="shrink-0 text-muted-foreground hover:text-foreground">
            <RotateCcw className="size-3.5" aria-hidden="true" />Clear filters
          </Button>
        </CardHeader>
        <CardContent className="space-y-5 px-5 py-5 sm:px-6">
          <div className="shipment-filter-primary">
            <div className="relative min-w-0">
              <Input id="shipment-search" label="Search shipments" placeholder="Tracking number, name, or address" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} className="shipment-search-input" />
              <Search className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <Select id="shipment-status" label="Shipment status" value={params.get("status") ?? ""} onChange={event => update("status", event.target.value)}>
              <option value="">All statuses</option>{shipmentStatuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </Select>
            <Select id="payment-status" label="Payment status" value={params.get("paymentStatus") ?? ""} onChange={event => update("paymentStatus", event.target.value)}>
              <option value="">All payments</option>{paymentStatuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </Select>
          </div>
          <div className="shipment-filter-secondary border-t border-border/70 pt-5">
            <Input id="created-from" label="Created from" type="datetime-local" value={toLocalInput(params.get("from") ?? "")} onChange={event => dateFilter("from", event.target.value)} />
            <Input id="created-to" label="Created to" type="datetime-local" value={toLocalInput(params.get("to") ?? "")} onChange={event => dateFilter("to", event.target.value)} />

          </div>
          {dateError ? <p role="alert" className="text-sm text-destructive">{dateError}</p> : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden="true" />Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
          )}
        </CardContent>
      </Card>
    )}
    {query.error && <ErrorNotice title="Check the list filters" action={<Button variant="outline" onClick={clear}>Reset filters</Button>}>{query.error}</ErrorNotice>}
    {!!error && <ErrorNotice title="Could not load shipments" action={<Button variant="outline" onClick={reload} disabled={delay > 0}>{delay ? `Retry in ${delay}s` : "Try again"}</Button>}>{errorMessage(error)}</ErrorNotice>}
    {refreshing && <ResourceRefresh />}
    {loading && <ResourceSkeleton variant="list" label="Loading shipments…" />}
    {data && <Card><CardContent className="shipment-results"><ResponsiveTable caption={recent ? "Recent shipments" : "Your shipments"} columns={columns} rows={data.shipments} rowKey={shipment => shipment.id} empty={<EmptyState title={data.pagination.total > 0 ? "No shipments on this page" : filtered ? "No matching shipments" : "Your first shipment starts here"} description={data.pagination.total > 0 ? "Return to the first page to see available records." : filtered ? "Try another search or clear your filters." : "Book a shipment to start following its journey."} action={data.pagination.total > 0 ? <Button variant="outline" onClick={() => update("page", "1")}>Go to first page</Button> : filtered ? <Button variant="outline" onClick={clear}>Clear filters</Button> : <Button asChild><Link href="/customer/shipments/new">Book a shipment</Link></Button>} />} />{!recent && <Pagination meta={data.pagination} onPageSizeChange={size => update("limit", String(size))} busy={loading} onPageChange={page => update("page", String(page))} />}{recent && <div className="mt-6"><Button asChild variant="outline"><Link href="/customer/shipments">View all shipments</Link></Button></div>}</CardContent></Card>}
  </div>;
}
