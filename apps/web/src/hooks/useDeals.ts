import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { DealsResponse } from '@hoard/types';

/**
 * DEALS-PR1 — current deals payload for `/deals`. Cached via SWR
 * (PERF-1 localStorage persistence). 60s server-side `max-age` matches
 * the nightly refresh cadence — there's no urgency to refetch
 * mid-session.
 */
export function useDeals() {
  const key = 'deals';
  const { data, loading, error } = useQuery<DealsResponse>(key, api.deals);
  return {
    data: data ?? null,
    loading,
    error,
    refetch: () => cache.invalidate(key),
  };
}
