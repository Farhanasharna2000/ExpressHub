import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/errors";
import type { JsonGeneration } from "@/services/ai/booking-draft.service";
import { MAX_BRIEF_ACTIONS, OPS_BRIEF_PROMPT_VERSION, OPS_BRIEF_SYSTEM_PROMPT } from "@/services/ai/prompts/ops-brief";

const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DELAY_THRESHOLD_HOURS = 48;

const shipmentRef = z.object({
  id: z.string(),
  trackingNumber: z.string(),
  status: z.string(),
  hoursSinceUpdate: z.number().int().nonnegative(),
});

// The figures a brief is built from. Shipment examples carry no names, phones or addresses.
export const opsFactsSchema = z.object({
  day: z.string(),
  delayThresholdHours: z.number(),
  shipments: z.object({
    total: z.number().int(),
    active: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  }),
  today: z.object({ created: z.number().int(), delivered: z.number().int(), failed: z.number().int() }),
  failed: z.object({ count: z.number().int(), recent: z.array(shipmentRef) }),
  delayed: z.object({ count: z.number().int(), oldest: z.array(shipmentRef) }),
  unassignedPaid: z.object({ count: z.number().int(), oldest: z.array(shipmentRef) }),
  payments: z.object({ pending: z.number().int(), paid: z.number().int(), failed: z.number().int() }),
  couriers: z.object({ active: z.number().int() }),
});

export type OpsFacts = z.infer<typeof opsFactsSchema>;

const briefSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  actions: z.array(z.object({ title: z.string(), detail: z.string() })),
  unverified: z.array(z.string()),
});

export type OpsBriefText = z.infer<typeof briefSchema>;

export const cachedBriefSchema = z.object({
  day: z.string(),
  model: z.string(),
  generatedAt: z.string(),
  brief: briefSchema,
  facts: opsFactsSchema,
});

export type OpsBrief = z.infer<typeof cachedBriefSchema> & { cached: boolean };

export interface OpsBriefDeps {
  model: string;
  now?: () => Date;
  loadFacts(actor: AuthenticatedUser, now: Date, day: { start: Date; label: string }): Promise<OpsFacts>;
  // Latest successful brief this admin generated since the start of the Bangladesh day.
  findCached(actor: AuthenticatedUser, dayStart: Date): Promise<unknown>;
  // Runs only when a new brief is about to be generated, so cached reads never count.
  beforeGenerate(actor: AuthenticatedUser): Promise<void>;
  generateJson(request: { system: string; user: string }): Promise<JsonGeneration>;
  save(actor: AuthenticatedUser, record: z.infer<typeof cachedBriefSchema> & { promptVersion: string; usage: unknown; stopReason: string | null }): Promise<void>;
  auditFailure(actor: AuthenticatedUser, details: Record<string, unknown>): Promise<void>;
}

export function bangladeshDay(now: Date) {
  const start = new Date(Math.floor((now.getTime() + BANGLADESH_OFFSET_MS) / DAY_MS) * DAY_MS - BANGLADESH_OFFSET_MS);
  return { start, label: new Date(start.getTime() + BANGLADESH_OFFSET_MS).toISOString().slice(0, 10) };
}

export function hoursSince(now: Date, then: Date) {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 3_600_000));
}

type DelayedCandidate = {
  id: string;
  trackingNumber: string;
  status: string;
  createdAt: Date;
  events: { occurredAt: Date }[];
};

// A delayed shipment's age is the time since its latest event. updatedAt also moves on
// payment and webhook writes, so it would make a stalled shipment look recent.
export function delayedExamples(candidates: DelayedCandidate[], now: Date, limit: number) {
  return candidates
    .map((shipment) => ({ shipment, lastActivity: shipment.events[0]?.occurredAt ?? shipment.createdAt }))
    .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime() || a.shipment.id.localeCompare(b.shipment.id))
    .slice(0, limit)
    .map(({ shipment, lastActivity }) => ({
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      hoursSinceUpdate: hoursSince(now, lastActivity),
    }));
}

function requireAdmin(actor: AuthenticatedUser) {
  if (actor.role !== "ADMIN") throw new AppError(403, "Only admins can read the operations brief", "FORBIDDEN");
}

export function readCachedBrief(record: unknown, day: string): OpsBrief | null {
  const parsed = cachedBriefSchema.safeParse(record);
  return parsed.success && parsed.data.day === day ? { ...parsed.data, cached: true } : null;
}

// What the model sees: the same figures without internal IDs.
export function factsForModel(facts: OpsFacts) {
  const strip = (items: OpsFacts["failed"]["recent"]) => items.map(({ id: _id, ...rest }) => rest);
  return {
    ...facts,
    failed: { ...facts.failed, recent: strip(facts.failed.recent) },
    delayed: { ...facts.delayed, oldest: strip(facts.delayed.oldest) },
    unassignedPaid: { ...facts.unassignedPaid, oldest: strip(facts.unassignedPaid.oldest) },
  };
}

const TRACKING_PATTERN = /\bEH-[0-9A-F]{24}\b/gi;

// Numeric values only: digits inside tracking numbers or the date label are not figures.
function collectNumbers(value: unknown, into: Set<string>) {
  if (typeof value === "number") into.add(String(value));
  else if (Array.isArray(value)) for (const item of value) collectNumbers(item, into);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectNumbers(item, into);
}

function trackingNumbers(facts: OpsFacts) {
  return new Set(
    [...facts.failed.recent, ...facts.delayed.oldest, ...facts.unassignedPaid.oldest].map((shipment) => shipment.trackingNumber.toUpperCase()),
  );
}

// Every number and tracking number the brief states must exist in the data it was given.
// Anything else is returned so the dashboard can warn the admin instead of presenting it as fact.
export function unverifiedNumbers(text: string, facts: OpsFacts) {
  const allowed = new Set<string>();
  const { day: _day, ...figures } = factsForModel(facts);
  collectNumbers(figures, allowed);
  const knownTracking = trackingNumbers(facts);
  const found = new Set<string>();
  const withoutTracking = text.replace(TRACKING_PATTERN, (tracking) => {
    if (!knownTracking.has(tracking.toUpperCase())) found.add(tracking);
    return " ";
  });
  // A unit or suffix right after the number ("71h", "3x", "2nd") does not hide it.
  for (const match of withoutTracking.matchAll(/(?<![\w.])\d+(?:[.,]\d+)*/g)) {
    const value = String(Number(match[0].replaceAll(",", "")));
    if (!allowed.has(value)) found.add(match[0]);
  }
  return [...found];
}

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseBrief(text: string, facts: OpsFacts): OpsBriefText {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(502, "The brief could not be prepared. Please try again.", "AI_UPSTREAM_ERROR");
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const headline = clean(record.headline, 160);
  const summary = clean(record.summary, 800);
  if (!headline || !summary) {
    throw new AppError(502, "The brief could not be prepared. Please try again.", "AI_UPSTREAM_ERROR");
  }
  const actions = (Array.isArray(record.actions) ? record.actions : [])
    .map((action) => ({ title: clean(action?.title, 100), detail: clean(action?.detail, 300) }))
    .filter((action) => action.title)
    .slice(0, MAX_BRIEF_ACTIONS);
  const allText = [headline, summary, ...actions.flatMap((action) => [action.title, action.detail])].join(" ");
  return { headline, summary, actions, unverified: unverifiedNumbers(allText, facts) };
}

export async function getCachedBrief(actor: AuthenticatedUser, deps: Pick<OpsBriefDeps, "findCached" | "now">) {
  requireAdmin(actor);
  const day = bangladeshDay(deps.now?.() ?? new Date());
  return readCachedBrief(await deps.findCached(actor, day.start), day.label);
}

export async function generateOpsBrief(actor: AuthenticatedUser, options: { refresh: boolean }, deps: OpsBriefDeps): Promise<OpsBrief> {
  requireAdmin(actor);
  const now = deps.now?.() ?? new Date();
  const day = bangladeshDay(now);
  if (!options.refresh) {
    const cached = readCachedBrief(await deps.findCached(actor, day.start), day.label);
    if (cached) return cached;
  }

  await deps.beforeGenerate(actor);
  let generation: JsonGeneration | null = null;
  try {
    const parsedFacts = opsFactsSchema.safeParse(await deps.loadFacts(actor, now, day));
    if (!parsedFacts.success) throw new AppError(500, "The operations figures could not be prepared", "OPS_FACTS_INVALID");
    const facts = parsedFacts.data;
    generation = await deps.generateJson({
      system: OPS_BRIEF_SYSTEM_PROMPT,
      user: `<operations_data>\n${JSON.stringify(factsForModel(facts))}\n</operations_data>`,
    });
    if (generation.refused) {
      throw new AppError(502, "The brief could not be prepared. Please try again.", "AI_UPSTREAM_ERROR");
    }
    const brief = parseBrief(generation.text, facts);
    const record = { day: day.label, model: deps.model, generatedAt: now.toISOString(), brief, facts };
    await deps.save(actor, { ...record, promptVersion: OPS_BRIEF_PROMPT_VERSION, usage: generation.usage, stopReason: generation.stopReason })
      .catch((error: unknown) => console.error("Operations brief save failed", error instanceof Error ? error.message : error));
    return { ...record, cached: false };
  } catch (error) {
    await deps.auditFailure(actor, {
      model: deps.model,
      promptVersion: OPS_BRIEF_PROMPT_VERSION,
      stopReason: generation?.stopReason ?? null,
      usage: generation?.usage ?? null,
      code: error instanceof AppError ? error.code : "UNEXPECTED",
    }).catch((auditError: unknown) => console.error("Operations brief audit write failed", auditError instanceof Error ? auditError.message : auditError));
    throw error;
  }
}
