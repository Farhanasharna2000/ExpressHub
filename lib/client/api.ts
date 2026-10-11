import type { ApiResponse } from "@/types/api";

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors: unknown[] = [], public retryAt = 0) {
    super(message); this.name = "ApiError";
  }
}
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  if (error.status === 0) return "Unable to connect. Check your connection and try again.";
  if (error.status === 403) return "You do not have permission to do this. Your account access may have changed.";
  if (error.status === 404) return "This record is unavailable. Return to the list and refresh.";
  if (error.status === 409) return `${error.message}. Refresh the details before trying again.`;
  if (error.status === 429) return "Too many requests. Please wait before trying again.";
  if (error.status >= 500) return "The service is temporarily unavailable. Please try again shortly.";
  return error.message;
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
export type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal; headers?: HeadersInit; query?: Parameters<typeof queryString>[0] };

/** One instance per browser session. No persistent tokens or private response cache. */
export class ApiClient {
  token: string | null = null;
  private generation = 0;
  private cooldowns = new Map<string, ApiError>();
  private requests = new Set<AbortController>();
  private refreshPromise: Promise<void> | null = null;
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
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await this.fetcher(`/api/v1${path}${queryString(options.query)}`, { method: options.method ?? "GET", body: options.body === undefined ? undefined : JSON.stringify(options.body), headers, signal: options.signal, credentials: "same-origin", cache: "no-store" });
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      throw new ApiError(0, "Network error");
    }
    let envelope: ApiResponse<T>;
    try { envelope = await response.json(); } catch { throw new ApiError(response.ok ? 502 : response.status, "The server returned an unreadable response"); }
    if (!response.ok || !envelope || envelope.success !== true) {
      const retry = response.headers.get("Retry-After");
      const retryAt = retry ? (/^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry)) : 0;
      const error = new ApiError(response.status, envelope && "message" in envelope ? envelope.message : "Request failed", envelope && "errors" in envelope ? envelope.errors : [], Number.isFinite(retryAt) ? retryAt : 0);
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
    const sentToken = this.token;
    try {
      assertCurrent();
      try { const result = await this.raw<T>(path, requestOptions, sentToken); assertCurrent(); return result; }
      catch (error) {
        assertCurrent();
        if (!(error instanceof ApiError)) throw error;
        if (error.status === 403) { if (path !== "/users/me") await this.onForbidden?.(); throw error; }
        if (error.status !== 401) throw error;
        if (this.token === sentToken) await this.refresh();
        assertCurrent();
        try { const result = await this.raw<T>(path, requestOptions, this.token); assertCurrent(); return result; }
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
