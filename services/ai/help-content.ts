import { createHash } from "node:crypto";

// About 400 tokens at roughly 4 characters per token.
export const MAX_CHUNK_CHARS = 1600;
// A trailing paragraph this short is repeated at the start of the next chunk for context.
export const OVERLAP_CHARS = 400;

export type HelpSection = { heading: string; anchor: string; body: string };
export type HelpArticle = { slug: string; title: string; sections: HelpSection[] };

export type HelpChunkDraft = {
  articleSlug: string;
  articleTitle: string;
  heading: string;
  anchor: string;
  position: number;
  content: string;
  // What is embedded: the article title and heading give each chunk its context.
  embedText: string;
};

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}

// Help articles are plain Markdown: one "# Title", then "## Section" headings.
export function parseArticle(slug: string, markdown: string): HelpArticle {
  if (!isValidSlug(slug)) throw new Error(`Invalid help article slug: ${slug}`);
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.findIndex((line) => line.startsWith("# "));
  if (titleLine === -1) throw new Error(`Help article ${slug} has no "# Title" line`);
  const title = lines[titleLine].slice(2).trim();
  const sections: HelpSection[] = [];
  let current: HelpSection = { heading: title, anchor: "", body: "" };
  const bodyLines: string[] = [];
  const flush = () => {
    const body = bodyLines.join("\n").trim();
    if (body) sections.push({ ...current, body });
    bodyLines.length = 0;
  };
  for (const line of lines.slice(titleLine + 1)) {
    if (line.startsWith("## ")) {
      flush();
      const heading = line.slice(3).trim();
      current = { heading, anchor: slugify(heading), body: "" };
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return { slug, title, sections };
}

function splitParagraphs(body: string) {
  return body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

// Heading-aware chunks: a section is never merged with another section, and a long
// section is split on paragraph boundaries with a short overlap.
export function chunkArticle(article: HelpArticle): HelpChunkDraft[] {
  const chunks: HelpChunkDraft[] = [];
  for (const section of article.sections) {
    const pieces: string[] = [];
    let current: string[] = [];
    let length = 0;
    for (const paragraph of splitParagraphs(section.body)) {
      if (length > 0 && length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
        pieces.push(current.join("\n\n"));
        const last = current.at(-1) ?? "";
        current = last.length <= OVERLAP_CHARS ? [last] : [];
        length = current.reduce((total, item) => total + item.length + 2, 0);
      }
      current.push(paragraph);
      length += paragraph.length + 2;
    }
    if (current.length) pieces.push(current.join("\n\n"));
    for (const content of pieces) {
      chunks.push({
        articleSlug: article.slug,
        articleTitle: article.title,
        heading: section.heading,
        anchor: section.anchor,
        position: chunks.length,
        content,
        embedText: `${article.title}\n${section.heading}\n\n${content}`,
      });
    }
  }
  return chunks;
}

export function chunkHash(model: string, embedText: string) {
  return createHash("sha256").update(`${model}\n${embedText}`).digest("hex");
}

export function sourceHref(slug: string, anchor: string) {
  return `/help/${slug}${anchor ? `#${anchor}` : ""}`;
}
