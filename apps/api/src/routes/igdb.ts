import { Router, Request, Response } from 'express';
import { requireUser } from '../middleware/user';
import { searchGames, getUpcomingReleases } from '../services/igdb';
import { prisma } from '@hoard/db';
import type { IgdbSearchResult, IgdbUpcomingRelease } from '@hoard/types';

const router = Router();

// GET /api/igdb/search?q=...
router.get('/igdb/search', requireUser, async (req: Request, res: Response): Promise<void> => {
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

// GET /api/igdb/upcoming
router.get('/igdb/upcoming', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  try {
    const [games, wishlisted] = await Promise.all([
      getUpcomingReleases(),
      prisma.wishlistRelease.findMany({
        where: { userId },
        select: { igdbId: true },
      }),
    ]);

    const wishlistedIds = new Set(wishlisted.map((w) => w.igdbId));

    const result: IgdbUpcomingRelease[] = games.map((g) => ({
      ...g,
      wishlisted: wishlistedIds.has(g.igdbId),
    }));

    res.json(result);
  } catch (err) {
    console.error('[igdb/upcoming] error:', err);
    res.status(503).json({ error: 'IGDB upcoming unavailable' });
  }
});

export default router;
