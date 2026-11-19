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

// The server cannot know a visitor's timezone, so pages render in Dhaka time first
// and switch to the visitor's own zone after hydration (see use-time-zone.ts).
export const DEFAULT_TIME_ZONE = "Asia/Dhaka";

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone });
    } catch {
      return formatterFor(DEFAULT_TIME_ZONE);
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export const trackingTime = (value: string, timeZone = DEFAULT_TIME_ZONE) => formatterFor(timeZone).format(new Date(value));

// "Asia/Dhaka, GMT+6" — the zone name plus its current offset, for the note under the history.
export function timeZoneLabel(timeZone: string, now = new Date()) {
  try {
    const offset = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${timeZone}, ${offset}` : timeZone;
  } catch {
    return timeZoneLabel(DEFAULT_TIME_ZONE, now);
  }
}

// Delay before reconnecting after the stream fails: 1s, 2s, 4s … capped at 30s.
// Share of the progress line between the first and last journey steps that is filled.
export const journeyProgress = (index: number, steps: number) =>
  index <= 0 || steps < 2 ? 0 : Math.min(1, index / (steps - 1));

export const reconnectDelay = (attempt: number) => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
