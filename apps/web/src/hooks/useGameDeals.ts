/**
 * GD-PR1 — single-game deals for the S1 price-offers card. Returns the
 * empty-deals case as `data.deals === []`, NOT null/error, so the card
 * can render an "// no current deals" line without bailing on the page.
 */

import { api } from '../lib/api';
import { useQuery } from './useQuery';
import type { GameDealsResponse } from '@hoard/types';

export function useGameDeals(igdbId: number | undefined) {
  const key = igdbId ? `game:deals:${igdbId}` : '';
  const { data, loading, error, refetch } = useQuery<GameDealsResponse>(
    key,
    () => api.gameDeals(igdbId!),
    { enabled: !!igdbId },
  );
  return { data: data ?? null, loading: !!igdbId && loading, error, refetch };
}
