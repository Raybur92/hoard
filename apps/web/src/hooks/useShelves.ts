import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery, type UseQueryOptions } from './useQuery';
import type { ShelvesResponse } from '@hoard/types';

/**
 * Loads the top N games per status, plus per-status counts, in one round trip.
 * Backed by `GET /api/games/shelves?perStatus=N`.
 *
 * Use for the multi-shelf Library view. For a single-shelf filtered view
 * (`/library/Backlog`), use `useGames({ status, limit })` instead.
 */
export function useShelves(perStatus = 12, opts?: UseQueryOptions) {
  const key = `shelves:${perStatus}`;
  const { data, loading, error } = useQuery<ShelvesResponse>(
    key,
    () => api.shelves(perStatus),
    opts,
  );
  return {
    data: data ?? null,
    loading,
    error,
    refetch: () => cache.invalidate('shelves:'),
  };
}
