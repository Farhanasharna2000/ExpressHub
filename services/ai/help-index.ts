import { chunkArticle, chunkHash, parseArticle, type HelpChunkDraft } from "@/services/ai/help-content";

export const EMBED_BATCH_SIZE = 50;

export interface HelpIndexDeps {
  model: string;
  articles: { slug: string; markdown: string }[];
  listIndexed(): Promise<{ id: string; articleSlug: string; position: number; contentHash: string }[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
  upsert(chunk: HelpChunkDraft, contentHash: string, embedding: number[]): Promise<void>;
  remove(ids: string[]): Promise<number>;
}

// Re-embeds only chunks whose text or embedding model changed, and removes chunks
// that no longer exist, so re-running the indexer is cheap and safe.
export async function indexHelpArticles(deps: HelpIndexDeps) {
  const chunks = deps.articles.flatMap(({ slug, markdown }) => chunkArticle(parseArticle(slug, markdown)));
  const key = (slug: string, position: number) => `${slug}#${position}`;
  const indexed = new Map((await deps.listIndexed()).map((row) => [key(row.articleSlug, row.position), row]));

  const pending = chunks
    .map((chunk) => ({ chunk, hash: chunkHash(deps.model, chunk.embedText) }))
    .filter(({ chunk, hash }) => indexed.get(key(chunk.articleSlug, chunk.position))?.contentHash !== hash);

  for (let start = 0; start < pending.length; start += EMBED_BATCH_SIZE) {
    const batch = pending.slice(start, start + EMBED_BATCH_SIZE);
    const embeddings = await deps.embedDocuments(batch.map(({ chunk }) => chunk.embedText));
    for (const [index, { chunk, hash }] of batch.entries()) await deps.upsert(chunk, hash, embeddings[index]);
  }

  const current = new Set(chunks.map((chunk) => key(chunk.articleSlug, chunk.position)));
  const stale = [...indexed.entries()].filter(([id]) => !current.has(id)).map(([, row]) => row.id);
  const deleted = await deps.remove(stale);

  return { articles: deps.articles.length, chunks: chunks.length, embedded: pending.length, unchanged: chunks.length - pending.length, deleted };
}
