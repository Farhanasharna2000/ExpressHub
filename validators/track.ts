import { z } from "zod";

export const TRACKING_NUMBER_PATTERN = /^EH-[0-9A-F]{24}$/;

export const trackingNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(TRACKING_NUMBER_PATTERN, "Enter a tracking number like EH- followed by 24 letters and numbers");

const statuses = z.enum(["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED", "CANCELLED"]);

// Event types a member of the public may see. Courier assignment and admin
// corrections are internal and never leave the server.
export const PUBLIC_EVENT_TYPES = ["CREATED", "STATUS_CHANGED", "HUB_TRANSFER", "DELIVERY_ATTEMPT", "CUSTOMER_CANCELLED"] as const;

// Strict on purpose: anything not listed here (names, phones, addresses, price,
// IDs, notes) makes parsing fail instead of reaching an anonymous caller.
export const publicTrackingEventSchema = z.strictObject({
  type: z.enum(PUBLIC_EVENT_TYPES),
  status: statuses.nullable(),
  occurredAt: z.iso.datetime(),
  hub: z.string().nullable(),
});

export const publicTrackingSchema = z.strictObject({
  trackingNumber: z.string().regex(TRACKING_NUMBER_PATTERN),
  status: statuses,
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
  events: z.array(publicTrackingEventSchema),
});

export type PublicTracking = z.infer<typeof publicTrackingSchema>;
export type PublicTrackingEvent = z.infer<typeof publicTrackingEventSchema>;
