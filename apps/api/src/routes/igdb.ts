import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/user';
import { searchGames, getUpcomingReleases, platformCodesToIgdbIds } from '../services/igdb';
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

const upcomingQuerySchema = z.object({
  scope: z.enum(['my-platforms', 'all']).default('my-platforms'),
});

// GET /api/igdb/upcoming?scope=my-platforms|all
router.get('/igdb/upcoming', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const { scope } = upcomingQuerySchema.parse(req.query);
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
