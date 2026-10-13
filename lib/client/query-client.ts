import { QueryClient, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "./api";

export const resourceQueryKey = ["resources"] as const;

/** A new in-memory cache for each SessionStore; never shared across server requests. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // ApiClient owns token refresh and Retry-After. Avoid extra automatic retries.
        retry: false,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

export function resourceOptions<T>(api: ApiClient, path: string | null, identity: string) {
  const separator = path?.indexOf("?") ?? -1;
  const endpoint = separator < 0 ? path : path!.slice(0, separator);
  const params = new URLSearchParams(separator < 0 ? "" : path!.slice(separator + 1));
  params.sort();
  return queryOptions({
    queryKey: [...resourceQueryKey, identity, endpoint, params.toString()],
    enabled: Boolean(path),
    queryFn: ({ signal }) => api.request<T>(endpoint!, {
      query: Object.fromEntries(params), signal,
    }),
  });
}
