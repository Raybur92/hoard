import { prisma } from '@hoard/db';
import type { SteamWishlistItem } from './platforms/steam';
import { getGameBySteamId, getReleaseDetails } from './igdb';

/**
 * Pulls Steam wishlist items into Hoard's wishlist surface.
 *
 * For each Steam wishlist appid:
 *   1. Resolve to IGDB via the existing `getGameBySteamId` path (uses
 *      Steam → IGDB external_games mapping; same code path as runSync's
 *      Steam-ID-first lookup).
 *   2. If the user already has any `UserGame` for that game — skip. This
 *      preserves the user's library decision (we never override
 *      Playing / OnHold / Completed / Dropped, and we don't churn an
 *      existing Wishlist row either). Mirrors decision #29.
 *   3. Otherwise: upsert `Game`, create `UserGame(status='Wishlist')`, and
 *      create `WishlistRelease` (using the rich `getReleaseDetails` shape
 *      so the Releases page hero / agenda render properly). Three writes
 *      in one `$transaction` so the client never observes half-applied
 *      state — same shape as `POST /api/upcoming/:igdbId/wishlist`.
 *
 * **No removal in v1.** If a game leaves the user's Steam wishlist (they
 * bought it, or removed it on Steam), the Hoard wishlist row stays until
 * they manually un-star. Adding removal would require source tracking on
 * `UserGame` (so we know which Wishlist UserGames came from Steam) — out
 * of scope for v1; documented in CLAUDE.md "Known gaps."
 *
 * Errors per item are isolated (logged, counted as `errors`) so a single
 * bad IGDB lookup or transaction failure doesn't kill the loop.
 */

export interface ApplySteamWishlistImportResult {
  candidates: number;
  imported: number;
  alreadyHad: number;
  unresolved: number;
  errors: number;
}

export async function applySteamWishlistImport(
  userId: string,
  items: SteamWishlistItem[],
): Promise<ApplySteamWishlistImportResult> {
  let imported = 0;
  let alreadyHad = 0;
  let unresolved = 0;
  let errors = 0;

  for (const item of items) {
    try {
      // 1. Steam-ID → IGDB. Skip if IGDB doesn't have the game (rare but
      // happens for region-locked or recently-delisted titles).
      const igdb = await getGameBySteamId(item.appid);
      if (!igdb) {
        unresolved++;
        continue;
      }

      // 2. Has the user already touched this game? Any UserGame status —
      // including Wishlist — counts as "already there"; skip. We can't
      // hit `userGame.findUnique({ userId_gameId })` directly because we
      // don't have the gameId yet (Steam's appid keys IGDB, not our
      // catalog), so look up Game by igdbId first.
      const game = await prisma.game.findUnique({ where: { igdbId: igdb.igdbId } });
      if (game) {
        const existingUg = await prisma.userGame.findUnique({
          where: { userId_gameId: { userId, gameId: game.id } },
        });
        if (existingUg) {
          alreadyHad++;
          continue;
        }
      }

      // 3. Pull the rich shape so we can populate WishlistRelease the way
      // the manual-star flow does. One extra IGDB call per item, cached.
      const release = await getReleaseDetails(igdb.igdbId);
      if (!release) {
        unresolved++;
        continue;
      }

      const releaseYear = release.releaseDate
        ? new Date(release.releaseDate).getFullYear()
        : null;

      // 4. Atomic three-write transaction — same pattern as
      // `POST /api/upcoming/:igdbId/wishlist`.
      await prisma.$transaction(async (tx) => {
        const g = await tx.game.upsert({
          where: { igdbId: release.igdbId },
          update: {
            title: release.title,
            developer: release.developer,
            releaseYear,
            genres: release.genres,
            // B-IGDB-3 — `release` is an IgdbUpcomingRelease, which now
            // carries themes + playerPerspectives from the IGDB service.
            themes: release.themes,
            playerPerspectives: release.playerPerspectives,
            coverUrl: release.coverUrl,
            // Persist steamAppId on the Game row if it isn't set yet —
            // future Steam syncs will hit the steamAppId-keyed exact match
            // path instead of the title-search fallback (see syncRunner).
            steamAppId: item.appid,
          },
          create: {
            igdbId: release.igdbId,
            title: release.title,
            developer: release.developer,
            releaseYear,
            genres: release.genres,
            themes: release.themes,
            playerPerspectives: release.playerPerspectives,
            coverUrl: release.coverUrl,
            steamAppId: item.appid,
          },
        });

        await tx.userGame.create({
          data: {
            userId,
            gameId: g.id,
            status: 'Wishlist',
            // Use Steam's `addedAt` so the user's wishlist history on
            // Hoard reflects when they actually added the item on Steam.
            addedAt: item.addedAt,
          },
        });

        // WishlistRelease populates the Releases page hero / agenda. We
        // create it for every item — even past-dated ones — because the
        // Releases page filters past releases out at render time, and
        // having the row makes the manual-star flow's invariants hold.
        await tx.wishlistRelease.create({
          data: {
            userId,
            igdbId: release.igdbId,
            title: release.title,
            developer: release.developer,
            releaseDate: release.releaseDate ? new Date(release.releaseDate) : null,
            releaseDateCategory: release.releaseDateCategory,
            platforms: release.platforms,
            genres: release.genres,
            coverUrl: release.coverUrl,
            synopsis: release.synopsis,
            hype: release.hype,
            category: release.category,
          },
        });
      });

      imported++;
    } catch (err) {
      errors++;
      console.error(`[steam wishlist] appid=${item.appid}:`, err instanceof Error ? err.message : err);
    }
  }

  return { candidates: items.length, imported, alreadyHad, unresolved, errors };
}
