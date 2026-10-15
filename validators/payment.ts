import { PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { paginationFields } from "@/validators/list-query";

export const paymentIdSchema = z.cuid();
export const initiatePaymentSchema = z.object({ shipmentId: z.cuid() }).strict();
export const paymentIdempotencySchema = z.uuid();
export const listPaymentsSchema = z.object({
  ...paginationFields,
  status: z.enum(PaymentStatus).optional(), shipmentId: z.cuid().optional(),
}).strict();
export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;

export const refundPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(1000).optional(),
}).strict();
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

