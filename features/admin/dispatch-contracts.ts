import type { PaymentStatus, ShipmentStatus } from "@/types/api";

export interface DispatchSuggestion {
  courierId: string;
  name: string;
  score: number;
  reason: string;
  factors: { openShipments: number; outForDelivery: number; hubMatch: "origin" | "destination" | "zone" | null; liveLocation: boolean };
}

export type DispatchNotice = "AI_DISABLED" | "AI_FAILED" | "AI_RATE_LIMITED" | null;

export interface DispatchResult {
  shipment: { id: string; trackingNumber: string };
  source: "ai" | "rules";
  model: string | null;
  notice: DispatchNotice;
  suggestions: DispatchSuggestion[];
}

export interface DispatchQueueItem {
  id: string;
  trackingNumber: string;
  status: ShipmentStatus;
  weightKg: number;
  waitingHours: number;
  originHub: string | null;
  destinationHub: string | null;
  suggestion: DispatchSuggestion | null;
}

export interface DispatchQueue {
  total: number;
  shipments: DispatchQueueItem[];
}

// The explanation under the suggestions, so admins know whether AI or the rules ranked them.
export function dispatchSourceNote(result: Pick<DispatchResult, "source" | "notice" | "model">) {
  if (result.source === "ai") return `Ranked by AI (${result.model}) from workload, area, live location and delivery record.`;
  if (result.notice === "AI_DISABLED") return "Rule-based suggestions: AI is not enabled.";
  if (result.notice === "AI_RATE_LIMITED") return "AI unavailable for a few minutes (limit reached), showing rule-based suggestions.";
  if (result.notice === "AI_FAILED") return "AI unavailable, showing rule-based suggestions.";
  return "Rule-based suggestions.";
}

// A shipment the assign endpoint accepts and that still needs a courier.
export function needsDispatch(shipment: { status: ShipmentStatus; paymentStatus: PaymentStatus; courierId: string | null }) {
  return shipment.paymentStatus === "PAID" && !shipment.courierId && (shipment.status === "CREATED" || shipment.status === "FAILED");
}

export const waitingLabel = (hours: number) => (hours < 1 ? "Waiting under an hour" : hours < 48 ? `Waiting ${hours}h` : `Waiting ${Math.floor(hours / 24)} days`);
