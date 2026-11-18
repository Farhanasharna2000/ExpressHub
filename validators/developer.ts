import { z } from "zod";
import { API_KEY_SCOPES, MAX_WEBHOOK_URL_LENGTH } from "@/lib/merchant/scopes";
import { paginationFields } from "@/validators/list-query";

export const WEBHOOK_EVENTS = ["shipment.created", "shipment.status_changed", "shipment.delivered"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export const developerIdSchema = z.cuid();

const uniqueList = <T extends string>(values: readonly [T, ...T[]], label: string) =>
  z.array(z.enum(values)).min(1, `Choose at least one ${label}`)
    .refine((items) => new Set(items).size === items.length, `Each ${label} may only be listed once`);

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: uniqueList(API_KEY_SCOPES, "scope"),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable().default(null),
}).strict();

const webhookUrl = z.string().trim().min(1).max(MAX_WEBHOOK_URL_LENGTH);
const description = z.string().trim().max(200).optional();

export const createWebhookSchema = z.object({
  url: webhookUrl,
  description,
  events: uniqueList(WEBHOOK_EVENTS, "event"),
}).strict();

export const updateWebhookSchema = z.object({
  url: webhookUrl.optional(),
  description: z.string().trim().max(200).nullable().optional(),
  events: uniqueList(WEBHOOK_EVENTS, "event").optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const listDeliveriesSchema = z.object({
  ...paginationFields,
  status: z.enum(["PENDING", "SENT", "FAILED", "DEAD"]).optional(),
}).strict();

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type ListDeliveriesInput = z.infer<typeof listDeliveriesSchema>;
