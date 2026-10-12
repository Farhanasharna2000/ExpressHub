"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, RotateCcw, ShieldCheck, User, ArrowRight, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const { data, loading, error, reload } = useResource<UserListResponse>(
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

  const filtered = Boolean(
    query.value && [query.value.q, query.value.role, query.value.isActive].some(Boolean)
  );

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">User Directory</p>
          <h1>User Management</h1>
          <p>Inspect customer, courier, and administrator accounts across the system.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Filter Users
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="shipment-filters">
            <Input
              id="user-search"
              label="Search users"
              placeholder="Name, email, phone"
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            <Select
              id="user-sort-by"
              label="Sort by"
              value={params.get("sortBy") ?? "createdAt"}
              onChange={(e) => update("sortBy", e.target.value)}
            >
              <option value="createdAt">Joined Date</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </Select>
            <Select
              id="user-sort-order"
              label="Order"
              value={params.get("order") ?? "desc"}
              onChange={(e) => update("order", e.target.value)}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </Select>

          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="ghost" onClick={clear}>
              <RotateCcw className="size-4 mr-1" /> Clear filters
            </Button>
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

      {loading && <LoadingState label="Loading users directory…" />}

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
