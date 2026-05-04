import { useEffect, useReducer, useRef, useState } from 'react';
import * as cache from '../lib/cache';

export interface UseQueryOptions {
  /** Treat cache entry as fresh for this many ms. Default 30 000. */
  staleMs?: number;
  /** When false, the hook does nothing. Default true. */
  enabled?: boolean;
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Stale-while-revalidate query hook.
 *
 * - First mount with empty cache: `loading: true`, fetcher runs, data populates.
 * - Subsequent mounts with same key: returns cached `data` immediately. If the
 *   entry is older than `staleMs`, fires a background refetch.
 * - Concurrent mounts with the same key dedupe via an in-flight promise map.
 * - Subscribers re-render when `cache.set(key, ...)` or `cache.invalidate(prefix)`
 *   touches a matching key. After invalidation the hook re-runs its fetch
 *   automatically.
 *
 * Mutations elsewhere (in `lib/api.ts`) call `cache.invalidate(prefix)` to drop
 * stale entries; subscribers refetch automatically.
 */
export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: UseQueryOptions,
): QueryResult<T> {
  const enabled = opts?.enabled !== false;
  const staleMs = opts?.staleMs ?? 30_000;

  // `gen` bumps on every cache change for this key (set or invalidate).
  // It re-renders the component AND drives the fetch effect's dep array,
  // which is what makes refetch-on-invalidate work.
  const [gen, bumpGen] = useReducer((x: number) => x + 1, 0);
  const [error, setError] = useState<string | null>(null);

  // Keep latest fetcher in a ref so the fetch effect doesn't depend on
  // its (per-render) identity.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    return cache.subscribe(key, bumpGen);
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) return;
    setError(null);

    const entry = cache.get<T>(key);
    const stale = !entry || Date.now() - entry.ts > staleMs;
    if (!stale) return;

    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fetcherRef.current()
        .then((d) => { cache.set(key, d); return d; })
        .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
      inflight.set(key, p);
    }
    void p.catch((e) => setError(String(e)));
  }, [key, enabled, staleMs, gen]);

  const entry = enabled ? cache.get<T>(key) : undefined;
  return {
    data: entry?.data,
    loading: !entry && error === null && enabled,
    error,
    refetch: () => cache.invalidate(key),
  };
}
