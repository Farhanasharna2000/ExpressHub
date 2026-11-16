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
