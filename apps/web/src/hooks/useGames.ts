import { api, type GamesParams } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery, type UseQueryOptions } from './useQuery';
import type { GameListResponse } from '@hoard/types';

export function useGames(params?: GamesParams, opts?: UseQueryOptions) {
  const key = `games:${JSON.stringify(params ?? {})}`;
  const { data, loading, error } = useQuery<GameListResponse>(
    key,
    () => api.games(params),
    opts,
  );
  return {
    data: data ?? null,
    loading,
    error,
    refetch: () => cache.invalidate('games:'),
  };
}
