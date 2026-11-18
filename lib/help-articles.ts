import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArticle } from "@/services/ai/help-content";

// Read at build time only: the help pages are statically generated, so no deployed
// function opens these files and they need no output tracing.
export const HELP_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "docs", "help");

export function readHelpArticleFiles(dir = HELP_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => ({ slug: file.slice(0, -3), markdown: readFileSync(path.join(dir, file), "utf8") }));
}

export function readHelpArticles(dir = HELP_DIR) {
  return readHelpArticleFiles(dir).map(({ slug, markdown }) => parseArticle(slug, markdown));
}
