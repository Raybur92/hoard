import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { DashboardPeriod, DashboardResponse } from '@hoard/types';

/**
 * Dashboard data hook.
 *
 * DASH-PR2 adds period scoping: `'all'` (default) uses the legacy cache key
 * `'dashboard'` so existing call sites + tests stay untouched; `'year'` and
 * `'month'` use suffixed keys (`'dashboard:year'` / `'dashboard:month'`).
 * `cache.invalidate('dashboard')` startsWith-matches all three, so any
 * existing mutation that flushes dashboard cache continues to cover the new
 * variants without code changes.
 */
export function useDashboard(period: DashboardPeriod = 'all') {
  const cacheKey = period === 'all' ? 'dashboard' : `dashboard:${period}`;
  const { data, loading, error, refetch } = useQuery<DashboardResponse>(
    cacheKey,
    () => api.dashboard(period),
  );
  return { data: data ?? null, loading, error, refetch };
}
