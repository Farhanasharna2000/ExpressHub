"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/features/auth/provider";
import { ApiError } from "@/lib/client/api";

export function useResource<T>(path: string | null) {
  const { store } = useSession();
  const [attempt, setAttempt] = useState(0);
  const key = `${path}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: unknown }>({ key: "" });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    // The API client serializes filters separately, so split a prebuilt local resource URL here.
    const [endpoint, query] = path.split("?");
    void store.api.request<T>(endpoint, { query: Object.fromEntries(new URLSearchParams(query)), signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) { setResult({ key, error }); } });
    return () => controller.abort();
  }, [path, key, store]);
  return { data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : undefined, loading: Boolean(path) && (result.key !== key || (!result.data && !result.error)), reload: () => setAttempt(value => value + 1) };
}
export function useRetryDelay(error: unknown) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const at = error instanceof ApiError ? error.retryAt : 0;
    const tick = () => setSeconds(Math.max(0, Math.ceil((at - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000); return () => clearInterval(timer);
  }, [error]);
  return seconds;
}
