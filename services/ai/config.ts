export type AiProvider = "anthropic" | "gemini";

export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-3.1-flash-lite",
};

const PROVIDER_KEYS: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export type AiConfig = { enabled: boolean; provider: AiProvider; model: string };

// AI stays off unless it is switched on explicitly and the chosen provider's key is configured.
export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const provider: AiProvider = env.AI_PROVIDER?.trim().toLowerCase() === "gemini" ? "gemini" : "anthropic";
  return {
    enabled: env.AI_ENABLED === "true" && Boolean(env[PROVIDER_KEYS[provider]]?.trim()),
    provider,
    model: env.AI_MODEL?.trim() || AI_DEFAULT_MODELS[provider],
  };
}
