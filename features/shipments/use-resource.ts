"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/features/auth/provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resourceOptions } from "@/lib/client/query-client";
import { ApiError } from "@/lib/client/api";

export interface ResourceResult<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
}

export function useResource<T>(path: string | null): ResourceResult<T> {
  const { store, status, user, revision } = useSession();
  const client = useQueryClient();
  const identity = `${user?.id ?? "anonymous"}:${user?.role ?? ""}:${revision}`;
  const options = resourceOptions<T>(store.api, path, identity);
  const enabled = Boolean(path) && status === "authenticated";
  const query = useQuery({ ...options, enabled });
  const reload = useCallback(() => {
    if (!path || status !== "authenticated") return;
    const { queryKey } = resourceOptions<T>(store.api, path, identity);
    void client.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
  }, [client, store, path, identity, status]);
  return {
    data: enabled && !query.isError ? query.data : undefined,
    error: enabled ? query.error : null,
    loading: enabled && query.isPending,
    refreshing: Boolean(enabled && query.isFetching && !query.isPending),
    reload,
  };
}

export function useRetryDelay(error: unknown) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const at = error instanceof ApiError ? error.retryAt : 0;
    const tick = () => setSeconds(Math.max(0, Math.ceil((at - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [error]);
  return seconds;
}
