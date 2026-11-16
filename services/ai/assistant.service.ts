import type Anthropic from "@anthropic-ai/sdk";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import type { AssistantRequestInput } from "@/validators/ai";
import {
  ASSISTANT_TOOLS,
  executeAssistantTool,
  shipmentSummary,
  type AssistantToolServices,
  type ShipmentRef,
} from "@/services/ai/assistant-tools";
import { ASSISTANT_PROMPT_VERSION, ASSISTANT_SYSTEM_PROMPT } from "@/services/ai/prompts/assistant";

export const ASSISTANT_ROLES = ["CUSTOMER", "COURIER"] as const;
export const MAX_MODEL_TURNS = 4;
const RECENT_SHIPMENT_COUNT = 5;
// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5-2"]);

export type AssistantToolCall = { name: string; shipmentId?: string; ok: boolean };
export type AssistantUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
export type AssistantAuditRecord = {
  model: string;
  promptVersion: string;
  stopReason: string | null;
  turns: number;
  toolCalls: AssistantToolCall[];
  usage: AssistantUsage;
};

// Shared by every provider: the read-only tools, the audit writer and the clock.
export interface AssistantBaseDeps {
  model: string;
  tools: AssistantToolServices;
  // Records metadata only: tool names, record ids and token counts, never message text.
  audit(actor: AuthenticatedUser, record: AssistantAuditRecord): Promise<void>;
  now?: () => Date;
}

export interface AssistantDeps extends AssistantBaseDeps {
  createMessage(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage>;
}

export type AssistantReply = { reply: string; toolCalls: AssistantToolCall[]; shipments: ShipmentRef[] };

export const FALLBACK_REPLY = "Sorry, I couldn't finish that answer. Please try again or open the shipment page directly.";
export const REFUSAL_REPLY = "Sorry, I can't help with that. I can answer questions about your ExpressHub shipments and payments.";

export function assertAssistantRole(actor: AuthenticatedUser) {
  if (!(ASSISTANT_ROLES as readonly string[]).includes(actor.role)) {
    throw new AppError(403, "The assistant is available to customers and couriers", "FORBIDDEN");
  }
}

export async function recordAssistantAudit(deps: AssistantBaseDeps, actor: AuthenticatedUser, record: Omit<AssistantAuditRecord, "model" | "promptVersion">) {
  await deps.audit(actor, { model: deps.model, promptVersion: ASSISTANT_PROMPT_VERSION, ...record })
    .catch((error: unknown) => console.error("Assistant audit write failed", error instanceof Error ? error.message : error));
}

export type RecentShipments = { text: string; refs: ShipmentRef[] };

// Preloading the user's newest shipments lets common questions ("where is my latest
// parcel?") be answered in one model call instead of three. It uses the same
// role-scoped service as the tools, and a failure only drops the shortcut.
export async function loadRecentShipments(deps: AssistantBaseDeps, actor: AuthenticatedUser): Promise<RecentShipments> {
  try {
    const shipments = (await deps.tools.findShipments(actor, {})).slice(0, RECENT_SHIPMENT_COUNT);
    if (shipments.length === 0) return { text: "The user has no shipments yet.", refs: [] };
    return {
      text: `The user's ${shipments.length} most recent shipments, newest first (no timelines):\n${JSON.stringify(shipments.map(shipmentSummary))}`,
      refs: shipments.map(({ id, trackingNumber }) => ({ id, trackingNumber })),
    };
  } catch (error) {
    console.error("Assistant could not preload recent shipments", error instanceof Error ? error.message : error);
    return { text: "", refs: [] };
  }
}

export function contextBlock(actor: AuthenticatedUser, now: Date, recent?: RecentShipments) {
  return [
    `Signed-in user: ${actor.name}, role ${actor.role}.`,
    `Current time: ${now.toISOString()}. Tool times are UTC; users are in Bangladesh (UTC+6).`,
    ...(recent?.text ? [recent.text] : []),
  ].join("\n");
}

// Links the shipments a reply names, matched by tracking number against records
// the user can already see (the preload and tool results).
export function referencedShipments(reply: string, known: ShipmentRef[]): ShipmentRef[] {
  const seen = new Set<string>();
  return known.filter((shipment) => {
    if (seen.has(shipment.id) || !reply.includes(shipment.trackingNumber)) return false;
    seen.add(shipment.id);
    return true;
  });
}

function replyText(message: Anthropic.Beta.BetaMessage) {
  return message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function runAssistant(
  actor: AuthenticatedUser,
  input: AssistantRequestInput,
  deps: AssistantDeps,
): Promise<AssistantReply> {
  assertAssistantRole(actor);

  const recent = await loadRecentShipments(deps, actor);
  const known: ShipmentRef[] = [...recent.refs];
  const context = contextBlock(actor, deps.now?.() ?? new Date(), recent);
  const messages: Anthropic.Beta.BetaMessageParam[] = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const toolCalls: AssistantToolCall[] = [];
  const usage: AssistantUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let reply = FALLBACK_REPLY;
  let stopReason: string | null = null;
  let turns = 0;
  const fallback = FALLBACK_MODELS.has(deps.model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};

  try {
    while (turns < MAX_MODEL_TURNS) {
      turns += 1;
      const response = await deps.createMessage({
        model: deps.model,
        max_tokens: 16000,
        output_config: { effort: "low" },
        ...fallback,
        // Tools and the stable prompt form the cached prefix. Per-user context comes after the breakpoint.
        tools: ASSISTANT_TOOLS,
        system: [
          { type: "text", text: ASSISTANT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: context },
        ],
        messages,
      });
      stopReason = response.stop_reason;
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;

      if (response.stop_reason === "refusal") {
        reply = REFUSAL_REPLY;
        break;
      }
      // Keep the full content, including thinking blocks, so the next turn stays valid.
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") {
        reply = replyText(response) || FALLBACK_REPLY;
        break;
      }

      const toolUses = response.content.filter(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
      );
      const outcomes = await Promise.all(
        toolUses.map((block) => executeAssistantTool(actor, block.name, block.input, deps.tools)),
      );
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((block, index) => {
        const outcome = outcomes[index];
        toolCalls.push({ name: block.name, shipmentId: outcome.shipmentId, ok: !outcome.isError });
        known.push(...(outcome.shipments ?? []));
        return { type: "tool_result", tool_use_id: block.id, content: outcome.content, is_error: outcome.isError };
      });
      // All results for one turn go back in a single user message.
      messages.push({ role: "user", content: results });
    }
  } finally {
    await recordAssistantAudit(deps, actor, { stopReason, turns, toolCalls, usage });
  }

  return { reply, toolCalls, shipments: referencedShipments(reply, known) };
}
