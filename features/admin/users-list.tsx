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
import { useResource, useRetryDelay } from "@/features/shipments/use-resource";

import { useTranslations } from "next-intl";
import { useFormat, useStatusLabel } from "@/lib/i18n/use-format";
function RoleBadge({ role }: { role: UserRole }) {
  const statusLabel = useStatusLabel();
  const color =
    role === "ADMIN"
      ? "bg-violet-50 text-violet-800 border-violet-200"
      : role === "COURIER"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : "bg-blue-50 text-blue-800 border-blue-200";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {statusLabel(role)}
    </span>
  );
}

function StatusIndicator({ active }: { active: boolean }) {
  const t = useTranslations("admin.users");
  return active ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
      <UserCheck className="size-3" /> {t("active")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md border">
      <UserX className="size-3" /> {t("inactive")}
    </span>
  );
}


type ColumnT = ReturnType<typeof useTranslations<"admin.users">>;
type Format = ReturnType<typeof useFormat>;

const buildColumns = (t: ColumnT, f: Format): Column<CurrentUser>[] => [
  {
    key: "name",
    label: t("user"),
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
    label: t("role"),
    render: (u) => <RoleBadge role={u.role} />,
  },
  {
    key: "status",
    label: t("accountStatus"),
    render: (u) => <StatusIndicator active={u.isActive} />,
  },
  {
    key: "phone",
    label: t("phone"),
    render: (u) => (
      <span className="text-xs text-muted-foreground">
        {u.phone || t("notProvided")}
      </span>
    ),
  },
  {
    key: "date",
    label: t("joined"),
    render: (u) => (
      <time dateTime={u.createdAt} className="text-xs text-muted-foreground">
        {f.dateTime(u.createdAt)}
      </time>
    ),
  },
  {
    key: "action",
    label: t("management"),
    render: (u) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/users/${encodeURIComponent(u.id)}`}>
          {t("manage")} <ArrowRight className="size-3 ml-1" />
        </Link>
      </Button>
    ),
  },
];

export function AdminUsersListView() {
  const t = useTranslations("admin.users");
  const tf = useTranslations("filters");
  const f = useFormat();
  const statusLabel = useStatusLabel();
  const columns = buildColumns(t, f);
  const params = useSearchParams();
  const serialized = params.toString();

  const query = useMemo(() => {
    try {
      return { value: readUserQuery(new URLSearchParams(serialized)), error: "" };
    } catch (err) {
      return {
        value: null,
        error: err instanceof Error ? err.message : t("invalidFilterParameters"),
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
    { label: t("allUsers"), role: "", status: "", dotColor: "bg-muted-foreground" },
    { label: t("customers"), role: "CUSTOMER", status: "", dotColor: "bg-blue-500" },
    { label: t("couriers"), role: "COURIER", status: "", dotColor: "bg-emerald-500" },
    { label: t("admins"), role: "ADMIN", status: "", dotColor: "bg-violet-500" },
    { label: t("activeOnly"), role: "", status: "true", dotColor: "bg-emerald-600" },
    { label: t("inactiveOnly"), role: "", status: "false", dotColor: "bg-rose-500" },
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
          <p className="eyebrow">{t("userDirectory")}</p>
          <h1>{t("userManagement")}</h1>
          <p>{t("inspectCustomerCourierAnd")}</p>
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
                  {t("filterUsers")}
                </CardTitle>
                {activeCount > 0 ? (
                  <Badge variant="secondary" className="bg-[#e5ecdf] text-[#196547] border-[#196547]/20 font-semibold text-[11px] px-2">
                    {tf("applied", { count: activeCount })}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    {t("liveAccountDirectory")}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("inspectCustomerCourierAnd")}
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
                {t("resetFilters")}
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Quick Role & Status Pill Bar */}
        <div className="border-b border-border/60 bg-background/50 px-5 py-2.5 sm:px-6">
          <div className="quick-filter-options">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Layers className="size-3 text-muted-foreground" /> {t("roleLabel")}
            </span>
            {quickRolePresets.map((preset) => {
              const currentRole = params.get("role") ?? "";
              const currentStatus = params.get("isActive") ?? "";
              const isActive = currentRole === preset.role && currentStatus === preset.status;

              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => applyRolePreset(preset.role, preset.status)}
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
          {/* Primary Filter Grid: Search, Role, Status */}
          <div className="shipment-filter-primary">
            <div className="relative min-w-0">
              <Input
                id="user-search"
                label={t("searchUsers")}
                placeholder={t("nameEmailPhoneNumber")}
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
              id="user-role"
              label={t("role")}
              value={params.get("role") ?? ""}
              onChange={(e) => update("role", e.target.value)}
            >
              <option value="">{t("allRoles")}</option>
              <option value="CUSTOMER">{t("customer")}</option>
              <option value="COURIER">{t("courier")}</option>
              <option value="ADMIN">{t("admin")}</option>
            </Select>

            <Select
              id="user-status"
              label={t("accountStatus2")}
              value={params.get("isActive") ?? ""}
              onChange={(e) => update("isActive", e.target.value)}
            >
              <option value="">{t("allStatuses")}</option>
              <option value="true">{t("activeOnly")}</option>
              <option value="false">{t("inactiveOnly")}</option>
            </Select>
          </div>

          {/* Secondary Row: Sorting & Quick Sort Presets */}
          <div className="pt-4 border-t border-border/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="sm:col-span-1">
                <Select
                  id="user-sort-by"
                  label={t("sortBy")}
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
                  <option value="createdAt">{t("joinedDate")}</option>
                  <option value="name">{t("fullName")}</option>
                  <option value="email">{t("emailAddress")}</option>
                </Select>
              </div>

              <div className="sm:col-span-1">
                <Select
                  id="user-sort-order"
                  label={t("displayOrder")}
                  value={params.get("order") ?? ((params.get("sortBy") ?? "createdAt") === "createdAt" ? "desc" : "asc")}
                  onChange={(e) => update("order", e.target.value)}
                >
                  {(params.get("sortBy") ?? "createdAt") === "createdAt" ? (
                    <>
                      <option value="desc">{t("newestFirstRecentlyJoined")}</option>
                      <option value="asc">{t("oldestFirstEarliestJoined")}</option>
                    </>
                  ) : (
                    <>
                      <option value="asc">{t("aToZAlphabetical")}</option>
                      <option value="desc">{t("zToAReverse")}</option>
                    </>
                  )}
                </Select>
              </div>

              <div className="sm:col-span-2 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1 font-medium">{t("quickSort")}</span>
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
                    {t("newestFirst")}
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
                    {t("oldestFirst")}
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
                    {t("nameAZ")}
                  </button>
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
              {query.value?.role && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20 font-medium">
                  <User className="size-3" />
                  <span>{t("roleChip", { value: statusLabel(query.value.role) })}</span>
                  <button
                    type="button"
                    onClick={() => update("role", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removeRoleFilter")}
                    aria-label={t("removeRoleFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
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
                  <span>{tf("statusChip", { value: query.value.isActive === "true" ? t("active") : t("inactive") })}</span>
                  <button
                    type="button"
                    onClick={() => update("isActive", "")}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("removeStatusFilter")}
                    aria-label={t("removeStatusFilter")}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
              {(params.has("sortBy") || params.has("order")) && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-foreground px-2.5 py-1 rounded-full border border-border font-medium">
                  <ArrowUpDown className="size-3 text-muted-foreground" />
                  <span>
                    {t("sortChip", { value:
                      (params.get("sortBy") ?? "createdAt") === "name"
                        ? t("sortName", { order: (params.get("order") ?? "asc") === "desc" ? t("zToA") : t("aToZ") })
                        : (params.get("sortBy") ?? "createdAt") === "email"
                          ? t("sortEmail", { order: (params.get("order") ?? "asc") === "desc" ? t("zToA") : t("aToZ") })
                          : (params.get("order") === "asc" ? t("oldestFirst") : t("newestFirst")) })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      update("sortBy", "");
                      update("order", "");
                    }}
                    className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                    title={t("resetSorting")}
                    aria-label={t("resetSorting")}
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
                {t("showing", { shown: data.users.length, total: data.pagination.total })}
              </span>
            )}
          </div>
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
          title={t("couldNotLoadUsers")}
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
      {loading && <ResourceSkeleton variant="list" label={t("loadingUsersDirectory")} />}

      {data && (
        <Card>
          <CardContent className="shipment-results">
            <ResponsiveTable
              caption={t("userDirectory2")}
              columns={columns}
              rows={data.users}
              rowKey={(u) => u.id}
              empty={
                <EmptyState
                  title={
                    data.pagination.total > 0
                      ? t("noUsersOnThis")
                      : filtered
                        ? t("noMatchingUsers")
                        : t("noUsersRegistered")
                  }
                  description={
                    data.pagination.total > 0
                      ? t("returnToTheFirst")
                      : filtered
                        ? t("tryAdjustingSearchTerms")
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
