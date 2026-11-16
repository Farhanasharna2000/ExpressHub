import type { Content, FunctionCall, GenerateContentParameters, GenerateContentResponse, Part, ThinkingLevel } from "@google/genai";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import type { AssistantRequestInput } from "@/validators/ai";
import { ASSISTANT_TOOLS, executeAssistantTool, type ShipmentRef } from "@/services/ai/assistant-tools";
import {
  FALLBACK_REPLY,
  MAX_MODEL_TURNS,
  REFUSAL_REPLY,
  assertAssistantRole,
  contextBlock,
  loadRecentShipments,
  recordAssistantAudit,
  referencedShipments,
  type AssistantBaseDeps,
  type AssistantReply,
  type AssistantToolCall,
  type AssistantUsage,
} from "@/services/ai/assistant.service";
import { ASSISTANT_SYSTEM_PROMPT } from "@/services/ai/prompts/assistant";

export interface GeminiAssistantDeps extends AssistantBaseDeps {
  generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

// Gemini 3 models think by default; low thinking is enough for lookups and replies much faster.
const LOW_THINKING = "LOW" as ThinkingLevel;
const BLOCKED_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

// The same tool schemas as the Claude assistant, in Gemini's function declaration format.
// Length limits are dropped from the schema sent to Gemini; Zod still enforces them on every call.
export const GEMINI_FUNCTION_DECLARATIONS = ASSISTANT_TOOLS.map((tool) => {
  const { properties, ...schema } = tool.input_schema as { properties: Record<string, Record<string, unknown>> };
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: {
      ...schema,
      properties: Object.fromEntries(Object.entries(properties).map(([key, { maxLength: _maxLength, ...rest }]) => [key, rest])),
    },
  };
});

function toolResponse(outcome: { content: string; isError: boolean }): Record<string, unknown> {
  if (outcome.isError) return { error: outcome.content };
  return { output: JSON.parse(outcome.content) as unknown };
}

export async function runGeminiAssistant(
  actor: AuthenticatedUser,
  input: AssistantRequestInput,
  deps: GeminiAssistantDeps,
): Promise<AssistantReply> {
  assertAssistantRole(actor);

  const recent = await loadRecentShipments(deps, actor);
  const known: ShipmentRef[] = [...recent.refs];
  const contents: Content[] = input.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const toolCalls: AssistantToolCall[] = [];
  const usage: AssistantUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const systemInstruction = `${ASSISTANT_SYSTEM_PROMPT}\n\n${contextBlock(actor, deps.now?.() ?? new Date(), recent)}`;
  let reply = FALLBACK_REPLY;
  let stopReason: string | null = null;
  let turns = 0;

  try {
    while (turns < MAX_MODEL_TURNS) {
      turns += 1;
      const response = await deps.generateContent({
        model: deps.model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
          maxOutputTokens: 4096,
          ...(deps.model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: LOW_THINKING } } : {}),
        },
      });
      const metadata = response.usageMetadata;
      usage.inputTokens += metadata?.promptTokenCount ?? 0;
      usage.outputTokens += (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0);
      usage.cacheReadTokens += metadata?.cachedContentTokenCount ?? 0;

      const candidate = response.candidates?.[0];
      stopReason = candidate?.finishReason ?? response.promptFeedback?.blockReason ?? null;
      if (!candidate?.content || response.promptFeedback?.blockReason || BLOCKED_FINISH_REASONS.has(candidate.finishReason ?? "")) {
        reply = REFUSAL_REPLY;
        break;
      }

      const parts: Part[] = candidate.content.parts ?? [];
      const calls = parts.map((part) => part.functionCall).filter((call): call is FunctionCall => Boolean(call));
      if (calls.length === 0) {
        const text = parts.filter((part) => part.text && !part.thought).map((part) => part.text).join("").trim();
        reply = text || FALLBACK_REPLY;
        break;
      }

      // Replay the model turn unchanged so thought signatures stay attached to their calls.
      contents.push(candidate.content);
      const outcomes = await Promise.all(
        calls.map((call) => executeAssistantTool(actor, call.name ?? "", call.args ?? {}, deps.tools)),
      );
      // All responses for one turn go back together, matched to their calls by id and name.
      contents.push({
        role: "user",
        parts: calls.map((call, index) => {
          const outcome = outcomes[index];
          toolCalls.push({ name: call.name ?? "", shipmentId: outcome.shipmentId, ok: !outcome.isError });
          known.push(...(outcome.shipments ?? []));
          return { functionResponse: { id: call.id, name: call.name, response: toolResponse(outcome) } };
        }),
      });
    }
  } finally {
    await recordAssistantAudit(deps, actor, { stopReason, turns, toolCalls, usage });
  }

  return { reply, toolCalls, shipments: referencedShipments(reply, known) };
}
