import { TRACKING_NUMBER_PATTERN, type PublicTracking, type PublicTrackingEvent } from "@/validators/track";
import type { Locale } from "@/lib/i18n/config";
import { formatClockDate, localizeDigits } from "@/lib/i18n/format";

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

// One plain sentence under the status heading, so the card explains rather than repeats it.
const statusMessages: Record<string, string> = {
  CREATED: "Booked and waiting for the courier to collect it.",
  PICKED_UP: "The courier has collected the parcel.",
  IN_TRANSIT: "The parcel is moving through our delivery network.",
  OUT_FOR_DELIVERY: "The courier is on the way to the delivery address.",
  DELIVERED: "The parcel has been delivered.",
  FAILED: "The last delivery attempt did not succeed. The courier team will arrange the next step.",
  RETURNED: "The parcel has been returned to the sender.",
  CANCELLED: "This shipment was cancelled before collection.",
};

export const trackingStatusMessage = (status: string) => statusMessages[status] ?? "";

// Updates the progress steps cannot show: hub arrivals, delivery attempts, failures and an
// earlier visit to a step that was reached again. Each step's own (latest) event and the
// booking are left out, since the steps already show them with their times.
export function additionalUpdates<T extends Pick<PublicTrackingEvent, "type" | "status">>(events: readonly T[], steps: readonly string[]) {
  const shownOnSteps = new Set<number>();
  for (const step of steps) {
    for (let index = events.length - 1; index >= 0; index--) {
      if (events[index].status === step) {
        shownOnSteps.add(index);
        break;
      }
    }
  }
  return events.filter((event, index) => event.type !== "CREATED" && !shownOnSteps.has(index));
}

// When each journey step was last reached, for the time under that step on the progress bar.
// Booking always uses the creation time; later steps use the newest event with that status,
// so a parcel sent back into transit after a failed attempt shows its latest transit time.
export function journeyStepTimes(tracking: Pick<PublicTracking, "createdAt" | "events">, steps: readonly string[]) {
  const times: Record<string, string> = {};
  for (const step of steps) {
    if (step === "CREATED") {
      times[step] = tracking.createdAt;
      continue;
    }
    const reached = tracking.events.filter((event) => event.status === step).at(-1);
    if (reached) times[step] = reached.occurredAt;
  }
  return times;
}

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
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone,
      });
    } catch {
      return formatterFor(DEFAULT_TIME_ZONE);
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

// Built from parts so every browser prints the same text: "19 Nov 2026, 5:09 PM".
function formatParts(value: string, timeZone: string, withYear: boolean) {
  const part: Record<string, string> = {};
  for (const { type, value: text } of formatterFor(timeZone).formatToParts(new Date(value))) part[type] = text;
  const date = withYear ? `${part.day} ${part.month} ${part.year}` : `${part.day} ${part.month}`;
  return `${date}, ${part.hour}:${part.minute} ${part.dayPeriod?.toUpperCase() ?? ""}`.trimEnd();
}

// Bangla uses the shared formatter (Bangla digits, month and day period) with the same layout.
export const trackingTime = (value: string, timeZone = DEFAULT_TIME_ZONE, locale: Locale = "en") =>
  locale === "bn" ? formatClockDate(value, "bn", timeZone, true) : formatParts(value, timeZone, true);

// Compact form under the progress steps ("19 Nov, 5:09 PM"); the full date is in the title.
export const trackingShortTime = (value: string, timeZone = DEFAULT_TIME_ZONE, locale: Locale = "en") =>
  locale === "bn" ? formatClockDate(value, "bn", timeZone, false) : formatParts(value, timeZone, false);

// "Asia/Dhaka, GMT+6" — the zone name plus its current offset, for the note under the history.
export function timeZoneLabel(timeZone: string, now = new Date(), locale: Locale = "en"): string {
  try {
    const offset = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return localizeDigits(offset ? `${timeZone}, ${offset}` : timeZone, locale);
  } catch {
    return timeZoneLabel(DEFAULT_TIME_ZONE, now, locale);
  }
}

// Delay before reconnecting after the stream fails: 1s, 2s, 4s … capped at 30s.
// Share of the progress line between the first and last journey steps that is filled.
export const journeyProgress = (index: number, steps: number) =>
  index <= 0 || steps < 2 ? 0 : Math.min(1, index / (steps - 1));

// The progress line spans 10% to 90% of the steps row (see .tracking-progress); the truck rides on it.
export const truckPosition = (progress: number) => `${10 + 80 * Math.min(1, Math.max(0, progress))}%`;

export const reconnectDelay = (attempt: number) => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
