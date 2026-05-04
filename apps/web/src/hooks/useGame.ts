import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { UserGameDetail } from '@hoard/types';

export function useGame(id: string | undefined) {
  const key = id ? `game:${id}` : '';
  const { data, loading, error } = useQuery<UserGameDetail>(
    key,
    () => api.game(id!),
    { enabled: !!id },
  );

  function update(patch: Partial<UserGameDetail>): void {
    if (!id || !data) return;
    cache.set(`game:${id}`, { ...data, ...patch });
  }

  return { data: data ?? null, loading: !!id && loading, error, update };
}
