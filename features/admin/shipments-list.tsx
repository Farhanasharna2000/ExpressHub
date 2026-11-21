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
  localToISO,
  paymentStatuses,
  readShipmentQuery,
  shipmentStatuses,
  toLocalInput,
  type Shipment,
  type ShipmentList,
} from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

import { useTranslations } from "next-intl";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";

type ColumnT = ReturnType<typeof useTranslations<"admin.shipments">>;
type Format = ReturnType<typeof useFormat>;

const buildColumns = (t: ColumnT, f: Format): Column<Shipment>[] => [
  {
    key: "tracking",
    label: t("trackingNumber"),
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
    label: t("pickupDelivery"),
    render: (shipment) => (
      <div className="shipment-route text-xs">
        <span title={shipment.pickupAddress} className="truncate max-w-xs block">
          {t("fromAddress", { address: shipment.pickupAddress })}
        </span>
        <span aria-hidden="true" className="text-muted-foreground"><ArrowDown className="inline size-4" aria-hidden="true" /></span>
        <span title={shipment.deliveryAddress} className="truncate max-w-xs block">
          {t("toAddress", { address: shipment.deliveryAddress })}
        </span>
      </div>
    ),
  },
  {
    key: "courier",
    label: t("assignedCourier"),
    render: (shipment) =>
      shipment.courierId ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
          <UserCheck className="size-3" />
          {t("assigned")}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
          <ShieldAlert className="size-3" />
          {t("unassigned")}
        </span>
      ),
  },
  {
    key: "status",
    label: t("shipmentStatus"),
    render: (shipment) => <StatusBadge status={shipment.status} />,
  },
  {
    key: "payment",
    label: t("payment"),
    render: (shipment) => <StatusBadge status={shipment.paymentStatus} />,
  },
  {
    key: "price",
    label: t("price"),
    render: (shipment) => (
      <span className="whitespace-nowrap font-medium text-sm">
        {f.money(shipment.price, shipment.currency)}
      </span>
    ),
  },
  {
    key: "date",
    label: t("created"),
    render: (shipment) => (
      <time dateTime={shipment.createdAt} className="text-xs text-muted-foreground">
        {f.dateTime(shipment.createdAt)}
      </time>
    ),
  },
  {
    key: "manage",
    label: t("operations"),
    render: (shipment) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/shipments/${encodeURIComponent(shipment.id)}`}>
          {t("manage")} <ArrowRight className="size-3 ml-1" />
        </Link>
      </Button>
    ),
  },
];

export function AdminShipmentsListView() {
  const t = useTranslations("admin.shipments");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
  const columns = buildColumns(t, f);
  const params = useSearchParams();
  const serialized = params.toString();

  const query = useMemo(() => {
    try {
      return { value: readShipmentQuery(new URLSearchParams(serialized)), error: "" };
    } catch (err) {
      return {
        value: null,
        error: err instanceof Error ? err.message : t("invalidFilterParameters"),
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

  // Several keys can change in one call so a preset adds a single history entry.
  function update(key: string | Record<string, string>, value = "", replace = false) {
    const changes = typeof key === "string" ? { [key]: value } : key;
    const next = new URLSearchParams(window.location.search);
    for (const [name, nextValue] of Object.entries(changes)) {
      if (nextValue) next.set(name, nextValue);
      else next.delete(name);
    }
    if (!("page" in changes)) next.set("page", "1");
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
      setDateError(err instanceof Error ? err.message : t("invalidDateTime"));
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
    { label: t("all"), value: "", dotColor: "bg-muted-foreground" },
    { label: t("created"), value: "CREATED", dotColor: "bg-amber-500" },
    { label: t("pickedUp"), value: "PICKED_UP", dotColor: "bg-blue-500" },
    { label: t("inTransit"), value: "IN_TRANSIT", dotColor: "bg-sky-500" },
    { label: t("outForDelivery"), value: "OUT_FOR_DELIVERY", dotColor: "bg-purple-500" },
    { label: t("delivered"), value: "DELIVERED", dotColor: "bg-emerald-500" },
    { label: t("failed"), value: "FAILED", dotColor: "bg-rose-500" },
    { label: t("cancelled"), value: "CANCELLED", dotColor: "bg-gray-400" },
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
          <p className="eyebrow">{t("operationsDispatch")}</p>
          <h1>{t("shipmentOperations")}</h1>
          <p>{t("superviseNetworkShipmentsAssign")}</p>
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
                  {t("filterOperations")}
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {tf("applied", { count: activeCount })}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    {t("liveLogisticsSearch")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("refineActiveNetworkDispatches")}
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
                {t("resetFilters")}
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Quick Status Pill Bar */}
        <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6">
          <div className="quick-filter-options">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Layers className="size-3 text-muted-foreground" /> {tf("statusLabel")}
            </span>
            {quickStatusPresets.map((preset) => {
              const isActive = (params.get("status") ?? "") === preset.value;
              return (
                <button
                  key={preset.value || "all"}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => update("status", preset.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#196547] text-white shadow-xs font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
                  }`}
                >
                  <span
                    aria-hidden="true"
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
                label={t("searchAllShipments")}
                placeholder={t("trackingNumberContactAddress")}
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
                  title={t("clearSearch")}
                  aria-label={t("clearSearch")}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <Select
              id="admin-shipment-status"
              label={t("shipmentStatus")}
              value={params.get("status") ?? ""}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">{t("allStatuses")}</option>
              {shipmentStatuses.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(st)}
                </option>
              ))}
            </Select>

            <Select
              id="admin-payment-status"
              label={t("paymentStatus")}
              value={params.get("paymentStatus") ?? ""}
              onChange={(e) => update("paymentStatus", e.target.value)}
            >
              <option value="">{t("allPaymentStatuses")}</option>
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
                  label={t("createdFrom")}
                  type="datetime-local"
                  value={toLocalInput(params.get("from") ?? "")}
                  onChange={(e) => dateFilter("from", e.target.value)}
                />
              </div>
              <div className="sm:col-span-1">
                <Input
                  id="admin-created-to"
                  label={t("createdTo")}
                  type="datetime-local"
                  value={toLocalInput(params.get("to") ?? "")}
                  onChange={(e) => dateFilter("to", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1 font-medium">{t("quickDates")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                      update({ from: startOfDay.toISOString(), to: "" });
                    }}
                    className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                  >
                    {t("today")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      update({ from: past7.toISOString(), to: "" });
                    }}
                    className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                  >
                    {t("last7Days")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                      update({ from: past30.toISOString(), to: "" });
                    }}
                    className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-muted font-medium transition-colors cursor-pointer"
                  >
                    {t("last30Days")}
                  </button>
                  {(params.has("from") || params.has("to")) && (
                    <button
                      type="button"
                      onClick={() => {
                        update({ from: "", to: "" });
                      }}
                      className="text-xs px-2 py-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    >
                      {t("clearDates")}
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
                {tf("active")}
              </span>
              {query.value?.q && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <Search className="size-3 text-muted-foreground" />
                  <span>{tf("searchChip", { value: query.value.q })}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      update("q", "", true);
                    }}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removeSearchFilter")}
                    aria-label={t("removeSearchFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {query.value?.status && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <Package className="size-3" />
                  <span>{tf("statusChip", { value: statusLabel(query.value.status) })}</span>
                  <button
                    type="button"
                    onClick={() => update("status", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removeStatusFilter")}
                    aria-label={t("removeStatusFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {query.value?.paymentStatus && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                  <CreditCard className="size-3" />
                  <span>{tf("paymentChip", { value: statusLabel(query.value.paymentStatus) })}</span>
                  <button
                    type="button"
                    onClick={() => update("paymentStatus", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removePaymentFilter")}
                    aria-label={t("removePaymentFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {query.value?.from && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <Calendar className="size-3 text-muted-foreground" />
                  <span>{tf("fromChip", { value: f.dateTime(query.value.from) })}</span>
                  <button
                    type="button"
                    onClick={() => update("from", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removeFromDateFilter")}
                    aria-label={t("removeFromDateFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {query.value?.to && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <Calendar className="size-3 text-muted-foreground" />
                  <span>{tf("toChip", { value: f.dateTime(query.value.to) })}</span>
                  <button
                    type="button"
                    onClick={() => update("to", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removeToDateFilter")}
                    aria-label={t("removeToDateFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Footer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {tf("timezone", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
            </p>
            {data && (
              <span className="font-medium text-foreground">
                {t("showing", { shown: data.shipments.length, total: data.pagination.total })}
              </span>
            )}
          </div>

          {dateError && <p role="alert" className="text-destructive text-sm font-medium">{dateError}</p>}
        </CardContent>
      </Card>

      {query.error && (
        <ErrorNotice
          title={t("filterError")}
          action={
            <Button variant="outline" onClick={clear}>
              {t("resetFilters")}
            </Button>
          }
        >
          {query.error}
        </ErrorNotice>
      )}

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
      {loading && <ResourceSkeleton variant="list" label={t("loadingOperationalShipments")} />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption={t("operationalShipments")}
              columns={columns}
              rows={data.shipments}
              rowKey={(shipment) => shipment.id}
              empty={
                <EmptyState
                  title={
                    data.pagination.total > 0
                      ? t("noShipmentsOnThis")
                      : filtered
                        ? t("noMatchingShipments")
                        : t("noShipmentsInNetwork")
                  }
                  description={
                    data.pagination.total > 0
                      ? t("returnToTheFirst")
                      : filtered
                        ? t("adjustYourSearchTerms")
                        : t("thereAreCurrentlyNo")
                  }
                  action={
                    data.pagination.total > 0 ? (
                      <Button variant="outline" onClick={() => update("page", "1")}>
                        {t("goToFirstPage")}
                      </Button>
                    ) : filtered ? (
                      <Button variant="outline" onClick={clear}>
                        {t("clearFilters")}
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
