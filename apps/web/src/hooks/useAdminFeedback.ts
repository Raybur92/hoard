// F1.4 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md). Admin
// hook for `GET /api/admin/feedback`. Matches the `useAdminInviteCodes`
// shape per Andrea — same SWR convention (useQuery for the first page),
// same cache key pattern (`admin:feedback`), no abstraction invented.
// loadMore exists in addition because the feedback endpoint paginates
// while invite-codes does not; that's a server-side difference, not a
// hook-architecture difference.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { FeedbackWithUser, FeedbackListResponse } from '@hoard/types';

export interface UseAdminFeedbackResult {
  items: FeedbackWithUser[];
  nextCursor: string | null;
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  loadMore: () => Promise<void>;
}

export function useAdminFeedback(): UseAdminFeedbackResult {
  const { data, loading, error, refetch } = useQuery<FeedbackListResponse>(
    'admin:feedback',
    () => api.admin.listFeedback(),
  );

  // Additional pages loaded via `[load more]`. Reset whenever the base
  // query produces a fresh `data` (on mount and on every invalidation
  // — including the one fired by `markFeedbackRead`). The reset is a
  // deliberate v1 wart: at cohort size we'll rarely cross page 1, and
  // the alternative (cursor-aware optimistic reconciliation) is a lot
  // of machinery for a feature with no demand. Documented in §4.
  const [extraItems, setExtraItems] = useState<FeedbackWithUser[]>([]);
  const [tailCursor, setTailCursor] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setExtraItems([]);
      setTailCursor(data.nextCursor);
    }
  }, [data]);

  const loadMore = useCallback(async () => {
    if (!tailCursor) return;
    const next = await api.admin.listFeedback(tailCursor);
    setExtraItems((prev) => [...prev, ...next.items]);
    setTailCursor(next.nextCursor);
  }, [tailCursor]);

  return {
    items: data ? [...data.items, ...extraItems] : [],
    nextCursor: tailCursor,
    unreadCount: data?.unreadCount ?? 0,
    loading,
    error,
    refetch,
    loadMore,
  };
}
