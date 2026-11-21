import { ApiError, errorMessage } from "@/lib/client/api";

type Translate = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

// File-level problems come back as errors[0] = { code, params }; the page shows them in the
// active language and falls back to the generic API message for anything else.
export function importErrorText(error: unknown, t: Translate, number: (value: number) => string) {
  if (error instanceof ApiError) {
    const issue = error.errors[0] as { code?: unknown; params?: Record<string, unknown> } | undefined;
    const code = typeof issue?.code === "string" ? issue.code : null;
    if (code && t.has(`fileErrors.${code}`)) return t(`fileErrors.${code}`, localizedParams(issue?.params, number));
  }
  return errorMessage(error);
}

// Counts in messages are formatted for the language so Bangla shows Bangla digits.
export function localizedParams(params: Record<string, unknown> | undefined, number: (value: number) => string) {
  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    values[key] = typeof value === "number" ? number(value) : String(value);
  }
  return values;
}

export function saveTextFile(content: string, filename: string, contentType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
