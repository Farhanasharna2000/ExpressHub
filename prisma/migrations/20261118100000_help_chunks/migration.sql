-- pgvector stores the help article embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "help_chunks" (
    "id" TEXT NOT NULL,
    "articleSlug" VARCHAR(80) NOT NULL,
    "articleTitle" VARCHAR(160) NOT NULL,
    "heading" VARCHAR(200) NOT NULL,
    "anchor" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "help_chunks_articleSlug_position_key" ON "help_chunks"("articleSlug", "position");

-- Approximate nearest-neighbour search by cosine distance.
CREATE INDEX "help_chunks_embedding_hnsw_idx" ON "help_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- Full-text search over the heading and body, used alongside vector search.
CREATE INDEX "help_chunks_search_idx" ON "help_chunks" USING gin (to_tsvector('english', "articleTitle" || ' ' || "heading" || ' ' || "content"));
