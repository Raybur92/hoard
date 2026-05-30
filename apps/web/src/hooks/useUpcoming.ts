// ┌──────────────────────────────────────────────────────────────────────────┐
// │ DO NOT RENAME — see docs/RELEASES_PLAN.md §1 (decision D1).              │
// │                                                                          │
// │ The Upcoming page is being reworked into the Releases page. The rename   │
// │ is URL + UI labels ONLY. This hook stays `useUpcoming`. The type stays   │
// │ `IgdbUpcomingRelease`. The backend routes stay `/api/igdb/upcoming` and  │
// │ `/api/upcoming/:igdbId/wishlist`. The DB table stays `WishlistRelease`.  │
// │                                                                          │
// │ Renaming any of these is the kind of mistake the rename-rule CI check    │
// │ (scripts/check-rename-rule.ts) is meant to catch. If you find yourself   │
// │ doing it, stop and re-read RELEASES_PLAN.md §1.                          │
// └──────────────────────────────────────────────────────────────────────────┘
import { api } from '../lib/api';
import * as cache from '../lib/cache';
import { useQuery } from './useQuery';
import type { IgdbUpcomingRelease } from '@hoard/types';

export type UpcomingScope = 'my-platforms' | 'all' | 'wishlist';

async function fetchUpcoming(scope: UpcomingScope): Promise<IgdbUpcomingRelease[]> {
  try {
    return await api.igdbUpcoming(scope);
  } catch {
    // IGDB unavailable — fall back to wishlist-only feed.
    // Post-PR-B persistence fix: WishlistRelease rows now keep releaseDate /
    // platforms / synopsis / hype / category, so the fallback is full-fidelity
    // for `wishlist` scope and a graceful subset for the others.
    const fallback = await api.upcoming();
    return fallback.map((w) => ({
      igdbId: w.igdbId,
      title: w.title,
      developer: w.developer,
      releaseDate: w.releaseDate,
      releaseDateCategory: w.releaseDateCategory,
      platforms: w.platforms,
      genres: w.genres,
      // B-IGDB-3 — WishlistRelease fallback doesn't snapshot themes /
      // perspectives. Cards don't display these axes; [] is fine.
      themes: [],
      playerPerspectives: [],
      coverUrl: w.coverUrl,
      synopsis: w.synopsis,
      wishlisted: true,
      category: w.category,
      hype: w.hype,
      // Fallback path doesn't have access to the UserGame join — links will
      // not navigate. The primary path (api.igdbUpcoming) does populate this.
      userGameId: null,
      // Same caveat for REL-PR1: WishlistRelease doesn't carry the
      // per-platform wishlist context (it lives on UserGame.wishlistedPlatforms,
      // which requires the join). Empty = generic platform rendering on the
      // card — acceptable degradation for an IGDB-outage fallback.
      wishlistedPlatforms: [],
    }));
  }
}

export function useUpcoming(scope: UpcomingScope = 'my-platforms') {
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
