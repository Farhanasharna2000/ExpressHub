import { AppError } from "@/lib/http/errors";
import type { JsonGeneration } from "@/services/ai/booking-draft.service";
import { sourceHref } from "@/services/ai/help-content";
import { HELP_PROMPT_VERSION, HELP_SYSTEM_PROMPT, helpAnswerSchema } from "@/services/ai/prompts/help";

export const MAX_SOURCES = 5;
export const SEARCH_LIMIT = 10;
// Cosine similarity below this is treated as unrelated. Tuned against the eval set.
export const MIN_SIMILARITY = 0.6;
export const RRF_K = 60;
export const MAX_ANSWER_CHARS = 1200;

export const HELP_FALLBACK =
  "I couldn't find that in the ExpressHub help articles. Browse the help centre, or if you're signed in, ask the shipment assistant about your own shipments.";

export type RetrievedChunk = {
  id: string;
  articleSlug: string;
  articleTitle: string;
  heading: string;
  anchor: string;
  content: string;
};
export type VectorHit = RetrievedChunk & { similarity: number };
export type TextHit = RetrievedChunk & { rank: number };

export type HelpSource = { title: string; section: string; href: string };
export type HelpResult = { answer: string; sources: HelpSource[]; fallback: boolean };

export interface HelpDeps {
  model: string;
  embedQuery(text: string): Promise<number[]>;
  searchVector(embedding: number[], limit: number): Promise<VectorHit[]>;
  searchText(query: string, limit: number): Promise<TextHit[]>;
  generateJson(request: { system: string; user: string; schema: Record<string, unknown> }): Promise<JsonGeneration>;
  audit(details: Record<string, unknown>): Promise<void>;
}

// Reciprocal rank fusion: each list contributes 1 / (k + rank) for every id it contains,
// so items ranked well by both vector and keyword search rise to the top.
export function reciprocalRankFusion(lists: string[][], k = RRF_K) {
  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || firstSeen.get(a.id)! - firstSeen.get(b.id)!);
}

// Vector hits must pass the similarity threshold; keyword hits already matched a term.
export function selectSources(
  vector: VectorHit[],
  text: TextHit[],
  { minSimilarity = MIN_SIMILARITY, max = MAX_SOURCES } = {},
): RetrievedChunk[] {
  const relevant = vector.filter((hit) => hit.similarity >= minSimilarity);
  const byId = new Map<string, RetrievedChunk>();
  for (const hit of [...relevant, ...text]) if (!byId.has(hit.id)) byId.set(hit.id, hit);
  return reciprocalRankFusion([relevant.map((hit) => hit.id), text.map((hit) => hit.id)])
    .slice(0, max)
    .map(({ id }) => byId.get(id)!);
}

export function cleanQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim();
}

const attribute = (value: string) => value.replace(/[<>"&]/g, " ");

// The question is wrapped as data. Angle brackets are removed so it cannot close its tag.
export function buildHelpPrompt(question: string, sources: RetrievedChunk[]) {
  const labels = sources.map((_, index) => `S${index + 1}`);
  const context = sources
    .map((source, index) => `<source label="${labels[index]}" article="${attribute(source.articleTitle)}" section="${attribute(source.heading)}">\n${source.content}\n</source>`)
    .join("\n");
  const user = `<context>\n${context}\n</context>\n\n<question>\n${question.replace(/[<>]/g, " ")}\n</question>`;
  return { user, labels };
}

// Only labels that were actually sent count, each once, in the order given.
export function validateCitations(citations: unknown, labels: string[]) {
  if (!Array.isArray(citations)) return [];
  const allowed = new Set(labels);
  return [...new Set(citations.filter((label): label is string => typeof label === "string" && allowed.has(label)))];
}

export function parseHelpAnswer(text: string, labels: string[]) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(502, "The help assistant could not answer right now. Please try again.", "AI_UPSTREAM_ERROR");
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const answer = typeof record.answer === "string"
    ? record.answer.replace(/\s*[[(]S\d+(?:\s*,\s*S\d+)*[\])]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER_CHARS)
    : "";
  return { answer, citations: validateCitations(record.citations, labels), confident: record.confident === true };
}

function fallback(): HelpResult {
  return { answer: HELP_FALLBACK, sources: [], fallback: true };
}

function citedSources(citations: string[], labels: string[], sources: RetrievedChunk[]) {
  const seen = new Set<string>();
  const result: HelpSource[] = [];
  for (const label of citations) {
    const source = sources[labels.indexOf(label)];
    const href = sourceHref(source.articleSlug, source.anchor);
    if (seen.has(href)) continue;
    seen.add(href);
    result.push({ title: source.articleTitle, section: source.heading, href });
  }
  return result;
}

export async function answerHelpQuestion(rawQuestion: string, deps: HelpDeps): Promise<HelpResult> {
  const question = cleanQuestion(rawQuestion);
  const record: Record<string, unknown> = {
    model: deps.model,
    promptVersion: HELP_PROMPT_VERSION,
    // Visitors type phone numbers and addresses into help boxes, so the text is never stored.
    questionLength: question.length,
  };
  const audit = (details: Record<string, unknown>) =>
    deps.audit({ ...record, ...details }).catch((error: unknown) =>
      console.error("Help audit write failed", error instanceof Error ? error.message : error));

  let generation: JsonGeneration | null = null;
  try {
    const embedding = await deps.embedQuery(question);
    const [vector, text] = await Promise.all([
      deps.searchVector(embedding, SEARCH_LIMIT),
      deps.searchText(question, SEARCH_LIMIT),
    ]);
    const sources = selectSources(vector, text);
    record.chunkIds = sources.map((source) => source.id);
    if (!sources.length) {
      await audit({ outcome: "NO_MATCH" });
      return fallback();
    }

    const { user, labels } = buildHelpPrompt(question, sources);
    generation = await deps.generateJson({ system: HELP_SYSTEM_PROMPT, user, schema: helpAnswerSchema(labels) });
    record.usage = generation.usage;
    record.stopReason = generation.stopReason;
    if (generation.refused) {
      await audit({ outcome: "REFUSED" });
      return fallback();
    }
    const parsed = parseHelpAnswer(generation.text, labels);
    record.citations = parsed.citations;
    record.confident = parsed.confident;
    if (!parsed.confident || !parsed.answer || !parsed.citations.length) {
      await audit({ outcome: "NOT_CONFIDENT" });
      return fallback();
    }
    await audit({ outcome: "ANSWERED" });
    return { answer: parsed.answer, sources: citedSources(parsed.citations, labels, sources), fallback: false };
  } catch (error) {
    await audit({ outcome: "ERROR", code: error instanceof AppError ? error.code : "UNEXPECTED", usage: generation?.usage ?? null });
    throw error;
  }
}
