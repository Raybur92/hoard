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
import { requireActive } from '../middleware/active';
import { getReleaseDetails } from '../services/igdb';
import { logEvent } from '../services/userEvents';
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
router.get('/upcoming', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
//
// Creates BOTH a `WishlistRelease` row (release-tracking metadata: date, hype,
// category, etc.) AND a `UserGame` with status='Wishlist' (so the game shows
// up in search, the Library Wishlist shelf, and has a working detail page).
// The two tables stay separate but are kept in sync at this boundary.
//
// Idempotency rules:
//  - If the user already has a UserGame for this game with a non-Wishlist
//    status (e.g. they own it and starred it for DLC tracking), we leave the
//    UserGame alone. The WishlistRelease is the only authoritative record of
//    the star.
//  - On un-star, we delete the UserGame ONLY if its status is still 'Wishlist'.
//    If the user manually moved it to Backlog/Playing/etc, the un-star removes
//    the release-tracking record but the library entry survives.
router.post('/upcoming/:igdbId/wishlist', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const igdbId = parseInt(String(req.params['igdbId'] ?? ''), 10);
  if (isNaN(igdbId)) {
    res.status(400).json({ error: 'Invalid igdbId' });
    return;
  }
  const userId = req.userId;

  const existing = await prisma.wishlistRelease.findFirst({
    where: { userId, igdbId },
  });

  if (existing) {
    // Un-star: drop the WishlistRelease, and the auto-created UserGame iff
    // its status is still 'Wishlist'. `deleteMany` is a no-op when no row
    // matches the where clause — safe whether the UserGame was deleted
    // already, never created, or manually moved off the Wishlist shelf.
    const game = await prisma.game.findUnique({ where: { igdbId }, select: { id: true } });
    if (game) {
      await prisma.userGame.deleteMany({
        where: { userId, gameId: game.id, status: 'Wishlist' },
      });
    }
    await prisma.wishlistRelease.delete({ where: { id: existing.id } });
    // TL1.2 wishlist.toggled — un-star branch.
    await logEvent(userId, 'wishlist.toggled', { igdbId, action: 'remove' });
    res.json({ tracked: false });
    return;
  }

  // Star: fetch the rich upcoming-release shape from IGDB. Without it we
  // can't populate the catalog Game row, so 404 if IGDB doesn't recognise
  // the id.
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

  const releaseYear = igdbRelease.releaseDate
    ? new Date(igdbRelease.releaseDate).getFullYear()
    : null;

  // Three writes wrapped in a transaction so the client never observes a
  // half-applied state where the Game exists but the UserGame doesn't (or
  // vice versa). Callback form is needed because the UserGame upsert needs
  // the gameId returned by the Game upsert.
  const release = await prisma.$transaction(async (tx) => {
    const game = await tx.game.upsert({
      where: { igdbId },
      // Refresh metadata in case IGDB has updated since the last sync.
      update: {
        title: igdbRelease.title,
        developer: igdbRelease.developer,
        releaseYear,
        genres: igdbRelease.genres,
        coverUrl: igdbRelease.coverUrl,
      },
      create: {
        igdbId,
        title: igdbRelease.title,
        developer: igdbRelease.developer,
        releaseYear,
        genres: igdbRelease.genres,
        coverUrl: igdbRelease.coverUrl,
      },
    });

    // Empty `update` is intentional — if a UserGame already exists for this
    // user (e.g. status='Backlog' because the game is already owned), we
    // don't override the user's library decision. The WishlistRelease row
    // captures the star independently.
    await tx.userGame.upsert({
      where: { userId_gameId: { userId, gameId: game.id } },
      update: {},
      create: { userId, gameId: game.id, status: 'Wishlist' },
    });

    return tx.wishlistRelease.create({
      data: {
        userId,
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
  });

  // TL1.2 wishlist.toggled — star branch. Fired after the $transaction
  // succeeds so we don't log a star that didn't actually persist.
  await logEvent(userId, 'wishlist.toggled', { igdbId, action: 'add' });

  res.json({ tracked: true, release: mapRelease(release) });
});

export default router;
