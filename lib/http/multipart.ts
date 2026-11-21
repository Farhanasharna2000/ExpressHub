import { AppError } from "@/lib/http/errors";

// Reads a request body without letting an oversized upload be buffered past the limit.
export async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError(413, "Request body is too large", "REQUEST_TOO_LARGE");
  }
  if (!request.body) throw new AppError(400, "Request body is required", "INVALID_FORM");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Cancelling a stream the runtime is still filling can reject; the 413 stands either way.
      await reader.cancel().catch(() => {});
      throw new AppError(413, "Request body is too large", "REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "multipart/form-data") {
    throw new AppError(415, "Content-Type must be multipart/form-data", "UNSUPPORTED_MEDIA_TYPE");
  }
  const body = await readLimitedBytes(request, maxBytes);
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new AppError(400, "The upload could not be read", "INVALID_FORM");
  }
}

export async function formFile(form: FormData, name: string): Promise<Uint8Array | undefined> {
  const value = form.get(name);
  if (value === null || value === "") return undefined;
  if (typeof value === "string") throw new AppError(400, `${name} must be a file`, "INVALID_FORM");
  return value.size ? new Uint8Array(await value.arrayBuffer()) : undefined;
}

export function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}
