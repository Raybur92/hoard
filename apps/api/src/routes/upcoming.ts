import { Router, Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { getGame } from '../services/igdb';
import type { WishlistRelease } from '@hoard/types';

const router = Router();

function mapRelease(w: {
  id: string; igdbId: number; title: string; developer: string | null;
  releaseDate: Date | null; releaseDateCategory: string; platforms: string[];
  genres: string[]; userId: string; hype: number | null; synopsis: string | null;
  coverUrl: string | null;
}): WishlistRelease {
  return {
    id: w.id,
    igdbId: w.igdbId,
    title: w.title,
    developer: w.developer,
    releaseDate: w.releaseDate?.toISOString() ?? null,
    releaseDateCategory: w.releaseDateCategory as WishlistRelease['releaseDateCategory'],
    platforms: w.platforms,
    genres: w.genres,
    userId: w.userId,
    hype: w.hype,
    synopsis: w.synopsis,
    coverUrl: w.coverUrl,
  };
}

// GET /api/upcoming — user's wishlisted releases from DB
router.get('/upcoming', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const { platform } = req.query as Record<string, string | undefined>;

  const releases = await prisma.wishlistRelease.findMany({
    where: { userId },
    orderBy: [{ releaseDate: { sort: 'asc', nulls: 'last' } }],
  });

  let results = releases.map(mapRelease);

  if (platform) {
    const p = platform.toUpperCase();
    results = results.filter((r) =>
      r.platforms.some((pl) => pl.toUpperCase().includes(p)),
    );
  }

  res.json(results);
});

// POST /api/upcoming/:igdbId/wishlist — toggle tracking
// When adding: fetches metadata from IGDB to persist a WishlistRelease record.
// When removing: deletes the existing record.
router.post('/upcoming/:igdbId/wishlist', requireUser, async (req: Request, res: Response): Promise<void> => {
  const igdbId = parseInt(String(req.params['igdbId'] ?? ''), 10);
  if (isNaN(igdbId)) {
    res.status(400).json({ error: 'Invalid igdbId' });
    return;
  }

  const existing = await prisma.wishlistRelease.findFirst({
    where: { userId: req.userId, igdbId },
  });

  if (existing) {
    await prisma.wishlistRelease.delete({ where: { id: existing.id } });
    res.json({ tracked: false });
    return;
  }

  // Fetch from IGDB to populate the record
  let igdbGame;
  try {
    igdbGame = await getGame(igdbId);
  } catch {
    igdbGame = null;
  }

  if (!igdbGame) {
    res.status(404).json({ error: 'Game not found in IGDB' });
    return;
  }

  const release = await prisma.wishlistRelease.create({
    data: {
      userId: req.userId,
      igdbId,
      title: igdbGame.title,
      developer: igdbGame.developer,
      releaseDate: null,
      releaseDateCategory: 'TBA',
      platforms: [],
      genres: igdbGame.genres,
      coverUrl: igdbGame.coverUrl,
    },
  });

  res.json({ tracked: true, release: mapRelease(release) });
});

export default router;
