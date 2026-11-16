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
