import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import type { JsonGeneration } from "@/services/ai/booking-draft.service";
import { DISPATCH_PROMPT_VERSION, DISPATCH_SYSTEM_PROMPT } from "@/services/ai/prompts/dispatch";
import {
  pseudonymize,
  rankCouriers,
  rulesSuggestions,
  validateAiSuggestions,
  type CourierStats,
  type DispatchShipment,
  type DispatchSuggestion,
} from "@/lib/dispatch/scoring";

export type DispatchContext = { shipment: DispatchShipment; couriers: CourierStats[] };

export type DispatchResult = {
  shipment: { id: string; trackingNumber: string };
  source: "ai" | "rules";
  model: string | null;
  // Why rule-based suggestions are shown: AI off, provider failure or rate limit.
  notice: "AI_DISABLED" | "AI_FAILED" | "AI_RATE_LIMITED" | null;
  suggestions: DispatchSuggestion[];
};

export interface DispatchDeps {
  // Null when AI is disabled: rule-based suggestions only.
  model: string | null;
  loadContext(actor: AuthenticatedUser, shipmentId: string): Promise<DispatchContext>;
  beforeGenerate(actor: AuthenticatedUser): Promise<void>;
  generateJson(request: { system: string; user: string }): Promise<JsonGeneration>;
  audit(actor: AuthenticatedUser, details: Record<string, unknown>): Promise<void>;
  auditFailure(actor: AuthenticatedUser, details: Record<string, unknown>): Promise<void>;
}

function requireAdmin(actor: AuthenticatedUser) {
  if (actor.role !== "ADMIN") throw new AppError(403, "Only admins can see dispatch suggestions", "FORBIDDEN");
}

const logged = (label: string) => (error: unknown) => console.error(label, error instanceof Error ? error.message : error);

// Ranks couriers with fixed rules, then (when AI is on) lets the model pick and explain up
// to three of the top candidates. Any AI problem falls back to the rule-based top three;
// nothing is ever assigned here, the admin confirms through the assign endpoint.
export async function suggestDispatch(actor: AuthenticatedUser, shipmentId: string, deps: DispatchDeps): Promise<DispatchResult> {
  requireAdmin(actor);
  const { shipment, couriers } = await deps.loadContext(actor, shipmentId);
  const ranked = rankCouriers(shipment, couriers);
  const base = { shipment: { id: shipment.id, trackingNumber: shipment.trackingNumber } };
  const rules = (notice: DispatchResult["notice"]): DispatchResult =>
    ({ ...base, source: "rules", model: null, notice, suggestions: rulesSuggestions(shipment, ranked) });

  if (!deps.model) return rules("AI_DISABLED");
  if (ranked.length === 0) return rules(null);

  try {
    await deps.beforeGenerate(actor);
  } catch (error) {
    // Over the limit, or the limiter itself is down: the rules still answer.
    if (error instanceof AppError) return rules(error.status === 429 ? "AI_RATE_LIMITED" : "AI_FAILED");
    throw error;
  }

  const { prompt, byLabel } = pseudonymize(shipment, ranked);
  let generation: JsonGeneration | null = null;
  try {
    generation = await deps.generateJson({
      system: DISPATCH_SYSTEM_PROMPT,
      user: `<dispatch_data>\n${JSON.stringify(prompt)}\n</dispatch_data>`,
    });
    if (generation.refused) throw new AppError(502, "Dispatch suggestion was refused", "AI_UPSTREAM_ERROR");
    let parsed: unknown;
    try {
      parsed = JSON.parse(generation.text);
    } catch {
      throw new AppError(502, "Dispatch suggestion could not be read", "AI_UPSTREAM_ERROR");
    }
    const suggestions = validateAiSuggestions(parsed, byLabel);
    if (suggestions.length === 0) throw new AppError(502, "Dispatch suggestion named no valid courier", "AI_INVALID_OUTPUT");
    const chosen = suggestions.map((suggestion) => [...byLabel].find(([, candidate]) => candidate.courierId === suggestion.courierId)?.[0]);
    await deps.audit(actor, {
      shipmentId: shipment.id,
      model: deps.model,
      promptVersion: DISPATCH_PROMPT_VERSION,
      candidateLabels: [...byLabel.keys()],
      chosenLabels: chosen,
      usage: generation.usage,
      stopReason: generation.stopReason,
    }).catch(logged("Dispatch suggestion audit failed"));
    return { ...base, source: "ai", model: deps.model, notice: null, suggestions };
  } catch (error) {
    await deps.auditFailure(actor, {
      shipmentId: shipment.id,
      model: deps.model,
      promptVersion: DISPATCH_PROMPT_VERSION,
      stopReason: generation?.stopReason ?? null,
      usage: generation?.usage ?? null,
      code: error instanceof AppError ? error.code : "UNEXPECTED",
    }).catch(logged("Dispatch suggestion failure audit failed"));
    return rules("AI_FAILED");
  }
}
