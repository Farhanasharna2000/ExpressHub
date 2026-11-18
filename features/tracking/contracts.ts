import { TRACKING_NUMBER_PATTERN, type PublicTracking, type PublicTrackingEvent } from "@/validators/track";

export type { PublicTracking, PublicTrackingEvent };

export const FINAL_STATUSES = new Set(["DELIVERED", "RETURNED", "CANCELLED"]);

const statusText: Record<string, string> = {
  CREATED: "Booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
  RETURNED: "Returned to sender",
  CANCELLED: "Cancelled",
};

export const trackingStatusLabel = (status: string) => statusText[status] ?? status;

export function eventTitle(event: Pick<PublicTrackingEvent, "type" | "status">) {
  if (event.type === "HUB_TRANSFER") return "Arrived at a hub";
  if (event.type === "DELIVERY_ATTEMPT") return "Delivery attempted";
  if (event.type === "CUSTOMER_CANCELLED") return "Cancelled by sender";
  return event.status ? trackingStatusLabel(event.status) : "Shipment updated";
}

// Accepts a bare tracking number or a pasted tracking link, in any letter case.
export function parseTrackingInput(value: string) {
  const match = value.toUpperCase().match(/EH-[0-9A-F]{24}/);
  return match && TRACKING_NUMBER_PATTERN.test(match[0]) ? match[0] : null;
}

export const trackingPath = (trackingNumber: string) => `/track/${encodeURIComponent(trackingNumber)}`;

// Fixed locale and timezone so the server-rendered text matches the browser's
// first render exactly (no hydration mismatch) and every visitor sees Dhaka time.
const formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
export const trackingTime = (value: string) => formatter.format(new Date(value));

// Delay before reconnecting after the stream fails: 1s, 2s, 4s … capped at 30s.
// Share of the progress line between the first and last journey steps that is filled.
export const journeyProgress = (index: number, steps: number) =>
  index <= 0 || steps < 2 ? 0 : Math.min(1, index / (steps - 1));

export const reconnectDelay = (attempt: number) => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
