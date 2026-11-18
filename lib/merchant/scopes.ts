export const API_KEY_SCOPES = ["shipments:read", "shipments:write", "webhooks:manage"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export const MAX_ACTIVE_API_KEYS = 10;
export const MAX_WEBHOOK_ENDPOINTS = 5;
export const MAX_WEBHOOK_URL_LENGTH = 2048;
