// DO NOT RENAME — see docs/RELEASES_PLAN.md §1 (decision D1). The Upcoming →
// Releases rename is URL + UI labels only. The backend routes here
// (/api/upcoming, /api/upcoming/:igdbId/wishlist) stay. The new
// /api/releases/recent endpoint (planned in R1) is added alongside, not as a
// replacement. Renaming the existing routes here would break the frontend's
// existing useUpcoming hook for zero gain.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { getReleaseDetails } from '../services/igdb';
import type { WishlistRelease } from '@hoard/types';

const router = Router();

function mapRelease(w: {
  id: string; igdbId: number; title: string; developer: string | null;
  releaseDate: Date | null; releaseDateCategory: string; platforms: string[];
  genres: string[]; userId: string; hype: number | null; synopsis: string | null;
  coverUrl: string | null; category: number;
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
    category: w.category,
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

  // Fetch the rich upcoming-release shape from IGDB so the persisted record
  // keeps releaseDate / platforms / synopsis / hype / category / releaseDateCategory
  // (PR B — Path-B persistence fix). Previous code path used getGame() which
  // returns the slimmer IgdbSearchResult and silently dropped half the fields.
  let igdbRelease;
  try {
    igdbRelease = await getReleaseDetails(igdbId);
  } catch {
    igdbRelease = null;
  }

  if (!igdbRelease) {
    res.status(404).json({ error: 'Game not found in IGDB' });
    return;
  }

  const release = await prisma.wishlistRelease.create({
    data: {
      userId: req.userId,
      igdbId,
      title: igdbRelease.title,
      developer: igdbRelease.developer,
      releaseDate: igdbRelease.releaseDate ? new Date(igdbRelease.releaseDate) : null,
      releaseDateCategory: igdbRelease.releaseDateCategory,
      platforms: igdbRelease.platforms,
      genres: igdbRelease.genres,
      coverUrl: igdbRelease.coverUrl,
      synopsis: igdbRelease.synopsis,
      hype: igdbRelease.hype,
      category: igdbRelease.category,
    },
  });

  res.json({ tracked: true, release: mapRelease(release) });
});

export default router;
