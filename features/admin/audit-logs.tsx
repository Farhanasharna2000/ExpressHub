"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  History,
  Search,
  RotateCcw,
  ExternalLink,
  Code2,
  SlidersHorizontal,
  Layers,
  Calendar,
  Clock,
  X,
  ArrowUpDown,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Input,
  Select,
  ResponsiveTable,
  EmptyState,
  ErrorNotice,
  type Column,
} from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/interactive";
import { queryString, errorMessage } from "@/lib/client/api";
import { dateTime, localToISO, toLocalInput } from "@/features/shipments/contracts";
import { useResource, useRetryDelay, type ResourceResult } from "@/features/shipments/use-resource";
import {
  formatAuditAction,
  readAuditLogQuery,
  type AuditEntityType,
  type AuditLog,
  type AuditLogList,
} from "./contracts";

function EntityBadge({ type }: { type: AuditEntityType }) {
  const color =
    type === "SHIPMENT"
      ? "bg-blue-50 text-blue-800 border-blue-200"
      : type === "USER"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : type === "PAYMENT"
          ? "bg-purple-50 text-purple-800 border-purple-200"
          : "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {type}
    </span>
  );
}

export function AdminAuditLogsView() {
  const params = useSearchParams();
  const serialized = params.toString();

  const query = useMemo(() => {
    try {
      return { value: readAuditLogQuery(new URLSearchParams(serialized)), error: "" };
    } catch (err) {
      return {
        value: null,
        error: err instanceof Error ? err.message : "Invalid filter parameters",
      };
    }
  }, [serialized]);

  const { data, loading, refreshing, error, reload }: ResourceResult<AuditLogList> = useResource<AuditLogList>(
    query.value ? `/admin/audit-logs${queryString(query.value)}` : null
  );
  const delay = useRetryDelay(error);

  const [actionSearch, setActionSearch] = useState(params.get("action") ?? "");
  const [dateError, setDateError] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const urlAction = params.get("action") ?? "";
  useEffect(() => {
    setActionSearch(urlAction);
  }, [urlAction]);

  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    const href = `/admin/audit-logs${next.size ? `?${next}` : ""}`;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }

  useEffect(() => {
    if (actionSearch.trim() === urlAction) return;
    const timer = window.setTimeout(() => update("action", actionSearch.trim(), true), 350);
    return () => window.clearTimeout(timer);
  }, [actionSearch, urlAction]);

  function clear() {
    setActionSearch("");
    setDateError("");
    window.history.pushState(null, "", "/admin/audit-logs");
  }

  function dateFilter(key: string, value: string) {
    try {
      update(key, value ? localToISO(value) : "");
      setDateError("");
    } catch (err) {
      setDateError(err instanceof Error ? err.message : "Invalid date/time");
    }
  }

  const columns: Column<AuditLog>[] = [
    {
      key: "time",
      label: "Timestamp",
      render: (log) => (
        <time dateTime={log.createdAt} className="text-xs text-muted-foreground block">
          {dateTime(log.createdAt)}
        </time>
      ),
    },
    {
      key: "action",
      label: "Action",
      render: (log) => (
        <div>
          <span className="font-semibold text-sm block">
            {formatAuditAction(log.action)}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {log.action}
          </span>
        </div>
      ),
    },
    {
      key: "entity",
      label: "Target Entity",
      render: (log) => (
        <div className="space-y-1">
          <EntityBadge type={log.entityType} />
          <div className="text-xs font-mono">
            {log.entityType === "SHIPMENT" ? (
              <Link
                href={`/admin/shipments/${encodeURIComponent(log.entityId)}`}
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                {log.entityId.slice(0, 12)}… <ExternalLink className="size-3" />
              </Link>
            ) : log.entityType === "USER" ? (
              <Link
                href={`/admin/users/${encodeURIComponent(log.entityId)}`}
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                {log.entityId.slice(0, 12)}… <ExternalLink className="size-3" />
              </Link>
            ) : (
              <span className="text-muted-foreground">{log.entityId.slice(0, 12)}…</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "actor",
      label: "Actor ID",
      render: (log) => (
        <span className="text-xs font-mono text-muted-foreground" title={log.actorId ?? "System"}>
          {log.actorId ? log.actorId.slice(0, 14) + "…" : "System (Internal)"}
        </span>
      ),
    },
    {
      key: "details",
      label: "Payload Details",
      render: (log) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedLog(log)}
          className="text-xs h-8"
        >
          <Code2 className="size-3.5 mr-1" />
          Inspect Details
        </Button>
      ),
    },
  ];

  const isDateSort = (params.get("sortBy") ?? "createdAt") === "createdAt";

  const quickEntityPresets = [
    { label: "All Records", value: "", dotColor: "bg-muted-foreground" },
    { label: "Shipments", value: "SHIPMENT", dotColor: "bg-blue-500" },
    { label: "Users", value: "USER", dotColor: "bg-emerald-500" },
    { label: "Payments", value: "PAYMENT", dotColor: "bg-purple-500" },
    { label: "Rates & Pricing", value: "PRICING_RULE", dotColor: "bg-amber-500" },
    { label: "Hubs & Stations", value: "HUB", dotColor: "bg-sky-500" },
  ];

  const activeCount = [
    Boolean(actionSearch.trim()),
    Boolean(params.get("entityType")),
    Boolean(params.get("entityId")),
    Boolean(params.get("from")),
    Boolean(params.get("to")),
    Boolean(params.get("sortBy") && params.get("sortBy") !== "createdAt"),
    Boolean(params.get("order") && (isDateSort ? params.get("order") !== "desc" : params.get("order") !== "asc")),
  ].filter(Boolean).length;

  const filtered = Boolean(
    query.value &&
      [
        query.value.action,
        query.value.entityType,
        query.value.entityId,
        query.value.from,
        query.value.to,
        params.get("sortBy") && params.get("sortBy") !== "createdAt",
        params.get("order") && (isDateSort ? params.get("order") !== "desc" : params.get("order") !== "asc"),
      ].some(Boolean)
  );

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Immutable Audit Trail</p>
          <h1>Audit Logs</h1>
          <p>Complete traceability of operational changes, role grants, delivery transitions, and soft deletions.</p>
        </div>
      </div>

      <Card className="shipment-filter-panel gap-0 overflow-hidden py-0 shadow-sm border border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <History className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Filter Audit Ledger
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    Live immutable ledger
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Trace operational mutations, courier status changes, and access events across entities.
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

        {/* Quick Entity Type Pill Bar */}
        <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 min-w-max">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Layers className="size-3 text-muted-foreground" /> Entity:
            </span>
            {quickEntityPresets.map((preset) => {
              const isActive = (params.get("entityType") ?? "") === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => update("entityType", preset.value)}
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
          {/* Primary Filter Grid: Action Search, Entity Type, Entity ID */}
          <div className="shipment-filter-primary">
            <div className="relative min-w-0">
              <Input
                id="audit-action-search"
                label="Action name"
                placeholder="Search activity (e.g. Status changed, Login)..."
                maxLength={100}
                value={actionSearch}
                onChange={(e) => setActionSearch(e.target.value)}
                className="shipment-search-input pr-8"
              />
              <Search className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden="true" />
              {actionSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setActionSearch("");
                    update("action", "", true);
                  }}
                  className="absolute bottom-3.5 right-3 size-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Select
              id="audit-entity-type"
              label="Category"
              value={params.get("entityType") ?? ""}
              onChange={(e) => update("entityType", e.target.value)}
            >
              <option value="">All categories</option>
              <option value="SHIPMENT">Shipment</option>
              <option value="USER">User</option>
              <option value="PAYMENT">Payment</option>
              <option value="PRICING_RULE">Rates & Pricing</option>
              <option value="HUB">Delivery Hubs</option>
            </Select>

            <Input
              id="audit-entity-id"
              label="Record or tracking ID"
              placeholder="Enter reference or ID"
              value={params.get("entityId") ?? ""}
              onChange={(e) => update("entityId", e.target.value.trim())}
            />
          </div>

          {/* Secondary Row: Date Range & Quick Presets */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="sm:col-span-1">
                <Input
                  id="audit-created-from"
                  label="Recorded from"
                  type="datetime-local"
                  value={toLocalInput(params.get("from") ?? "")}
                  onChange={(e) => dateFilter("from", e.target.value)}
                />
              </div>

              <div className="sm:col-span-1">
                <Input
                  id="audit-created-to"
                  label="Recorded to"
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

          {/* Third Row: Display Order / Sorting */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="sm:col-span-1">
                <Select
                  id="audit-sort-by"
                  label="Sort by"
                  value={params.get("sortBy") ?? "createdAt"}
                  onChange={(e) => {
                    const nextSort = e.target.value;
                    const prevSort = params.get("sortBy") ?? "createdAt";
                    if (nextSort !== "createdAt" && prevSort === "createdAt" && !params.has("order")) {
                      const next = new URLSearchParams(window.location.search);
                      next.set("sortBy", nextSort);
                      next.set("order", "asc");
                      next.set("page", "1");
                      window.history.pushState(null, "", `/admin/audit-logs?${next}`);
                    } else {
                      update("sortBy", nextSort);
                    }
                  }}
                >
                  <option value="createdAt">Recorded Date</option>
                  <option value="action">Action Name</option>
                </Select>
              </div>

              <div className="sm:col-span-1">
                <Select
                  id="audit-sort-order"
                  label="Display order"
                  value={params.get("order") ?? (isDateSort ? "desc" : "asc")}
                  onChange={(e) => update("order", e.target.value)}
                >
                  {isDateSort ? (
                    <>
                      <option value="desc">Newest first (Most recent)</option>
                      <option value="asc">Oldest first (Earliest recorded)</option>
                    </>
                  ) : (
                    <>
                      <option value="asc">A to Z (Alphabetical)</option>
                      <option value="desc">Z to A (Reverse alphabetical)</option>
                    </>
                  )}
                </Select>
              </div>

              <div className="sm:col-span-2 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1 font-medium">Quick sort:</span>
                  <button
                    type="button"
                    onClick={() => {
                      update("sortBy", "createdAt");
                      update("order", "desc");
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md border border-input font-medium transition-colors cursor-pointer ${
                      (params.get("sortBy") ?? "createdAt") === "createdAt" && (params.get("order") ?? "desc") === "desc"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    Newest first
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update("sortBy", "createdAt");
                      update("order", "asc");
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md border border-input font-medium transition-colors cursor-pointer ${
                      params.get("sortBy") === "createdAt" && params.get("order") === "asc"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    Oldest first
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update("sortBy", "action");
                      update("order", "asc");
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md border border-input font-medium transition-colors cursor-pointer ${
                      params.get("sortBy") === "action" && params.get("order") === "asc"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    Action A–Z
                  </button>
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
              {query.value?.action && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border font-medium">
                  <Search className="size-3 text-muted-foreground" />
                  <span>Action: &ldquo;{query.value.action}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActionSearch("");
                      update("action", "", true);
                    }}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove action filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.entityType && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <Layers className="size-3" />
                  <span>Entity: {query.value.entityType}</span>
                  <button
                    type="button"
                    onClick={() => update("entityType", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove entity type filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.entityId && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border font-medium">
                  <FileText className="size-3 text-muted-foreground" />
                  <span>ID: {query.value.entityId}</span>
                  <button
                    type="button"
                    onClick={() => update("entityId", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove entity ID filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.from && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border font-medium">
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
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border font-medium">
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
              {(params.has("sortBy") || params.has("order")) && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border font-medium">
                  <ArrowUpDown className="size-3 text-muted-foreground" />
                  <span>
                    Sort: {
                      (params.get("sortBy") ?? "createdAt") === "action"
                        ? `Action (${(params.get("order") ?? "asc") === "desc" ? "Z to A" : "A to Z"})`
                        : (params.get("order") === "asc" ? "Oldest first" : "Newest first")
                    }
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      update("sortBy", "");
                      update("order", "");
                    }}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Reset sorting"
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
                Showing {data.auditLogs.length} of {data.pagination.total} audit trail events
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
          title="Could not load audit trail"
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
      {loading && <ResourceSkeleton variant="list" label="Loading audit trail records…" />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption="Audit trail"
              columns={columns}
              rows={data.auditLogs}
              rowKey={(log) => log.id}
              empty={
                <EmptyState
                  title={
                    data.pagination.total > 0
                      ? "No records on this page"
                      : filtered
                        ? "No matching audit entries"
                        : "No audit records found"
                  }
                  description={
                    data.pagination.total > 0
                      ? "Return to the first page to view entries."
                      : filtered
                        ? "Try resetting the filters."
                        : "No system events have been recorded yet."
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

      {/* Details JSON Inspector Dialog */}
      <Dialog open={selectedLog !== null} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5" />
              Audit Log Details
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.action} ({selectedLog?.entityType}: {selectedLog?.entityId})
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-lg border bg-muted/20">
                <div>
                  <span className="text-muted-foreground block">Event ID:</span>
                  <span className="font-mono">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Actor ID:</span>
                  <span className="font-mono">{selectedLog.actorId || "System"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Recorded At:</span>
                  <span>{dateTime(selectedLog.createdAt)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Entity Target:</span>
                  <span className="font-mono">{selectedLog.entityType} ({selectedLog.entityId})</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold block mb-1">State Mutation Payload:</span>
                <pre className="p-3 rounded-lg bg-neutral-950 text-neutral-100 font-mono text-xs overflow-x-auto max-h-80 border">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setSelectedLog(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
