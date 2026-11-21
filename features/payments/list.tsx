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
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/i18n/use-format";
import {
  dateTime,
  parsePaymentFilters,
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
  { key: "all", value: "", dotColor: "bg-muted-foreground" },
  { key: "PAID", value: "PAID", dotColor: "bg-emerald-500" },
  { key: "PENDING", value: "PENDING", dotColor: "bg-amber-500" },
  { key: "REFUNDED", value: "REFUNDED", dotColor: "bg-sky-500" },
  { key: "REFUND_PENDING", value: "REFUND_PENDING", dotColor: "bg-purple-500" },
  { key: "FAILED", value: "FAILED", dotColor: "bg-red-500" },
] as const;

type Label = ReturnType<typeof useTranslations<"payments.list">>;
type Format = ReturnType<typeof useFormat>;

const paymentColumns = (t: Label, f: Format, when: (iso: string) => string): Column<Payment>[] => [
  {
    key: "id",
    label: t("colId"),
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
    label: t("colShipment"),
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
    label: t("colAmount"),
    render: (payment) => (
      <span className="font-semibold whitespace-nowrap">
        {f.money(payment.amount, payment.currency)}
      </span>
    ),
  },
  {
    key: "status",
    label: t("colStatus"),
    render: (payment) => <StatusBadge status={payment.status} />,
  },
  {
    key: "date",
    label: t("colDate"),
    render: (payment) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {when(payment.paidAt || payment.createdAt)}
      </span>
    ),
  },
];

export function PaymentsListView() {
  const t = useTranslations("payments.list");
  const tp = useTranslations("payments");
  const tf = useTranslations("filters");
  const f = useFormat();
  const when = (iso: string) => (f.locale === "en" ? dateTime(iso) : f.dateTime(iso));
  const columns = paymentColumns(t, f, when);
  const statusName = (st: PaymentStatus) => tp(`statusName.${st}`);
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
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <Button
          variant="outline"
          disabled={loading || refreshing || delay > 0}
          onClick={reload}
          className="gap-2 cursor-pointer"
        >
          <RefreshCw className={loading || refreshing ? "animate-spin size-4" : "size-4"} />
          {loading ? t("updating") : t("refresh")}
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
                  {t("filterTitle")}
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {tf("applied", { count: activeCount })}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    {t("live")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("filterText")}
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
                {tf("reset")}
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Quick Payment Status Pill Bar */}
        <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6">
          <div className="quick-filter-options">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="size-3 text-muted-foreground" /> {tf("statusLabel")}
            </span>
            {quickPaymentPresets.map((preset) => {
              const isActive = (filters.status ?? "") === preset.value;
              return (
                <button
                  key={preset.key}
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
                  <span>{t(`preset.${preset.key}`)}</span>
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
                label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
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
                  title={tf("clearSearch")}
                  aria-label={tf("clearSearch")}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <Select
              id="payment-status-filter"
              label={t("statusFilter")}
              value={filters.status ?? ""}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">{t("allStatuses")}</option>
              {paymentStatuses.map((st) => (
                <option key={st} value={st}>
                  {statusName(st)}
                </option>
              ))}
            </Select>
          </div>

          {/* Active Filter Chips Bar */}
          {isFiltered && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
              <span className="text-xs font-semibold text-muted-foreground mr-1">{tf("active")}</span>

              {filters.status && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <span>{tf("statusChip", { value: statusName(filters.status) })}</span>
                  <button
                    type="button"
                    onClick={() => update("status", "")}
                    className="text-primary hover:text-primary/70 cursor-pointer"
                    title={tf("removeStatus")}
                    aria-label={tf("removeStatus")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}

              {filters.shipmentId && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border">
                  <span>{t("shipmentChip", { value: filters.shipmentId })}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShipmentSearch("");
                      update("shipmentId", "");
                    }}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                    title={t("removeShipment")}
                    aria-label={t("removeShipment")}
                  >
                    <X className="size-3" aria-hidden="true" />
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
                {tf("clearAll")}
              </Button>
            </div>
          )}

          {/* Result count */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <span>{t("verified")}</span>
            {pagination.total > 0 && (
              <span className="font-medium text-foreground">
                {t("showing", { shown: payments.length, total: pagination.total })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {refreshing && <ResourceRefresh />}
      {loading && <ResourceSkeleton variant="list" label={t("loadingLabel")} />}

      {!!error && (
        <ErrorNotice
          title={t("loadFailed")}
          action={
            <Button
              variant="outline"
              onClick={reload}
              disabled={delay > 0}
              className="mt-2"
            >
              {delay > 0 ? tf("retryIn", { seconds: f.digits(delay) }) : tf("tryAgain")}
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
              caption={t("caption")}
              columns={columns}
              rows={payments}
              rowKey={(p) => p.id}
              empty={
                <EmptyState
                  title={
                    pagination.total > 0
                      ? t("emptyPage")
                      : isFiltered
                      ? t("emptyFiltered")
                      : t("empty")
                  }
                  description={
                    pagination.total > 0
                      ? t("emptyPageText")
                      : isFiltered
                      ? t("emptyFilteredText")
                      : t("emptyText")
                  }
                  action={
                    pagination.total > 0 ? (
                      <Button variant="outline" onClick={() => update("page", "1")}>
                        {tf("goToFirstPage")}
                      </Button>
                    ) : isFiltered ? (
                      <Button variant="outline" onClick={clearFilters}>
                        {tf("clearFilters")}
                      </Button>
                    ) : (
                      <Button asChild>
                        <Link href="/customer/shipments/new">{t("book")}</Link>
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
