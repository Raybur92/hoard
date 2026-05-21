// TL1.4 of the telemetry workstream (docs/TELEMETRY_PLAN.md). Admin hook
// for `GET /api/admin/events`. Mirrors `useAdminFeedback` exactly per
// Andrea — same SWR convention (useQuery for page 0), same cache key
// pattern (`admin:events`), same loadMore accumulation. No new abstraction
// invented; the two hooks diverge only on their data shape (no unreadCount
// here — events are immutable per TL-D10).
//
// `nextCursor === null` is the termination signal: loadMore is a no-op
// when no cursor is set, and the UI should treat that as the end of the
// stream (typically by hiding/disabling the [load more] button).
//
// No cache invalidation from any mutation in TL-series — events are
// immutable. The hook re-fetches only on mount and on manual refetch().

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { UserEventWithUser, UserEventListResponse } from '@hoard/types';

export interface UseAdminEventsResult {
  items: UserEventWithUser[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => Promise<void>;
}

export interface UseAdminEventsFilters {
  userId?: string;
  event?: string;
}

export function useAdminEvents(filters: UseAdminEventsFilters = {}): UseAdminEventsResult {
  // Cache key includes filter values so different filter slices don't
  // collide. Empty string in the key when a filter is omitted keeps the
  // unfiltered cache key clean and stable.
  const cacheKey = `admin:events|u=${filters.userId ?? ''}|e=${filters.event ?? ''}`;

  const { data, loading, error, refetch } = useQuery<UserEventListResponse>(
    cacheKey,
    () => api.admin.listEvents(filters),
  );

  // Additional pages loaded via `[load more]`. Reset whenever the base
  // query produces fresh `data` — on mount, on filter change, on manual
  // refetch. Same pattern as useAdminFeedback; same v1 wart noted there
  // (cache reset drops accumulated pages on invalidation, but events
  // are immutable so invalidation is rare here).
  const [extraItems, setExtraItems] = useState<UserEventWithUser[]>([]);
  const [tailCursor, setTailCursor] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setExtraItems([]);
      setTailCursor(data.nextCursor);
    }
  }, [data]);

  const loadMore = useCallback(async () => {
    // nextCursor === null is the termination signal — no-op early
    // return keeps the UI from firing meaningless requests if a
    // [load more] handler somehow fires when the button should be
    // hidden/disabled.
    if (!tailCursor) return;
    const next = await api.admin.listEvents({ ...filters, cursor: tailCursor });
    setExtraItems((prev) => [...prev, ...next.items]);
    setTailCursor(next.nextCursor);
  }, [tailCursor, filters]);

  return {
    items: data ? [...data.items, ...extraItems] : [],
    nextCursor: tailCursor,
    loading,
    error,
    refetch,
    loadMore,
  };
}
