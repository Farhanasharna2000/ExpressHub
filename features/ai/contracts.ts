export const MAX_ASSISTANT_INPUT = 2000;
const MAX_REPLY_LENGTH = 8000;
const MAX_HISTORY = 19;

export type ShipmentLink = { id: string; trackingNumber: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; shipments?: ShipmentLink[] };
export type AssistantReply = {
  reply: string;
  toolCalls: { name: string; shipmentId?: string; ok: boolean }[];
  shipments: ShipmentLink[];
};

// The API accepts at most 20 alternating messages that start and end with the user.
// An odd-length tail of an alternating list that ends with the user starts with the user too.
export function requestHistory(messages: ChatMessage[]) {
  return messages.slice(-MAX_HISTORY).map(({ role, content }) => ({
    role,
    content: role === "assistant" ? content.slice(0, MAX_REPLY_LENGTH) : content,
  }));
}

export function greeting(name: string | undefined, role: string) {
  const first = name?.trim().split(/\s+/)[0];
  const scope = role === "COURIER" ? "your assigned deliveries" : "your shipments, tracking and payments";
  return `Hi${first ? ` ${first}` : ""}! I can check ${scope}. Ask me anything, in English or Bangla.`;
}

export function assistantSuggestions(role: string) {
  return role === "COURIER"
    ? ["Which deliveries are out for delivery?", "Show my failed deliveries", "What is my newest assignment?"]
    : ["Where is my latest parcel?", "Has my last shipment been paid?", "Why did my delivery fail?"];
}

export function followUpSuggestions(role: string) {
  return role === "COURIER"
    ? ["Show its delivery address", "Any other pending deliveries?"]
    : ["Show its tracking timeline", "Show my other shipments"];
}

export function shipmentHref(role: string, id: string) {
  const base = role === "COURIER" ? "/courier/shipments" : "/customer/shipments";
  return `${base}/${encodeURIComponent(id)}`;
}

// Progress text shown while waiting, by seconds elapsed.
export function waitingMessage(seconds: number) {
  if (seconds < 3) return "Checking your shipments…";
  if (seconds < 7) return "Reading the tracking details…";
  return "Almost done…";
}

export const BOOKING_FIELD_LABELS: Record<string, string> = {
  pickupContactName: "Pickup contact name",
  pickupContactPhone: "Pickup phone",
  pickupAddress: "Pickup address",
  deliveryContactName: "Recipient name",
  deliveryContactPhone: "Recipient phone",
  deliveryAddress: "Delivery address",
  packageDescription: "Parcel description",
  parcelWeightKg: "Weight",
  pickupScheduledAt: "Pickup time",
};

export type BookingDraftResponse = {
  draft: Partial<Record<string, string | number>>;
  filled: string[];
  missing: string[];
  note: string | null;
};

export const BOOKING_EXAMPLE = "Send a 2 kg box of books from Rina, 01700000000, House 12, Road 5, Gulshan 1, Dhaka to Rahim, 01800000000, Agrabad, Chattogram. Pickup tomorrow at 10am.";

// Turns the server draft into the string values the booking form keeps.
// The pickup time arrives as ISO with an offset and is shown in the device's timezone.
export function draftToFormValues(draft: BookingDraftResponse["draft"], toLocalInput: (iso: string) => string) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value === undefined || value === null || value === "") continue;
    values[key] = key === "pickupScheduledAt" ? toLocalInput(String(value)) : String(value);
  }
  if (values.pickupScheduledAt === "") delete values.pickupScheduledAt;
  return values;
}

export type BriefShipment = { id: string; trackingNumber: string; status: string; hoursSinceUpdate: number };

export type OpsBrief = {
  day: string;
  model: string;
  generatedAt: string;
  cached: boolean;
  brief: { headline: string; summary: string; actions: { title: string; detail: string }[]; unverified: string[] };
  facts: {
    delayThresholdHours: number;
    shipments: { total: number; active: number };
    today: { created: number; delivered: number; failed: number };
    failed: { count: number; recent: BriefShipment[] };
    delayed: { count: number; oldest: BriefShipment[] };
    unassignedPaid: { count: number; oldest: BriefShipment[] };
    payments: { pending: number };
    couriers: { active: number };
  };
};

// The figures shown beside the brief, in the order the brief prioritises them.
export function briefFigures(facts: OpsBrief["facts"]) {
  return [
    { key: "paidNoCourier", label: "Paid, no courier", value: facts.unassignedPaid.count, alert: facts.unassignedPaid.count > 0 },
    { key: "failedDeliveries", label: "Failed deliveries", value: facts.failed.count, alert: facts.failed.count > 0 },
    { key: "noUpdate", label: `No update in ${facts.delayThresholdHours}h`, value: facts.delayed.count, alert: facts.delayed.count > 0 },
    { key: "pendingPayments", label: "Pending payments", value: facts.payments.pending, alert: false },
    { key: "bookedToday", label: "Booked today", value: facts.today.created, alert: false },
    { key: "deliveredToday", label: "Delivered today", value: facts.today.delivered, alert: false },
    { key: "activeShipments", label: "Active shipments", value: facts.shipments.active, alert: false },
    { key: "activeCouriers", label: "Active couriers", value: facts.couriers.active, alert: false },
  ] as const;
}

// Shipments the admin may want to open, without repeats, most urgent group first.
export function briefShipments(facts: OpsBrief["facts"], limit = 6) {
  const seen = new Set<string>();
  const items: (BriefShipment & { reason: string })[] = [];
  const groups: [BriefShipment[], string][] = [
    [facts.unassignedPaid.oldest, "Needs a courier"],
    [facts.failed.recent, "Failed"],
    [facts.delayed.oldest, "Delayed"],
  ];
  for (const [list, reason] of groups) {
    for (const shipment of list) {
      if (seen.has(shipment.id)) continue;
      seen.add(shipment.id);
      items.push({ ...shipment, reason });
    }
  }
  return items.slice(0, limit);
}

// Today's date in Bangladesh (UTC+6), the day a brief belongs to.
export function bangladeshDate(now = new Date()) {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// The newer of the brief the page loaded and the one just generated, ignoring any brief
// from an earlier day so an open dashboard does not keep yesterday's brief after midnight.
export function latestBrief(today: string, ...briefs: (OpsBrief | null | undefined)[]) {
  return briefs.filter((brief): brief is OpsBrief => Boolean(brief) && brief?.day === today)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null;
}
