import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { IgdbUpcomingRelease } from '@hoard/types';

async function fetchUpcoming(scope: 'my-platforms' | 'all'): Promise<IgdbUpcomingRelease[]> {
  try {
    return await api.igdbUpcoming(scope);
  } catch {
    // IGDB unavailable — fall back to wishlist-only feed.
    const fallback = await api.upcoming();
    return fallback.map((w) => ({
      igdbId: w.igdbId,
      title: w.title,
      developer: w.developer,
      releaseDate: w.releaseDate,
      releaseDateCategory: w.releaseDateCategory,
      platforms: w.platforms,
      genres: w.genres,
      coverUrl: w.coverUrl,
      synopsis: w.synopsis,
      wishlisted: true,
      category: 0,
      hype: w.hype,
    }));
  }
}

export function useUpcoming(scope: 'my-platforms' | 'all' = 'my-platforms') {
  const key = `upcoming:${scope}`;
  const { data, loading, error } = useQuery<IgdbUpcomingRelease[]>(
    key,
    () => fetchUpcoming(scope),
  );
  return {
    data: data ?? null,
    loading,
    error,
    refetch: () => cache.invalidate('upcoming:'),
  };
}
