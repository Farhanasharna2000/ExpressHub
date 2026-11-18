import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { HelpChunkDraft } from "@/services/ai/help-content";
import type { TextHit, VectorHit } from "@/services/ai/help.service";

export const EMBEDDING_DIMENSIONS = 768;

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

// pgvector's text format. Every value is checked, so the literal is always well formed.
export function vectorLiteral(values: number[]) {
  if (values.length !== EMBEDDING_DIMENSIONS || !values.every(Number.isFinite)) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} finite embedding values`);
  }
  return `[${values.join(",")}]`;
}

// Words only, joined with OR, so a question matches chunks sharing any meaningful term.
// English stop words are dropped by Postgres. Letters, combining marks (Bangla vowel
// signs) and digits cannot break to_tsquery.
export function keywordQuery(question: string) {
  const words = question.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return [...new Set(words)].slice(0, 20).join(" | ");
}

export async function searchHelpByVector(db: Db, embedding: number[], limit: number): Promise<VectorHit[]> {
  const vector = vectorLiteral(embedding);
  return db.$queryRaw<VectorHit[]>`
    SELECT "id", "articleSlug", "articleTitle", "heading", "anchor", "content",
           1 - ("embedding" <=> ${vector}::vector) AS "similarity"
    FROM "help_chunks"
    ORDER BY "embedding" <=> ${vector}::vector
    LIMIT ${limit}`;
}

export async function searchHelpByText(db: Db, question: string, limit: number): Promise<TextHit[]> {
  const query = keywordQuery(question);
  if (!query) return [];
  // The expression matches help_chunks_search_idx so the GIN index is used.
  return db.$queryRaw<TextHit[]>`
    SELECT "id", "articleSlug", "articleTitle", "heading", "anchor", "content",
           ts_rank(to_tsvector('english', "articleTitle" || ' ' || "heading" || ' ' || "content"), q) AS "rank"
    FROM "help_chunks", to_tsquery('english', ${query}) AS q
    WHERE to_tsvector('english', "articleTitle" || ' ' || "heading" || ' ' || "content") @@ q
    ORDER BY "rank" DESC, "position" ASC
    LIMIT ${limit}`;
}

export async function countHelpChunks(db: Db) {
  const [row] = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS "count" FROM "help_chunks"`;
  return Number(row?.count ?? 0);
}

export async function listIndexedChunks(db: Db) {
  return db.$queryRaw<{ id: string; articleSlug: string; position: number; contentHash: string }[]>`
    SELECT "id", "articleSlug", "position", "contentHash" FROM "help_chunks"`;
}

export async function upsertHelpChunk(db: Db, chunk: HelpChunkDraft, contentHash: string, model: string, embedding: number[]) {
  const vector = vectorLiteral(embedding);
  await db.$executeRaw`
    INSERT INTO "help_chunks" ("id", "articleSlug", "articleTitle", "heading", "anchor", "position", "content", "contentHash", "model", "embedding", "updatedAt")
    VALUES (${randomUUID()}, ${chunk.articleSlug}, ${chunk.articleTitle}, ${chunk.heading}, ${chunk.anchor}, ${chunk.position},
            ${chunk.content}, ${contentHash}, ${model}, ${vector}::vector, NOW())
    ON CONFLICT ("articleSlug", "position") DO UPDATE SET
      "articleTitle" = EXCLUDED."articleTitle", "heading" = EXCLUDED."heading", "anchor" = EXCLUDED."anchor",
      "content" = EXCLUDED."content", "contentHash" = EXCLUDED."contentHash", "model" = EXCLUDED."model",
      "embedding" = EXCLUDED."embedding", "updatedAt" = NOW()`;
}

export async function deleteHelpChunks(db: Db, ids: string[]) {
  if (!ids.length) return 0;
  return db.$executeRaw`DELETE FROM "help_chunks" WHERE "id" = ANY(${ids})`;
}
