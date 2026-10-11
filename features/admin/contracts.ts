import { z } from "zod";
import type { CurrentUser, PaginationMeta, PaymentStatus, ShipmentStatus, UserRole } from "@/types/api";
import { paginationFields, searchQuery, sortOrder, dateRangeFields, validDateRange, dateRangeError } from "@/validators/list-query";

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, number>;
  };
  shipments: {
    total: number;
    active: number;
    byStatus: Record<ShipmentStatus, number>;
  };
  payments: {
    total: number;
    byStatus: Record<PaymentStatus, number>;
    amounts: Array<{
      currency: string;
      status: PaymentStatus;
      count: number;
      amount: string;
    }>;
  };
}

export type AuditEntityType = "USER" | "SHIPMENT" | "PAYMENT" | "HUB" | "PRICING_RULE";

export interface AuditLog {
  id: string;
  actorId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  shipmentId: string | null;
  paymentId: string | null;
  action: string;
  details: unknown;
  createdAt: string;
}

export interface AuditLogList {
  auditLogs: AuditLog[];
  pagination: PaginationMeta;
}

export interface UserListResponse {
  users: CurrentUser[];
  pagination: PaginationMeta;
}

export const userQuerySchema = z.object({
  ...paginationFields,
  role: z.enum(["CUSTOMER", "COURIER", "ADMIN"]).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  q: searchQuery,
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  order: sortOrder,
}).strict();

export type UserQueryInput = z.infer<typeof userQuerySchema>;

export function readUserQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in raw) throw new Error(`Remove the repeated ${key} filter.`);
    raw[key] = value;
  }
  const result = userQuerySchema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}

export const auditLogQuerySchema = z.object({
  ...paginationFields,
  entityType: z.enum(["USER", "SHIPMENT", "PAYMENT", "HUB", "PRICING_RULE"]).optional(),
  entityId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  ...dateRangeFields,
  sortBy: z.enum(["createdAt", "action"]).default("createdAt"),
  order: sortOrder,
}).strict().refine(validDateRange, dateRangeError);

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;

export function readAuditLogQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in raw) throw new Error(`Remove the repeated ${key} filter.`);
    raw[key] = value;
  }
  const result = auditLogQuerySchema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return result.data;
}

export function isShipmentArchivable(status: ShipmentStatus): boolean {
  return ["DELIVERED", "RETURNED", "CANCELLED"].includes(status);
}

export function formatAuditAction(action: string): string {
  return action
    .replace(/^SHIPMENT_/, "")
    .replace(/^USER_/, "")
    .replace(/^PAYMENT_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
