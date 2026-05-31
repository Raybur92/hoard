import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { LensIndexResponse } from '@hoard/types';

/**
 * B-IGDB-3b2 — IGDB-tag values present in the user's library with their
 * UserGame counts. Used by:
 *   - Library overview's browse-by panel (top-3 + show-all expand)
 *   - `/library/by-genre/:slug` etc. for slug → canonical-name resolution
 *
 * Cached via SWR (PERF-1 persisted across reloads). Invalidated by the
 * existing `games:` prefix and by sync side-effects that change the
 * library tag distribution; explicit `refetch()` available.
 */
export function useLensIndex() {
  const key = 'lens-index';
  const { data, loading, error } = useQuery<LensIndexResponse>(key, api.lensIndex);
  return {
    data: data ?? null,
    loading,
    error,
    refetch: () => cache.invalidate(key),
  };
}
