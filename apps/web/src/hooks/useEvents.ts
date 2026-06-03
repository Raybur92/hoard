import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { EventsListResponse, EventDetailResponse } from '@hoard/types';

/**
 * EV-PR1 — `/events` list payload. Cached via SWR (PERF-1 localStorage
 * persistence). Server response covers the next-soonest hero + sectioned
 * upcoming / recent / past; no further client-side bucketing.
 */
export function useEvents() {
  const key = 'events';
  const { data, loading, error } = useQuery<EventsListResponse>(key, api.events);
  return {
    data: data ?? null,
    loading,
    error,
    refetch: () => cache.invalidate(key),
  };
}

/**
 * EV-PR1 — `/events/:slug` detail. Slug is part of the cache key so
 * each event is independently cached. Empty slug short-circuits to a
 * loading state — the route guard above this hook usually catches it.
 */
export function useEventDetail(slug: string | undefined) {
  const key = slug ? `event:${slug}` : '';
  const { data, loading, error } = useQuery<EventDetailResponse>(
    key,
    () => (slug ? api.eventBySlug(slug) : Promise.reject(new Error('slug required'))),
  );
  return {
    data: data ?? null,
    loading: !slug || loading,
    error,
    refetch: () => slug && cache.invalidate(key),
  };
}
