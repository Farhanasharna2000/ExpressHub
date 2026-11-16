import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError, GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError, RateLimitError } from "@/lib/http/errors";
import prisma from "@/lib/prisma";
import { limitApiRequests } from "@/lib/rate-limit";
import { rateLimitDiagnostics } from "@/lib/rate-limit-diagnostics";
import type { AiConfig } from "@/services/ai/config";
import { runAssistant, type AssistantBaseDeps } from "@/services/ai/assistant.service";
import { runGeminiAssistant } from "@/services/ai/gemini-assistant.service";
import type { AssistantRequestInput } from "@/validators/ai";
import { listMyPayments } from "@/services/payment.service";
import { getShipment, listShipments } from "@/services/shipment.service";
import { listPaymentsSchema } from "@/validators/payment";
import { listShipmentsSchema } from "@/validators/shipment";

const ASSISTANT_REQUESTS_PER_WINDOW = 20;
const ASSISTANT_WINDOW_MS = 15 * 60 * 1000;

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

const busy = () => new AppError(503, "The assistant is busy. Please try again shortly.", "AI_BUSY");
const unavailable = () => new AppError(503, "The assistant is not available", "AI_UNAVAILABLE");
const quotaExceeded = () => new AppError(503, "The assistant has reached today's free usage limit. Please try again later.", "AI_QUOTA_EXCEEDED");
const upstream = () => new AppError(502, "The assistant could not answer right now. Please try again.", "AI_UPSTREAM_ERROR");

export async function enforceAssistantRateLimit(actor: AuthenticatedUser) {
  let result;
  try {
    result = await limitApiRequests(actor.id, "ai-assistant", ASSISTANT_REQUESTS_PER_WINDOW, ASSISTANT_WINDOW_MS);
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
      if (error.status === 429) throw /per ?day/i.test(error.message) ? quotaExceeded() : busy();
      if (error.status === 401 || error.status === 403) throw unavailable();
      throw upstream();
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
    async audit(actor, record) {
      await prisma.auditLog.create({
        data: {
          actorId: actor.id,
          entityType: "USER",
          entityId: actor.id,
          action: "AI_ASSISTANT_QUERY",
          details: record,
        },
      });
    },
  };
}

export function runConfiguredAssistant(actor: AuthenticatedUser, input: AssistantRequestInput, config: AiConfig) {
  return config.provider === "gemini"
    ? runGeminiAssistant(actor, input, { ...baseDeps(config), generateContent })
    : runAssistant(actor, input, { ...baseDeps(config), createMessage });
}
