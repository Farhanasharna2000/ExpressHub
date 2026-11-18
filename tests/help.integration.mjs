// Runs the help search SQL against PostgreSQL with fixture vectors. No AI provider is called.
//   node --env-file=.env tests/help.integration.mjs
import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const search = await import("../services/ai/help-search.ts");
const { selectSources } = await import("../services/ai/help.service.ts");

const prisma = new PrismaClient();
const tag = `zz-help-test-${randomBytes(4).toString("hex")}`;
const word = `zqx${randomBytes(3).toString("hex")}`;

function basis(index, weight = 1) {
  const values = new Array(search.EMBEDDING_DIMENSIONS).fill(0);
  values[index] = weight;
  return values;
}

function draft(position, heading, content) {
  return { articleSlug: tag, articleTitle: "Fixture article", heading, anchor: heading.toLowerCase().replace(/\s+/g, "-"), position, content, embedText: content };
}

try {
  const extension = await prisma.$queryRaw`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
  assert.equal(extension.length, 1, "pgvector is installed");
  const indexes = (await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename = 'help_chunks'`).map((row) => row.indexname);
  assert.ok(indexes.includes("help_chunks_embedding_hnsw_idx"), "HNSW index exists");
  assert.ok(indexes.includes("help_chunks_search_idx"), "full-text index exists");

  const before = await search.countHelpChunks(prisma);
  await search.upsertHelpChunk(prisma, draft(0, "Refund timing", `Refunds ${word} go back to the card.`), "h0", "fixture", basis(0));
  await search.upsertHelpChunk(prisma, draft(1, "Cancel rules", "Cancel before pickup."), "h1", "fixture", basis(1));
  // Mostly basis(0) with some basis(1): closer to the first chunk than the second.
  const blend = basis(0, 0.8);
  blend[1] = 0.6;
  await search.upsertHelpChunk(prisma, draft(2, "Blend", "Between refunds and cancelling."), "h2", "fixture", blend);
  assert.equal(await search.countHelpChunks(prisma), before + 3);

  const nearest = (await search.searchHelpByVector(prisma, basis(0), 50)).filter((hit) => hit.articleSlug === tag);
  assert.deepEqual(nearest.map((hit) => hit.heading), ["Refund timing", "Blend", "Cancel rules"]);
  assert.ok(Math.abs(Number(nearest[0].similarity) - 1) < 1e-6, "identical vectors have similarity 1");
  assert.ok(Math.abs(Number(nearest[1].similarity) - 0.8) < 1e-6, "cosine similarity is used");
  assert.ok(Math.abs(Number(nearest[2].similarity)) < 1e-6, "orthogonal vectors have similarity 0");

  const keyword = await search.searchHelpByText(prisma, `When do ${word} refunds arrive?`, 10);
  assert.equal(keyword[0].heading, "Refund timing", "the unique word ranks its chunk first");
  assert.ok(Number(keyword[0].rank) > 0);
  assert.deepEqual(await search.searchHelpByText(prisma, "!!! ???", 10), []);
  // Characters that are to_tsquery operators are stripped rather than causing an error.
  await search.searchHelpByText(prisma, "refund & ( | ! :* <-> '", 10);

  const sources = selectSources(nearest, keyword.filter((hit) => hit.articleSlug === tag));
  assert.equal(sources[0].heading, "Refund timing", "fusion keeps the chunk both searches ranked first");

  // Re-indexing the same position updates it in place.
  await search.upsertHelpChunk(prisma, draft(1, "Cancel rules", "Cancel before pickup, updated."), "h1b", "fixture", basis(1));
  const rows = (await search.listIndexedChunks(prisma)).filter((row) => row.articleSlug === tag);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.position === 1).contentHash, "h1b");

  assert.equal(await search.deleteHelpChunks(prisma, rows.map((row) => row.id)), 3);
  assert.equal(await search.countHelpChunks(prisma), before);
  console.info("Help integration passed: pgvector and indexes present, cosine ordering, keyword search, operator-safe queries, fusion, upsert and delete.");
} finally {
  await prisma.$executeRaw`DELETE FROM "help_chunks" WHERE "articleSlug" = ${tag}`;
  await prisma.$disconnect();
}
