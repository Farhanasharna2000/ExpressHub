import type { GoogleGenAI } from "@google/genai";
import { EMBEDDING_DIMENSIONS } from "@/services/ai/help-search";

export const HELP_EMBEDDING_MODEL = "gemini-embedding-001";
export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// Shortened Gemini embeddings are not unit length, so they are normalised before storage.
export function normalize(values: number[]) {
  const length = Math.hypot(...values);
  return length > 0 ? values.map((value) => value / length) : values;
}

export async function embedTexts(client: Pick<GoogleGenAI, "models">, texts: string[], taskType: EmbeddingTask) {
  const response = await client.models.embedContent({
    model: HELP_EMBEDDING_MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  const embeddings = (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
  if (embeddings.length !== texts.length || embeddings.some((values) => values.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error("The embedding response did not match the request");
  }
  return embeddings.map(normalize);
}
