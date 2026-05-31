import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import { searchGames, getUpcomingReleases, platformCodesToIgdbIds } from '../services/igdb';
import { prisma } from '@hoard/db';
import type { IgdbSearchResult, IgdbUpcomingRelease } from '@hoard/types';

const router = Router();

// GET /api/igdb/search?q=...
router.get('/igdb/search', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
  if (!q || q.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }

  try {
    const results: IgdbSearchResult[] = await searchGames(q);
    res.json(results);
  } catch (err) {
    console.error('[igdb/search] error:', err);
    res.status(503).json({ error: 'IGDB search unavailable' });
  }
});

const upcomingQuerySchema = z.object({
  scope: z.enum(['my-platforms', 'all', 'wishlist']).default('my-platforms'),
});

import type { ReleaseDateCategory } from '@hoard/types';

// GET /api/igdb/upcoming?scope=my-platforms|all|wishlist
//
// `wishlist` was added in PR B (D1). Returns the user's persisted
// WishlistRelease rows shaped exactly like the live IGDB feed, so the chip
// labelled "wishlist" finally means what it says — was previously aliased to
// `my-platforms`, which silently filtered tracked releases by hype + platform.
interface UserGameInfo {
  id: string;
  wishlistedPlatforms: string[];
}

/**
 * Build a Map<igdbId, UserGameInfo> for the given user, scoped to a set of
 * igdbIds. Returns BOTH the library-row id (for /game/${userGameId}
 * navigation) AND the per-platform wishlist context (REL-PR1 chip
 * rendering). Returns an empty map when the input is empty.
 */
async function userGameMap(userId: string, igdbIds: number[]): Promise<Map<number, UserGameInfo>> {
  if (igdbIds.length === 0) return new Map();
  const rows = await prisma.userGame.findMany({
    where: { userId, game: { igdbId: { in: igdbIds } } },
    select: { id: true, wishlistedPlatforms: true, game: { select: { igdbId: true } } },
  });
  return new Map(rows.map((r) => [r.game.igdbId, { id: r.id, wishlistedPlatforms: r.wishlistedPlatforms ?? [] }]));
}

router.get('/igdb/upcoming', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const { scope } = upcomingQuerySchema.parse(req.query);

  // Wishlist scope reads directly from the DB — no IGDB round trip and no
  // hype/platform filtering. Matches the user's intuition that "wishlist"
  // shows everything I've starred.
  if (scope === 'wishlist') {
    const releases = await prisma.wishlistRelease.findMany({
      where: { userId },
      orderBy: [{ releaseDate: { sort: 'asc', nulls: 'last' } }],
    });
    const ugMap = await userGameMap(userId, releases.map((r) => r.igdbId));
    const result: IgdbUpcomingRelease[] = releases.map((w) => {
      const info = ugMap.get(w.igdbId);
      return {
        igdbId: w.igdbId,
        title: w.title,
        developer: w.developer,
        releaseDate: w.releaseDate?.toISOString() ?? null,
        releaseDateCategory: w.releaseDateCategory as ReleaseDateCategory,
        platforms: w.platforms,
        genres: w.genres,
        // B-IGDB-3 — WishlistRelease doesn't snapshot themes / perspectives
        // (only genres). Wishlist scope serves the wishlist rows directly,
        // so themes + perspectives default to []. If Releases cards ever
        // want to display these axes, extend the WishlistRelease model with
        // a parallel snapshot column. For now Releases cards render only
        // platforms + genres, so [] is fine.
        themes: [],
        playerPerspectives: [],
        coverUrl: w.coverUrl,
        // WishlistRelease doesn't snapshot heroImageUrl. For wishlist-scope
        // rendering the Library OVERVIEW landscape cards aren't shown
        // (Releases uses portrait covers), so null is fine here.
        heroImageUrl: null,
        synopsis: w.synopsis,
        wishlisted: true,
        category: w.category,
        hype: w.hype,
        userGameId: info?.id ?? null,
        wishlistedPlatforms: info?.wishlistedPlatforms ?? [],
      };
    });
    res.json(result);
    return;
  }

  const allPlatforms = scope === 'all';

  try {
    const [user, platforms, wishlisted] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { hypeThreshold: true } }),
      prisma.platform.findMany({ where: { userId }, select: { code: true } }),
      prisma.wishlistRelease.findMany({ where: { userId }, select: { igdbId: true } }),
    ]);

    const hypeThreshold = user?.hypeThreshold ?? 5;
    const platformCodes = platforms.map((p) => p.code as string);
    const platformIds = allPlatforms ? [] : platformCodesToIgdbIds(platformCodes);

    const games = await getUpcomingReleases({ platformIds, allPlatforms, hypeThreshold });

    const wishlistedIds = new Set(wishlisted.map((w) => w.igdbId));
    const ugMap = await userGameMap(userId, games.map((g) => g.igdbId));
    const result: IgdbUpcomingRelease[] = games.map((g) => {
      const info = ugMap.get(g.igdbId);
      return {
        ...g,
        wishlisted: wishlistedIds.has(g.igdbId),
        userGameId: info?.id ?? null,
        wishlistedPlatforms: info?.wishlistedPlatforms ?? [],
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[igdb/upcoming] error:', err);
    res.status(503).json({ error: 'IGDB upcoming unavailable' });
  }
});

export default router;
