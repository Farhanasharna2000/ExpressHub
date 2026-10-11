"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Search, RotateCcw, ExternalLink, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Input,
  Select,
  ResponsiveTable,
  EmptyState,
  ErrorNotice,
  LoadingState,
  type Column,
} from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/interactive";
import { queryString, errorMessage } from "@/lib/client/api";
import { dateTime, localToISO, toLocalInput } from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";
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

  const { data, loading, error, reload } = useResource<AuditLogList>(
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

  const filtered = Boolean(
    query.value &&
      [
        query.value.action,
        query.value.entityType,
        query.value.entityId,
        query.value.from,
        query.value.to,
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Filter Audit Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="shipment-filters">
            <Input
              id="audit-action-search"
              label="Action name"
              placeholder="e.g. STATUS_UPDATED, CREATED"
              maxLength={100}
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
            />
            <Select
              id="audit-entity-type"
              label="Entity type"
              value={params.get("entityType") ?? ""}
              onChange={(e) => update("entityType", e.target.value)}
            >
              <option value="">All entity types</option>
              <option value="SHIPMENT">Shipment</option>
              <option value="USER">User</option>
              <option value="PAYMENT">Payment</option>
              <option value="PRICING_RULE">Pricing Rule</option>
            </Select>
            <Input
              id="audit-entity-id"
              label="Entity ID"
              placeholder="Specific CUID"
              value={params.get("entityId") ?? ""}
              onChange={(e) => update("entityId", e.target.value.trim())}
            />
            <Input
              id="audit-created-from"
              label="Recorded from"
              type="datetime-local"
              value={toLocalInput(params.get("from") ?? "")}
              onChange={(e) => dateFilter("from", e.target.value)}
            />
            <Input
              id="audit-created-to"
              label="Recorded to"
              type="datetime-local"
              value={toLocalInput(params.get("to") ?? "")}
              onChange={(e) => dateFilter("to", e.target.value)}
            />
            <Select
              id="audit-page-size"
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
              Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
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

      {loading && <LoadingState label="Loading audit trail records…" />}

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
              meta={data.pagination}
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
