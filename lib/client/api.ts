import type { ApiResponse } from "@/types/api";
import { localize } from "@/lib/i18n/bridge";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: unknown[] = [],
    public retryAt = 0,
    public incidentId?: string,
    public errorId?: string,
  ) {
    super(message); this.name = "ApiError";
  }
}
// A request dropped because the session changed or the caller aborted it. Not a failure.
export function isCancelled(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
// The first machine-readable code in an API error, e.g. "RATE_LIMITED".
function errorCode(error: ApiError) {
  for (const issue of error.errors) {
    if (issue && typeof issue === "object" && "code" in issue && typeof issue.code === "string") return issue.code;
  }
  return undefined;
}

// Known API error codes get a translated message in the active language; the server's
// English message is the fallback for anything else.
function serverMessage(error: ApiError) {
  const code = errorCode(error);
  return code ? localize(`errors.codes.${code}`, error.message) : error.message;
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return localize("errors.generic", "Something went wrong. Please try again.");
  if (error.status === 0) return localize("errors.offline", "Unable to connect. Check your connection and try again.");
  if (error.status === 403) return localize("errors.forbidden", "You do not have permission to do this. Your account access may have changed.");
  if (error.status === 404) return localize("errors.notFound", "This record is unavailable. Return to the list and refresh.");
  if (error.status === 409) return localize("errors.conflict", `${error.message}. Refresh the details before trying again.`, { message: serverMessage(error).replace(/[.\s]+$/, "") });
  if (error.status === 429) return localize("errors.rateLimited", "Too many requests. Please wait before trying again.");
  if (error.status >= 500) {
    const trackingId = error.incidentId || error.errorId;
    return trackingId
      ? localize("errors.serverWithId", `The service is temporarily unavailable (Error ID: ${trackingId}). Please try again shortly.`, { id: trackingId })
      : localize("errors.server", "The service is temporarily unavailable. Please try again shortly.");
  }
  return serverMessage(error);
}
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.errors.flatMap(issue => {
    if (issue && typeof issue === "object" && "path" in issue && "message" in issue && typeof issue.path === "string" && typeof issue.message === "string") return [[issue.path, issue.message]];
    return [];
  }));
}
export function queryString(query: Record<string, string | number | boolean | undefined | null> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
export type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal; headers?: HeadersInit; query?: Parameters<typeof queryString>[0]; responseType?: "json" | "blob" };

/** One instance per browser session. No persistent tokens or private response cache. */
export class ApiClient {
  token: string | null = null;
  private generation = 0;
  private cooldowns = new Map<string, ApiError>();
  private requests = new Set<AbortController>();
  private refreshPromise: Promise<void> | null = null;
  onMutation: (() => void) | null = null;
  onRefresh: (() => Promise<void>) | null = null;
  onExpired: (() => void) | null = null;
  onForbidden: (() => Promise<void>) | null = null;
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  clear() {
    this.generation++; this.token = null;
    this.requests.forEach(controller => controller.abort()); this.requests.clear();
  }
  async raw<T>(path: string, options: RequestOptions = {}, token: string | null = null): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("..")) throw new Error("Invalid API path");
    const cooldown = this.cooldowns.get(path);
    if (cooldown && cooldown.retryAt > Date.now()) throw cooldown;
    this.cooldowns.delete(path);
    const headers = new Headers(options.headers);
    // Multipart bodies set their own boundary header; images come back as blobs.
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    headers.set("Accept", options.responseType === "blob" ? "image/*" : "application/json");
    if (options.body !== undefined && !isForm) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      const body = options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body);
      response = await this.fetcher(`/api/v1${path}${queryString(options.query)}`, { method: options.method ?? "GET", body, headers, signal: options.signal, credentials: "same-origin", cache: "no-store" });
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      throw new ApiError(0, "Network error");
    }
    if (options.responseType === "blob" && response.ok) return (await response.blob()) as T;
    let envelope: ApiResponse<T>;
    try { envelope = await response.json(); } catch { throw new ApiError(response.ok ? 502 : response.status, "The server returned an unreadable response"); }
    if (!response.ok || !envelope || !("success" in envelope && envelope.success === true)) {
      const retry = response.headers.get("Retry-After");
      const retryAt = retry ? (/^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry)) : 0;
      const parsedMessage =
        envelope && typeof envelope === "object"
          ? "message" in envelope && typeof envelope.message === "string"
            ? envelope.message
            : "error" in envelope
              ? typeof envelope.error === "string"
                ? envelope.error
                : typeof envelope.error === "object" && envelope.error && "message" in envelope.error && typeof envelope.error.message === "string"
                  ? envelope.error.message
                  : "Request failed"
              : "Request failed"
          : "Request failed";
      const parsedErrors =
        envelope && typeof envelope === "object"
          ? "errors" in envelope && Array.isArray(envelope.errors)
            ? envelope.errors
            : "error" in envelope && typeof envelope.error === "object" && envelope.error && "code" in envelope.error
              ? [{ code: (envelope.error as { code: string }).code }]
              : []
          : [];
      const incidentId =
        envelope && typeof envelope === "object" && "incidentId" in envelope && typeof envelope.incidentId === "string"
          ? envelope.incidentId
          : undefined;
      const errorId =
        envelope && typeof envelope === "object" && "errorId" in envelope && typeof envelope.errorId === "string"
          ? envelope.errorId
          : incidentId;
      const error = new ApiError(response.status, parsedMessage, parsedErrors, Number.isFinite(retryAt) ? retryAt : 0, incidentId, errorId);
      if (response.status === 429 && error.retryAt) this.cooldowns.set(path, error);
      throw error;
    }
    return envelope.data;
  }
  refresh() {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => { try { if (!this.onRefresh) throw new ApiError(401, "Please sign in"); await this.onRefresh(); } catch (error) { this.onExpired?.(); throw error; } })().finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }
  async settleRefresh() { await this.refreshPromise?.catch(() => {}); }
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    // Auth endpoints must never enter refresh/retry logic.
    if (path.startsWith("/auth/")) return this.raw<T>(path, options);
    const version = this.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    this.requests.add(controller);
    const requestOptions = { ...options, signal: controller.signal };
    const assertCurrent = () => { if (controller.signal.aborted || version !== this.generation) throw new DOMException("Request cancelled", "AbortError"); };
    const complete = <T>(result: T) => {
      assertCurrent();
      if (!["GET", "HEAD", "OPTIONS"].includes((options.method ?? "GET").toUpperCase())) this.onMutation?.();
      return result;
    };
    const sentToken = this.token;
    try {
      assertCurrent();
      try { const result = await this.raw<T>(path, requestOptions, sentToken); return complete(result); }
      catch (error) {
        assertCurrent();
        if (!(error instanceof ApiError)) throw error;
        if (error.status === 403) { if (path !== "/users/me") await this.onForbidden?.(); throw error; }
        if (error.status !== 401) throw error;
        if (this.token === sentToken) await this.refresh();
        assertCurrent();
        try { const result = await this.raw<T>(path, requestOptions, this.token); return complete(result); }
        catch (retryError) { if (retryError instanceof ApiError && retryError.status === 401) this.onExpired?.(); throw retryError; }
      }
    } finally { this.requests.delete(controller); options.signal?.removeEventListener("abort", abort); }
  }
}

/** Cancels an obsolete list fetch when filters/page change, and on dispose. */
export function latestRequest(client: ApiClient) {
  let controller: AbortController | undefined;
  return {
    run<T>(path: string, options: RequestOptions = {}) { controller?.abort(); controller = new AbortController(); return client.request<T>(path, { ...options, signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal }); },
    cancel() { controller?.abort(); },
  };
}
