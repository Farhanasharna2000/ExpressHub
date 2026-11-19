import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError, GoogleGenAI, type GenerateContentParameters, type ThinkingLevel } from "@google/genai";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError, RateLimitError } from "@/lib/http/errors";
import prisma from "@/lib/prisma";
import { limitApiRequests } from "@/lib/rate-limit";
import { rateLimitDiagnostics } from "@/lib/rate-limit-diagnostics";
import type { AiConfig } from "@/services/ai/config";
import { claudeFallbackParams, runAssistant, type AssistantBaseDeps } from "@/services/ai/assistant.service";
import { draftBooking, type BookingDraftDeps, type JsonGeneration } from "@/services/ai/booking-draft.service";
import { BOOKING_DRAFT_SCHEMA } from "@/services/ai/prompts/booking";
import { OPS_BRIEF_SCHEMA } from "@/services/ai/prompts/ops-brief";
import { DISPATCH_SCHEMA } from "@/services/ai/prompts/dispatch";
import { suggestDispatch, type DispatchDeps } from "@/services/ai/dispatch-suggestions.service";
import { loadDispatchContext } from "@/services/dispatch.service";
import { DELAY_THRESHOLD_HOURS, generateOpsBrief, getCachedBrief, type OpsBriefDeps } from "@/services/ai/ops-brief.service";
import { getOperationsFacts } from "@/services/admin.service";
import { aiBusy as busy, aiUnavailable as unavailable, aiUpstream as upstream, geminiStatusError } from "@/services/ai/provider-errors";
import { runGeminiAssistant } from "@/services/ai/gemini-assistant.service";
import { answerHelpQuestion, type HelpDeps } from "@/services/ai/help.service";
import { embedTexts } from "@/services/ai/help-embeddings";
import { countHelpChunks, searchHelpByText, searchHelpByVector } from "@/services/ai/help-search";
import type { AssistantRequestInput, BookingDraftRequestInput } from "@/validators/ai";
import { listMyPayments } from "@/services/payment.service";
import { getShipment, listShipments } from "@/services/shipment.service";
import { listPaymentsSchema } from "@/validators/payment";
import { listShipmentsSchema } from "@/validators/shipment";

const AI_WINDOW_MS = 15 * 60 * 1000;
const AI_LIMITS = { "ai-assistant": 20, "ai-booking-draft": 10, "ai-ops-brief": 3, "ai-dispatch": 20 } as const;

const PROVIDER_TIMEOUT_MS = 45_000;

let anthropic: Anthropic | null = null;
function anthropicClient() {
  anthropic ??= new Anthropic({ timeout: PROVIDER_TIMEOUT_MS, maxRetries: 1 });
  return anthropic;
}

let gemini: GoogleGenAI | null = null;
function geminiClient() {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: PROVIDER_TIMEOUT_MS } });
  return gemini;
}

// Provider error messages describe the failure (bad key, unknown model, quota) and never contain the key.
function logProviderError(provider: string, status: number | string, error: unknown) {
  const detail = error instanceof Error ? error.message.slice(0, 300) : String(error);
  console.error(`Assistant provider error: ${provider} ${status}: ${detail}`);
}


export async function enforceAssistantRateLimit(actor: AuthenticatedUser, scope: keyof typeof AI_LIMITS = "ai-assistant") {
  let result;
  try {
    result = await limitApiRequests(actor.id, scope, AI_LIMITS[scope], AI_WINDOW_MS);
  } catch (error) {
    console.error("Assistant rate limit check failed", rateLimitDiagnostics(error));
    throw new AppError(503, "The assistant is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE");
  }
  if (!result.success) throw new RateLimitError(result.reset);
}

async function createMessage(params: Anthropic.Beta.MessageCreateParamsNonStreaming) {
  try {
    return await anthropicClient().beta.messages.create(params);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      logProviderError("anthropic", error.status ?? "connection", error);
      if (error instanceof Anthropic.RateLimitError) throw busy();
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw unavailable();
      throw upstream();
    }
    throw error;
  }
}

async function generateContent(params: GenerateContentParameters) {
  try {
    return await geminiClient().models.generateContent(params);
  } catch (error) {
    if (error instanceof GeminiApiError) {
      logProviderError("gemini", error.status, error);
      throw geminiStatusError(error.status, error.message);
    }
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      logProviderError("gemini", "timeout", error);
      throw upstream();
    }
    throw error;
  }
}

function baseDeps(config: AiConfig): AssistantBaseDeps {
  return {
    model: config.model,
    tools: {
      async findShipments(actor, filter) {
        const input = listShipmentsSchema.parse({ limit: "10", q: filter.query, status: filter.status });
        return (await listShipments(actor, input)).shipments;
      },
      getShipment,
      async listShipmentPayments(actor, shipmentId) {
        const input = listPaymentsSchema.parse({ limit: "20", shipmentId });
        return (await listMyPayments(actor, input)).payments;
      },
    },
    audit: (actor, record) => writeAiAudit(actor, "AI_ASSISTANT_QUERY", record),
  };
}

async function writeAiAudit(actor: AuthenticatedUser, action: string, details: object) {
  await prisma.auditLog.create({
    data: { actorId: actor.id, entityType: "USER", entityId: actor.id, action, details: JSON.parse(JSON.stringify(details)) },
  });
}

type JsonRequest = { system: string; user: string; schema: Record<string, unknown> };

async function claudeJson(model: string, request: JsonRequest): Promise<JsonGeneration> {
  const response = await createMessage({
    model,
    max_tokens: 4096,
    output_config: { effort: "low", format: { type: "json_schema", schema: request.schema } },
    ...claudeFallbackParams(model),
    system: request.system,
    messages: [{ role: "user", content: request.user }],
  });
  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  return {
    text,
    refused: response.stop_reason === "refusal",
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

async function geminiJson(model: string, request: JsonRequest): Promise<JsonGeneration> {
  const response = await generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: request.user }] }],
    config: {
      systemInstruction: request.system,
      responseMimeType: "application/json",
      responseJsonSchema: request.schema,
      maxOutputTokens: 2048,
      ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel } } : {}),
    },
  });
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  // Only safety blocks count as a refusal. An empty answer for any other reason
  // (for example MAX_TOKENS) is a provider failure the customer can retry.
  const blocked = Boolean(response.promptFeedback?.blockReason)
    || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"].includes(candidate?.finishReason ?? "");
  if (!blocked && !candidate?.content) {
    logProviderError("gemini", candidate?.finishReason ?? "empty", new Error("No content in response"));
    throw upstream();
  }
  const metadata = response.usageMetadata;
  return {
    text: parts.filter((part) => part.text && !part.thought).map((part) => part.text).join(""),
    refused: blocked,
    stopReason: candidate?.finishReason ?? response.promptFeedback?.blockReason ?? null,
    usage: {
      inputTokens: metadata?.promptTokenCount ?? 0,
      outputTokens: (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0),
      cacheReadTokens: metadata?.cachedContentTokenCount ?? 0,
      cacheWriteTokens: 0,
    },
  };
}

export function configuredJson(config: AiConfig) {
  return (request: JsonRequest) => (config.provider === "gemini" ? geminiJson : claudeJson)(config.model, request);
}

export function runConfiguredBookingDraft(actor: AuthenticatedUser, input: BookingDraftRequestInput, config: AiConfig) {
  const deps: BookingDraftDeps = {
    model: config.model,
    generateJson: (request) => configuredJson(config)({ ...request, schema: BOOKING_DRAFT_SCHEMA }),
    audit: (who, details) => writeAiAudit(who, "AI_BOOKING_DRAFT", details),
  };
  return draftBooking(actor, input, deps);
}

export function runConfiguredAssistant(actor: AuthenticatedUser, input: AssistantRequestInput, config: AiConfig) {
  return config.provider === "gemini"
    ? runGeminiAssistant(actor, input, { ...baseDeps(config), generateContent })
    : runAssistant(actor, input, { ...baseDeps(config), createMessage });
}

const OPS_BRIEF_ACTION = "AI_OPS_BRIEF";

async function findCachedBrief(actor: AuthenticatedUser, dayStart: Date) {
  const row = await prisma.auditLog.findFirst({
    where: { actorId: actor.id, action: OPS_BRIEF_ACTION, createdAt: { gte: dayStart } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { details: true },
  });
  return row?.details ?? null;
}

// The day's brief is stored in the admin's AI_OPS_BRIEF audit record, which doubles as
// the per-admin, per-day cache. It holds figures and tracking numbers, no personal data.
function opsBriefDeps(config: AiConfig): OpsBriefDeps {
  return {
    model: config.model,
    loadFacts: (actor, now, day) => getOperationsFacts(actor, now, day, DELAY_THRESHOLD_HOURS),
    findCached: findCachedBrief,
    beforeGenerate: (actor) => enforceAssistantRateLimit(actor, "ai-ops-brief"),
    generateJson: (request) => configuredJson(config)({ ...request, schema: OPS_BRIEF_SCHEMA }),
    save: (actor, record) => writeAiAudit(actor, OPS_BRIEF_ACTION, record),
    auditFailure: (actor, details) => writeAiAudit(actor, "AI_OPS_BRIEF_FAILED", details),
  };
}

export function readConfiguredOpsBrief(actor: AuthenticatedUser, config: AiConfig) {
  return getCachedBrief(actor, opsBriefDeps(config));
}

export function runConfiguredOpsBrief(actor: AuthenticatedUser, options: { refresh: boolean }, config: AiConfig) {
  return generateOpsBrief(actor, options, opsBriefDeps(config));
}

// Public help questions across every visitor, so one abuser cannot run up the AI bill.
const HELP_DAILY_CAP = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function enforceHelpDailyCap() {
  let result;
  try {
    result = await limitApiRequests("global", "ai-help:daily", HELP_DAILY_CAP, DAY_MS);
  } catch (error) {
    console.error("Help rate limit check failed", rateLimitDiagnostics(error));
    throw new AppError(503, "The help assistant is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE");
  }
  if (!result.success) throw new RateLimitError(result.reset);
}

// Embeddings always come from Gemini, whichever provider writes the answers.
async function embedQuery(text: string) {
  try {
    const [embedding] = await embedTexts(geminiClient(), [text], "RETRIEVAL_QUERY");
    return embedding;
  } catch (error) {
    if (error instanceof GeminiApiError) {
      logProviderError("gemini-embedding", error.status, error);
      throw geminiStatusError(error.status, error.message);
    }
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      logProviderError("gemini-embedding", "timeout", error);
      throw upstream();
    }
    throw error;
  }
}

let helpChunkCount: { value: number; at: number } | null = null;
const HELP_COUNT_TTL_MS = 60_000;

// Help is offered only when AI is on, embeddings can be made and the articles are indexed.
export async function helpAvailable(config: AiConfig) {
  if (!config.enabled || !process.env.GEMINI_API_KEY?.trim()) return false;
  if (!helpChunkCount || Date.now() - helpChunkCount.at > HELP_COUNT_TTL_MS) {
    try {
      helpChunkCount = { value: await countHelpChunks(prisma), at: Date.now() };
    } catch (error) {
      console.error("Help chunk count failed", error instanceof Error ? error.message : error);
      return false;
    }
  }
  return helpChunkCount.value > 0;
}

export function helpDeps(config: AiConfig): HelpDeps {
  return {
    model: config.model,
    embedQuery,
    searchVector: (embedding, limit) => searchHelpByVector(prisma, embedding, limit),
    searchText: (question, limit) => searchHelpByText(prisma, question, limit),
    generateJson: (request) => configuredJson(config)(request),
    // Help questions come from anonymous visitors, so the record has no actor.
    audit: async (details) => {
      await prisma.auditLog.create({
        data: { actorId: null, entityType: "USER", entityId: "help-chat", action: "AI_HELP_QUERY", details: JSON.parse(JSON.stringify(details)) },
      });
    },
  };
}

export function runConfiguredHelp(question: string, config: AiConfig) {
  return answerHelpQuestion(question, helpDeps(config));
}

// Dispatch suggestions run with rules only when AI is disabled. The model sees courier
// labels and figures, never names; audit rows record labels, not people.
export function runConfiguredDispatch(actor: AuthenticatedUser, shipmentId: string, config: AiConfig) {
  const deps: DispatchDeps = {
    model: config.enabled ? config.model : null,
    loadContext: (who, id) => loadDispatchContext(who, id),
    beforeGenerate: (who) => enforceAssistantRateLimit(who, "ai-dispatch"),
    generateJson: (request) => configuredJson(config)({ ...request, schema: DISPATCH_SCHEMA }),
    audit: (who, details) => writeAiAudit(who, "AI_DISPATCH_SUGGESTION", details),
    auditFailure: (who, details) => writeAiAudit(who, "AI_DISPATCH_SUGGESTION_FAILED", details),
  };
  return suggestDispatch(actor, shipmentId, deps);
}
