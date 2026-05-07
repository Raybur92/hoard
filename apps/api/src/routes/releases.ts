// New /api/releases/* surface for the Releases page rework. Per RELEASES_PLAN.md
// §1 (D1), this is the ONLY sanctioned new route prefix — `/api/upcoming/...`
// and `/api/igdb/upcoming` stay as they are. The `scripts/check-rename-rule.ts`
// CI guard enforces this: it allows `/api/releases/recent` but flags any other
// `/api/releases/...` path. If a future workstream legitimately needs more
// endpoints under `/api/releases`, update the guard alongside the route.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { getRecentlyReleased } from '../services/igdb';
import type { IgdbUpcomingRelease, ReleaseDateCategory } from '@hoard/types';

const router = Router();

/** 14-day window per handoff §4. Constant — not configurable. */
const RECENT_WINDOW_DAYS = 14;
/** Muted-banner hype floor per handoff §4 (constant in banner logic, NOT the user's hypeThreshold). */
const HYPE_THRESHOLD = 80;

/**
 * Map a persisted `WishlistRelease` row to the `IgdbUpcomingRelease` shape
 * the Releases page consumes. Drops the unused DB pk + userId fields per
 * RELEASES_PLAN.md D7 (unified response shape).
 */
function wishlistRowToUpcoming(w: {
  igdbId: number;
  title: string;
  developer: string | null;
  releaseDate: Date | null;
  releaseDateCategory: string;
  platforms: string[];
  genres: string[];
  coverUrl: string | null;
  synopsis: string | null;
  hype: number | null;
  category: number;
}): IgdbUpcomingRelease {
  return {
    igdbId: w.igdbId,
    title: w.title,
    developer: w.developer,
    releaseDate: w.releaseDate?.toISOString() ?? null,
    releaseDateCategory: w.releaseDateCategory as ReleaseDateCategory,
    platforms: w.platforms,
    genres: w.genres,
    coverUrl: w.coverUrl,
    synopsis: w.synopsis,
    wishlisted: true,  // every row in `starred` is by definition wishlisted
    category: w.category,
    hype: w.hype,
  };
}

/**
 * GET /api/releases/recent
 *
 * Powers the RECENT page and the muted/green banner qualification on the
 * Releases page. Returns two lists, both shaped as `IgdbUpcomingRelease[]`
 * (D7 — unified response). The `wishlisted` flag distinguishes them:
 *
 *   - `starred` (wishlisted: true)  — user's WishlistRelease rows where
 *     releaseDate ∈ [today - 14d, today] AND not in the user's library.
 *
 *   - `hyped`   (wishlisted: false) — IGDB feed where first_release_date is
 *     in the same 14-day window AND `hypes >= 80`. Deduped against `starred`
 *     by igdbId so the same release never appears twice.
 *
 * Library-membership filter: a release is "in the library" if a UserGame
 * row exists for this user where userGame.game.igdbId === release.igdbId.
 *
 * The banner conditional logic on the client uses this endpoint's response
 * directly — `starred.length` drives green-prominent, `hyped.length` drives
 * the muted variant when starred is empty. See handoff §4.
 */
router.get('/releases/recent', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  const now = new Date();
  const fromDate = new Date(now.getTime() - RECENT_WINDOW_DAYS * 86400 * 1000);

  // Pull the user's wishlist rows in the 14-day window.
  const wishlistRows = await prisma.wishlistRelease.findMany({
    where: {
      userId,
      releaseDate: { gte: fromDate, lte: now },
    },
    orderBy: { releaseDate: 'desc' },
  });

  // Library-membership filter: drop wishlist rows whose igdbId already exists
  // as a UserGame for this user (library sync picked it up).
  const wishlistIgdbIds = wishlistRows.map((w) => w.igdbId);
  let starredRows = wishlistRows;
  if (wishlistIgdbIds.length > 0) {
    const ownedGames = await prisma.userGame.findMany({
      where: { userId, game: { igdbId: { in: wishlistIgdbIds } } },
      select: { game: { select: { igdbId: true } } },
    });
    const ownedIgdbIds = new Set(ownedGames.map((ug) => ug.game.igdbId));
    starredRows = wishlistRows.filter((w) => !ownedIgdbIds.has(w.igdbId));
  }
  const starred: IgdbUpcomingRelease[] = starredRows.map(wishlistRowToUpcoming);

  // Hyped feed — pull the IGDB recent feed, dedupe against starred.
  let hyped: IgdbUpcomingRelease[] = [];
  try {
    const fromTs = Math.floor(fromDate.getTime() / 1000);
    const toTs = Math.floor(now.getTime() / 1000);
    const feed = await getRecentlyReleased({ fromTs, toTs, minHype: HYPE_THRESHOLD });
    const starredIds = new Set(starred.map((s) => s.igdbId));
    hyped = feed.filter((r) => !starredIds.has(r.igdbId));
  } catch (err) {
    // IGDB unavailable — degrade gracefully. The starred list is the user's
    // own data and is independent of IGDB; we serve what we have.
    console.error('[releases/recent] IGDB recently-released fetch failed:', err);
  }

  res.json({ starred, hyped });
});

export default router;
