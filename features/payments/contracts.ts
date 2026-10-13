import { z } from "zod";
import type { PaymentStatus, PaginationMeta } from "@/types/api";

export interface Payment {
  id: string;
  shipmentId: string;
  payerId: string;
  provider: "STRIPE" | "SSLCOMMERZ" | "BKASH";
  amount: string;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InitiatePaymentResult {
  payment: Payment;
  checkoutUrl: string | null;
}

export interface PaymentsListResponse {
  payments: Payment[];
  pagination: PaginationMeta;
}

export interface PaymentDetailResponse {
  payment: Payment;
}

export const paymentFilterSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUND_PENDING", "REFUNDED"] as const).optional(),
  shipmentId: z.string().cuid().optional(),
});

export type PaymentFilters = z.infer<typeof paymentFilterSchema>;

export function parsePaymentFilters(params: URLSearchParams): PaymentFilters {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (value !== "") raw[key] = value;
  }
  const result = paymentFilterSchema.safeParse(raw);
  return result.success ? result.data : { page: 1, limit: 10 };
}

export function money(amount: string | number, currency = "BDT"): string {
  const code = currency.toUpperCase();
  const value = String(amount);
  return `${code} ${value}`;
}

export function dateTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    return iso;
  }
}

export function statusLabel(status: PaymentStatus): string {
  switch (status) {
    case "PENDING":
      return "Pending verification";
    case "PAID":
      return "Paid";
    case "FAILED":
      return "Payment failed";
    case "REFUND_PENDING":
      return "Refund pending";
    case "REFUNDED":
      return "Refunded";
    default:
      return status;
  }
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getIdempotencyKey(shipmentId: string): string {
  if (typeof sessionStorage === "undefined") {
    return crypto.randomUUID();
  }
  const storageKey = `expresshub_idem_${shipmentId}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing && uuidRegex.test(existing)) {
      return existing;
    }
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearIdempotencyKey(shipmentId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`expresshub_idem_${shipmentId}`);
  } catch {
    // Ignore storage restrictions
  }
}

const PENDING_PAYMENT_STORAGE_KEY = "expresshub_pending_payment";

export interface PendingPaymentInfo {
  paymentId: string;
  shipmentId: string;
  checkoutUrl?: string | null;
  savedAt: number;
}

export function savePendingPayment(info: Omit<PendingPaymentInfo, "savedAt">): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: PendingPaymentInfo = {
      ...info,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage restrictions
  }
}

export function getPendingPayment(): PendingPaymentInfo | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.paymentId === "string" && typeof parsed?.shipmentId === "string") {
      return parsed as PendingPaymentInfo;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
  } catch {
    // Ignore storage restrictions
  }
}
