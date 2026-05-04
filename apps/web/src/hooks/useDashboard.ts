import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { DashboardResponse } from '@hoard/types';

export function useDashboard() {
  const { data, loading, error } = useQuery<DashboardResponse>(
    'dashboard',
    () => api.dashboard(),
  );
  return { data: data ?? null, loading, error };
}
