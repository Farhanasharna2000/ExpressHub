"use client";
import { ResourceSkeleton, ResourceRefresh } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  RotateCcw,
  ShieldCheck,
  User,
  ArrowRight,
  UserCheck,
  UserX,
  SlidersHorizontal,
  Users,
  Shield,
  ArrowUpDown,
  X,
  Layers,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { CurrentUser, UserRole } from "@/types/api";
import { readUserQuery, type UserListResponse } from "./contracts";
import { dateTime } from "@/features/shipments/contracts";
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

function RoleBadge({ role }: { role: UserRole }) {
  const color =
    role === "ADMIN"
      ? "bg-violet-50 text-violet-800 border-violet-200"
      : role === "COURIER"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-blue-50 text-blue-800 border-blue-200";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {role}
    </span>
  );
}

function StatusIndicator({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
      <UserCheck className="size-3" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md border">
      <UserX className="size-3" /> Inactive
    </span>
  );
}

const columns: Column<CurrentUser>[] = [
  {
    key: "name",
    label: "User",
    render: (u) => (
      <div>
        <Link
          className="font-semibold text-primary hover:underline block"
          href={`/admin/users/${encodeURIComponent(u.id)}`}
        >
          {u.name}
        </Link>
        <span className="text-xs text-muted-foreground">{u.email}</span>
      </div>
    ),
  },
  {
    key: "role",
    label: "Role",
    render: (u) => <RoleBadge role={u.role} />,
  },
  {
    key: "status",
    label: "Account Status",
    render: (u) => <StatusIndicator active={u.isActive} />,
  },
  {
    key: "phone",
    label: "Phone",
    render: (u) => (
      <span className="text-xs text-muted-foreground">
        {u.phone || "Not provided"}
      </span>
    ),
  },
  {
    key: "date",
    label: "Joined",
    render: (u) => (
      <time dateTime={u.createdAt} className="text-xs text-muted-foreground">
        {dateTime(u.createdAt)}
      </time>
    ),
  },
  {
    key: "action",
    label: "Management",
    render: (u) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/users/${encodeURIComponent(u.id)}`}>
          Manage <ArrowRight className="size-3 ml-1" />
        </Link>
      </Button>
    ),
  },
];

export function AdminUsersListView() {
  const params = useSearchParams();
  const serialized = params.toString();

  const query = useMemo(() => {
    try {
      return { value: readUserQuery(new URLSearchParams(serialized)), error: "" };
    } catch (err) {
      return {
        value: null,
        error: err instanceof Error ? err.message : "Invalid filter parameters",
      };
    }
  }, [serialized]);

  const { data, loading, refreshing, error, reload } = useResource<UserListResponse>(
    query.value ? `/users${queryString(query.value)}` : null
  );
  const delay = useRetryDelay(error);

  const [search, setSearch] = useState(params.get("q") ?? "");
  const urlSearch = params.get("q") ?? "";

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.set("page", "1");
    const href = `/admin/users${next.size ? `?${next}` : ""}`;
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
    window.history.pushState(null, "", "/admin/users");
  }

  const isDateSort = (params.get("sortBy") ?? "createdAt") === "createdAt";
  const filtered = Boolean(
    query.value &&
      [
        query.value.q,
        query.value.role,
        query.value.isActive,
        params.get("sortBy") && params.get("sortBy") !== "createdAt",
        params.get("order") && (isDateSort ? params.get("order") !== "desc" : params.get("order") !== "asc"),
      ].some(Boolean)
  );

  const quickRolePresets = [
    { label: "All Users", role: "", status: "", dotColor: "bg-muted-foreground" },
    { label: "Customers", role: "CUSTOMER", status: "", dotColor: "bg-blue-500" },
    { label: "Couriers", role: "COURIER", status: "", dotColor: "bg-emerald-500" },
    { label: "Admins", role: "ADMIN", status: "", dotColor: "bg-violet-500" },
    { label: "Active only", role: "", status: "true", dotColor: "bg-emerald-600" },
    { label: "Inactive only", role: "", status: "false", dotColor: "bg-rose-500" },
  ];

  function applyRolePreset(role: string, status: string) {
    const next = new URLSearchParams(window.location.search);
    if (role) next.set("role", role);
    else next.delete("role");
    if (status) next.set("isActive", status);
    else next.delete("isActive");
    next.set("page", "1");
    const href = `/admin/users${next.size ? `?${next}` : ""}`;
    window.history.pushState(null, "", href);
  }

  const activeCount = [
    Boolean(search.trim()),
    Boolean(params.get("role")),
    Boolean(params.get("isActive")),
    Boolean(params.get("sortBy") && params.get("sortBy") !== "createdAt"),
    Boolean(params.get("order") && params.get("order") !== "desc"),
  ].filter(Boolean).length;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">User Directory</p>
          <h1>User Management</h1>
          <p>Inspect customer, courier, and administrator accounts across the system.</p>
        </div>
      </div>

      <Card className="shipment-filter-panel gap-0 overflow-hidden py-0 shadow-sm border border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-5 py-4 sm:px-6 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <Users className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Filter Users
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {activeCount} {activeCount === 1 ? "filter" : "filters"} applied
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    Live account directory
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inspect customer, courier, and administrator accounts across the system.
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

        {/* Quick Role & Status Pill Bar */}
        <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 min-w-max">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Layers className="size-3 text-muted-foreground" /> Role:
            </span>
            {quickRolePresets.map((preset) => {
              const currentRole = params.get("role") ?? "";
              const currentStatus = params.get("isActive") ?? "";
              const isActive = currentRole === preset.role && currentStatus === preset.status;

              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyRolePreset(preset.role, preset.status)}
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
          {/* Primary Filter Grid: Search, Role, Status */}
          <div className="shipment-filter-primary">
            <div className="relative min-w-0">
              <Input
                id="user-search"
                label="Search users"
                placeholder="Name, email, phone number..."
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
              id="user-role"
              label="Role"
              value={params.get("role") ?? ""}
              onChange={(e) => update("role", e.target.value)}
            >
              <option value="">All roles</option>
              <option value="CUSTOMER">Customer</option>
              <option value="COURIER">Courier</option>
              <option value="ADMIN">Admin</option>
            </Select>

            <Select
              id="user-status"
              label="Account status"
              value={params.get("isActive") ?? ""}
              onChange={(e) => update("isActive", e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </Select>
          </div>

          {/* Secondary Row: Sorting & Quick Sort Presets */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="sm:col-span-1">
                <Select
                  id="user-sort-by"
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
                      window.history.pushState(null, "", `/admin/users?${next}`);
                    } else {
                      update("sortBy", nextSort);
                    }
                  }}
                >
                  <option value="createdAt">Joined Date</option>
                  <option value="name">Full Name</option>
                  <option value="email">Email Address</option>
                </Select>
              </div>

              <div className="sm:col-span-1">
                <Select
                  id="user-sort-order"
                  label="Display order"
                  value={params.get("order") ?? ((params.get("sortBy") ?? "createdAt") === "createdAt" ? "desc" : "asc")}
                  onChange={(e) => update("order", e.target.value)}
                >
                  {(params.get("sortBy") ?? "createdAt") === "createdAt" ? (
                    <>
                      <option value="desc">Newest first (Recently joined)</option>
                      <option value="asc">Oldest first (Earliest joined)</option>
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
                      update("sortBy", "name");
                      update("order", "asc");
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md border border-input font-medium transition-colors cursor-pointer ${
                      params.get("sortBy") === "name" && params.get("order") === "asc"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    Name A–Z
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
              {query.value?.role && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <User className="size-3" />
                  <span>Role: {query.value.role}</span>
                  <button
                    type="button"
                    onClick={() => update("role", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove role filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {query.value?.isActive && (
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
                  query.value.isActive === "true"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}>
                  {query.value.isActive === "true" ? (
                    <UserCheck className="size-3" />
                  ) : (
                    <UserX className="size-3" />
                  )}
                  <span>Status: {query.value.isActive === "true" ? "Active" : "Inactive"}</span>
                  <button
                    type="button"
                    onClick={() => update("isActive", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title="Remove status filter"
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
                      (params.get("sortBy") ?? "createdAt") === "name"
                        ? `Name (${(params.get("order") ?? "asc") === "desc" ? "Z to A" : "A to Z"})`
                        : (params.get("sortBy") ?? "createdAt") === "email"
                          ? `Email (${(params.get("order") ?? "asc") === "desc" ? "Z to A" : "A to Z"})`
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
                Showing {data.users.length} of {data.pagination.total} registered users
              </span>
            )}
          </div>
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
          title="Could not load users"
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
      {loading && <ResourceSkeleton variant="list" label="Loading users directory…" />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption="User directory"
              columns={columns}
              rows={data.users}
              rowKey={(u) => u.id}
              empty={
                <EmptyState
                  title={
                    data.pagination.total > 0
                      ? "No users on this page"
                      : filtered
                        ? "No matching users"
                        : "No users registered"
                  }
                  description={
                    data.pagination.total > 0
                      ? "Return to the first page to view users."
                      : filtered
                        ? "Try adjusting search terms or resetting filters."
                        : "There are currently no registered users in the database."
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
