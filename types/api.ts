/** Browser-safe contract primitives. Keep server/Prisma imports out of this module. */
export type UserRole = "CUSTOMER" | "COURIER" | "ADMIN";
export type ShipmentStatus = "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "RETURNED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUND_PENDING" | "REFUNDED";
export interface PaginationMeta { page: number; limit: number; total: number; totalPages: number }
export type ApiResponse<T> = { success: true; message: string; data: T } | { success: false; message: string; errors: unknown[] };
