export type { ApiKeyScope } from "@/lib/merchant/scopes";
export { API_KEY_SCOPES, MAX_ACTIVE_API_KEYS, MAX_WEBHOOK_ENDPOINTS } from "@/lib/merchant/scopes";
export { WEBHOOK_EVENTS, type WebhookEventType } from "@/validators/developer";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface WebhookEndpointSummary {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliverySummary {
  id: string;
  eventId: string;
  eventType: string;
  status: "PENDING" | "SENT" | "FAILED" | "DEAD";
  attempts: number;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export const SCOPE_LABELS: Record<string, string> = {
  "shipments:read": "Read shipments",
  "shipments:write": "Create and cancel shipments",
  "webhooks:manage": "Manage webhooks",
};

export const EVENT_LABELS: Record<string, string> = {
  "shipment.created": "Shipment created",
  "shipment.status_changed": "Status changed",
  "shipment.delivered": "Delivered",
};

export function apiKeyState(key: ApiKeySummary, now = Date.now()) {
  if (key.revokedAt) return "Revoked" as const;
  if (key.expiresAt && Date.parse(key.expiresAt) <= now) return "Expired" as const;
  return "Active" as const;
}

export function maskedKey(prefix: string) {
  return `eh_live_${prefix}_••••••••`;
}
