import { z } from "zod";
import type { PaginationMeta, PaymentStatus, ShipmentStatus } from "@/types/api";

export const shipmentStatuses = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED", "CANCELLED"] as const;
export const paymentStatuses = ["PENDING", "PAID", "FAILED", "REFUND_PENDING", "REFUNDED"] as const;
export const pickupFields = z.object({
  pickupContactName: z.string().trim().min(2).max(100),
  pickupContactPhone: z.string().trim().min(5).max(30),
  pickupAddress: z.string().trim().min(5).max(500),
});
export const deliveryFields = z.object({
  deliveryContactName: z.string().trim().min(2).max(100),
  deliveryContactPhone: z.string().trim().min(5).max(30),
  deliveryAddress: z.string().trim().min(5).max(500),
});
export const parcelFields = z.object({
  parcelWeightKg: z.number().positive().max(9999999.999).multipleOf(0.001),
  packageDescription: z.string().trim().min(1).max(1000).optional(),
  pickupScheduledAt: z.iso.datetime({ offset: true }).refine(value => Date.parse(value) > Date.now(), "Pickup must be scheduled in the future").optional(),
});
export const bookingSchema = z.object({ ...pickupFields.shape, ...deliveryFields.shape, ...parcelFields.shape }).strict().superRefine((value, context) => {
  const result = parcelFields.safeParse(value);
  if (!result.success) for (const issue of result.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export type BookingInput = z.infer<typeof bookingSchema>;
export type BookingDraft = Record<keyof BookingInput, string>;
export const emptyDraft: BookingDraft = { pickupContactName: "", pickupContactPhone: "", pickupAddress: "", deliveryContactName: "", deliveryContactPhone: "", deliveryAddress: "", parcelWeightKg: "", packageDescription: "", pickupScheduledAt: "" };

/** Convert a browser-local datetime to an explicit UTC ISO timestamp. Reject normalized invalid dates. */
export function localToISO(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid local date and time");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || toLocalInput(date.toISOString()) !== value) throw new Error("This local date/time does not exist. Choose another time.");
  return date.toISOString();
}
export function toLocalInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function bookingPayload(draft: BookingDraft) {
  return {
    pickupContactName: draft.pickupContactName, pickupContactPhone: draft.pickupContactPhone, pickupAddress: draft.pickupAddress,
    deliveryContactName: draft.deliveryContactName, deliveryContactPhone: draft.deliveryContactPhone, deliveryAddress: draft.deliveryAddress,
    parcelWeightKg: draft.parcelWeightKg.trim() ? Number(draft.parcelWeightKg) : NaN,
    ...(draft.packageDescription.trim() ? { packageDescription: draft.packageDescription } : {}),
    ...(draft.pickupScheduledAt ? { pickupScheduledAt: localToISO(draft.pickupScheduledAt) } : {}),
  };
}
// Keep browser strings in form state; validate the transformed API payload per step.
export function bookingFormSchema(step = 3) {
  return z.object({
    pickupContactName: z.string(), pickupContactPhone: z.string(), pickupAddress: z.string(),
    deliveryContactName: z.string(), deliveryContactPhone: z.string(), deliveryAddress: z.string(),
    parcelWeightKg: z.string(), packageDescription: z.string(), pickupScheduledAt: z.string(),
  }).superRefine((draft, context) => {
    let payload;
    try { payload = step < 2 ? draft : bookingPayload(draft); }
    catch (error) {
      context.addIssue({ code: "custom", path: ["pickupScheduledAt"], message: error instanceof Error ? error.message : "Invalid date" });
      return;
    }
    const schema = step === 0 ? pickupFields : step === 1 ? deliveryFields : step === 2 ? parcelFields : bookingSchema;
    const result = schema.safeParse(payload);
    if (!result.success) for (const issue of result.error.issues) {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });
}

export interface Shipment extends Omit<BookingInput, "parcelWeightKg" | "parcelLengthCm" | "parcelWidthCm" | "parcelHeightCm" | "packageDescription" | "pickupScheduledAt"> {
  id: string; trackingNumber: string; status: ShipmentStatus; paymentStatus: PaymentStatus;
  customerId: string; courierId: string | null;
  price: string; currency: string; createdAt: string; updatedAt: string;
  parcelWeightKg: string; parcelLengthCm: string | null; parcelWidthCm: string | null; parcelHeightCm: string | null;
  packageDescription: string | null; pickupScheduledAt: string | null; deliveredAt: string | null;
}
export interface ShipmentEvent {
  id: string; type: string; fromStatus: ShipmentStatus | null; toStatus: ShipmentStatus | null;
  publicNote: string | null; internalNote?: string | null; actorId?: string | null; occurredAt: string;
}
export type ShipmentDetail = Shipment & { events: ShipmentEvent[] };

export const shipmentTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  CREATED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  FAILED: ["IN_TRANSIT", "RETURNED"],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

export function getAllowedTransitions(status: ShipmentStatus, role: string): ShipmentStatus[] {
  const allowed = shipmentTransitions[status] ?? [];
  if (role === "CUSTOMER") {
    return status === "CREATED" ? ["CANCELLED"] : [];
  }
  if (role === "COURIER") {
    return allowed.filter(s => s !== "CANCELLED" && status !== "FAILED");
  }
  return allowed;
}

export function isNoteRequired(targetStatus: ShipmentStatus): boolean {
  return ["DELIVERED", "FAILED", "RETURNED"].includes(targetStatus);
}

export function isCourierAssignable(status: ShipmentStatus): boolean {
  return ["CREATED", "FAILED"].includes(status);
}

export function validateTransitionReadiness(
  shipment: Pick<Shipment, "status" | "paymentStatus" | "courierId">,
  targetStatus: ShipmentStatus,
  role: string,
): { eligible: boolean; reason?: string } {
  const allowed = getAllowedTransitions(shipment.status, role);
  if (!allowed.includes(targetStatus)) {
    return { eligible: false, reason: `Transition to ${statusLabel(targetStatus)} is not allowed from ${statusLabel(shipment.status)}.` };
  }
  if (!["CANCELLED", "RETURNED"].includes(targetStatus)) {
    if (shipment.paymentStatus !== "PAID") {
      return { eligible: false, reason: "Confirmed payment is required before pickup or delivery." };
    }
    if (!shipment.courierId) {
      return { eligible: false, reason: "An active assigned Courier is required before pickup or delivery." };
    }
  }
  return { eligible: true };
}
export type ShipmentList = { shipments: Shipment[]; pagination: PaginationMeta };
const pageNumber = (max: number, fallback: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max)).default(fallback);
export const shipmentQuerySchema = z.object({
  page: pageNumber(1000000, 1), limit: pageNumber(100, 20),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(shipmentStatuses).optional(), paymentStatus: z.enum(paymentStatuses).optional(),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "price"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine(value => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), { message: "From must be no later than To", path: ["from"] });
export function readShipmentQuery(params: URLSearchParams) {
  // Validate duplicate keys instead of silently choosing an arbitrary value.
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in raw) throw new Error(`Remove the repeated ${key} filter.`);
    raw[key] = value;
  }
  const result = shipmentQuerySchema.safeParse(raw);
  if (!result.success) throw new Error(result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  return result.data;
}
export const statusLabel = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
// Preserve server decimal strings rather than recomputing money with floating point.
export const money = (amount: string, currency: string) => `${currency} ${amount}`;
export const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
