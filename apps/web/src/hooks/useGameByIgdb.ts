/**
 * GD-PR1 — fetch the state-classified GameDetail v2 payload for an IGDB
 * id. The hook is the entry point for the new /game/:igdbId route; the
 * dispatcher component reads `data.state` and routes to the matching
 * surface (S1 ships in GD-PR1; S2/S3/S4 fall back to today's components
 * pending GD-PR2/3/4).
 */

import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { GameDetailResponse } from '@hoard/types';

export function useGameByIgdb(igdbId: number | undefined) {
  const key = igdbId ? `game:igdb:${igdbId}` : '';
  const { data, loading, error, refetch } = useQuery<GameDetailResponse>(
    key,
    () => api.gameByIgdb(igdbId!),
    { enabled: !!igdbId },
  );

  /**
   * Optimistic local update so a status change / notes edit re-renders
   * the page instantly while the SWR background refetch catches up.
   * Mutates the underlying cache so any other subscriber to the same
   * key sees the optimistic value.
   */
  function update(patch: Partial<GameDetailResponse>): void {
    if (!igdbId || !data) return;
    cache.set(key, { ...data, ...patch });
  }

  return { data: data ?? null, loading: !!igdbId && loading, error, refetch, update };
}
