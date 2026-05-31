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
import { requireActive } from '../middleware/active';
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
 * RELEASES_PLAN.md D7 (unified response shape). REL-PR1 added the
 * `wishlistedPlatforms` field so the client can render per-platform
 * wishlist context (`// wishlisted: PS5 · Switch`) when applicable.
 */
function wishlistRowToUpcoming(
  w: {
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
  },
  userGameId: string | null,
  wishlistedPlatforms: string[],
): IgdbUpcomingRelease {
  return {
    igdbId: w.igdbId,
    title: w.title,
    developer: w.developer,
    releaseDate: w.releaseDate?.toISOString() ?? null,
    releaseDateCategory: w.releaseDateCategory as ReleaseDateCategory,
    platforms: w.platforms,
    genres: w.genres,
    // B-IGDB-3 — WishlistRelease doesn't snapshot themes / perspectives
    // (see igdb.ts wishlist-scope branch comment). Default []; Releases
    // cards don't display these axes today.
    themes: [],
    playerPerspectives: [],
    coverUrl: w.coverUrl,
    // WishlistRelease doesn't snapshot heroImageUrl (see igdb.ts wishlist
    // branch comment); null is acceptable for Releases-card rendering.
    heroImageUrl: null,
    synopsis: w.synopsis,
    wishlisted: true,  // every row in `starred` is by definition wishlisted
    category: w.category,
    hype: w.hype,
    userGameId,
    wishlistedPlatforms,
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
router.get('/releases/recent', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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

  // Library-membership filter: drop wishlist rows whose game is in the user's
  // library AS SOMETHING OTHER THAN Wishlist (i.e., a real library state —
  // Backlog, Playing, etc.). Wishlist UserGames are now auto-created by the
  // toggle endpoint, so requiring "no UserGame at all" would drop everything.
  // The handoff §10 intent is "not yet owned" — Wishlist shelf is "wanted but
  // not owned", so it qualifies for RECENT.
  const wishlistIgdbIds = wishlistRows.map((w) => w.igdbId);
  let starredRows = wishlistRows;
  // REL-PR1 — track BOTH id (for navigation) AND wishlistedPlatforms (for
  // chip rendering) per UserGame.
  let userGameInfoByIgdbId = new Map<number, { id: string; wishlistedPlatforms: string[] }>();
  if (wishlistIgdbIds.length > 0) {
    const userGames = await prisma.userGame.findMany({
      where: { userId, game: { igdbId: { in: wishlistIgdbIds } } },
      select: { id: true, status: true, wishlistedPlatforms: true, game: { select: { igdbId: true } } },
    });
    const ownedNonWishlistIds = new Set(
      userGames.filter((ug) => ug.status !== 'Wishlist').map((ug) => ug.game.igdbId),
    );
    starredRows = wishlistRows.filter((w) => !ownedNonWishlistIds.has(w.igdbId));
    userGameInfoByIgdbId = new Map(
      userGames.map((ug) => [ug.game.igdbId, { id: ug.id, wishlistedPlatforms: ug.wishlistedPlatforms ?? [] }]),
    );
  }
  const starred: IgdbUpcomingRelease[] = starredRows.map((w) => {
    const info = userGameInfoByIgdbId.get(w.igdbId);
    return wishlistRowToUpcoming(w, info?.id ?? null, info?.wishlistedPlatforms ?? []);
  });

  // Hyped feed — pull the IGDB recent feed, dedupe against starred. Tag each
  // row with userGameId iff the user happens to have it in library (rare for
  // hyped — these are by definition non-wishlisted — but possible if e.g.
  // platform sync just imported a game that hadn't been wishlisted).
  let hyped: IgdbUpcomingRelease[] = [];
  try {
    const fromTs = Math.floor(fromDate.getTime() / 1000);
    const toTs = Math.floor(now.getTime() / 1000);
    const feed = await getRecentlyReleased({ fromTs, toTs, minHype: HYPE_THRESHOLD });
    const starredIds = new Set(starred.map((s) => s.igdbId));
    const candidates = feed.filter((r) => !starredIds.has(r.igdbId));

    if (candidates.length > 0) {
      const hypedUserGames = await prisma.userGame.findMany({
        where: { userId, game: { igdbId: { in: candidates.map((c) => c.igdbId) } } },
        select: { id: true, wishlistedPlatforms: true, game: { select: { igdbId: true } } },
      });
      const hypedUgMap = new Map(
        hypedUserGames.map((ug) => [ug.game.igdbId, { id: ug.id, wishlistedPlatforms: ug.wishlistedPlatforms ?? [] }]),
      );
      hyped = candidates.map((r) => {
        const info = hypedUgMap.get(r.igdbId);
        return {
          ...r,
          userGameId: info?.id ?? null,
          wishlistedPlatforms: info?.wishlistedPlatforms ?? [],
        };
      });
    } else {
      hyped = candidates;
    }
  } catch (err) {
    // IGDB unavailable — degrade gracefully. The starred list is the user's
    // own data and is independent of IGDB; we serve what we have.
    console.error('[releases/recent] IGDB recently-released fetch failed:', err);
  }

  res.json({ starred, hyped });
});

export default router;
