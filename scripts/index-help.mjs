// Embeds docs/help into the help_chunks table. Run after editing help articles:
//   node --env-file=.env scripts/index-help.mjs
// Needs DATABASE_URL and GEMINI_API_KEY. Unchanged chunks are skipped.
import "../tests/helpers/typescript.mjs";
import { GoogleGenAI } from "@google/genai";
import { PrismaClient } from "@prisma/client";

const { readHelpArticleFiles } = await import("../lib/help-articles.ts");
const { indexHelpArticles } = await import("../services/ai/help-index.ts");
const { embedTexts, HELP_EMBEDDING_MODEL } = await import("../services/ai/help-embeddings.ts");
const search = await import("../services/ai/help-search.ts");

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is required to embed help articles.");
  process.exit(1);
}

const prisma = new PrismaClient();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

try {
  const result = await indexHelpArticles({
    model: HELP_EMBEDDING_MODEL,
    articles: readHelpArticleFiles(),
    listIndexed: () => search.listIndexedChunks(prisma),
    embedDocuments: (texts) => embedTexts(gemini, texts, "RETRIEVAL_DOCUMENT"),
    upsert: (chunk, hash, embedding) => search.upsertHelpChunk(prisma, chunk, hash, HELP_EMBEDDING_MODEL, embedding),
    remove: (ids) => search.deleteHelpChunks(prisma, ids),
  });
  console.info(
    `Indexed ${result.articles} articles into ${result.chunks} chunks: ${result.embedded} embedded, ${result.unchanged} unchanged, ${result.deleted} removed.`,
  );
} finally {
  await prisma.$disconnect();
}
