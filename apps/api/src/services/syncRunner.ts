import { prisma } from '@hoard/db';
import { Prisma } from '@prisma/client';
import type { PlatformCode } from '@hoard/types';
import {
  searchGames,
  getGameBySteamId,
  getGameByPsnConceptId,
  getGameByXboxTitleId,
  getGameByGogAppId,
  getGameByItchGameId,
  getGameByEpicCatalogItemId,
  getGameByNintendoTitleId,
  getTimeToBeat,
  searchGameLocalizations,
} from './igdb';
import { pickBestMatch } from './igdbMatch';
import { fetchHltbWithFallback } from './hltb';
import { promoteWishlistOnOwnership } from '../lib/promoteWishlist';
import type { SyncedGame } from './platforms/steam';

export interface SyncResult {
  imported: number;
  skipped: number;
  /** Titles that fell through both IGDB resolution paths (Steam-ID lookup
   *  + smart matcher) — surfaced in the activity log so users can see
   *  which games sync isn't catching. Trimmed to a sane size by the
   *  caller before logging. */
  skippedTitles: string[];
  /** Titles that threw mid-import — distinct from `skippedTitles` because
   *  these failed AFTER IGDB resolution succeeded (DB write error, etc).
   *  Logged at the same time for the same reason. */
  errorTitles: string[];
  /** Per-error short messages keyed by title, in the same order as
   *  errorTitles. Diagnostic — surfaces the actual failure reason in the
   *  activity log so we don't need Railway access to know what's wrong. */
  errorMessages: Record<string, string>;
  /** Platform-side IDs that were available when a title hit the skipped
   *  path. Tells us whether the upstream platform API surfaced its
   *  stable identifier — if `psnConceptId` is in the map for a skipped
   *  PSN title, that means psn-api gave us one but the IGDB
   *  external_games lookup missed (gap is IGDB-side). If it's absent,
   *  psn-api itself didn't return a concept (gap is Sony-side). */
  skippedIds: Record<string, { psnConceptId?: number; xboxTitleId?: number; gogAppId?: number; steamAppId?: number; itchGameId?: number; epicCatalogItemId?: string; nintendoTitleId?: string }>;
}

// Stay comfortably under the IGDB 4 req/s rate limit
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerHltbBackground(
  gameId: string,
  title: string,
  steamAppId: number | null | undefined,
  igdbId: number,
): Promise<void> {
  void (async () => {
    // IGDB time_to_beat lives at /game_time_to_beats — fetch on-demand only
    // when we'll actually need a fallback. The HLTB Steam-ID lookup runs first
    // inside fetchHltbWithFallback, so this extra IGDB call only happens when
    // the Steam-ID path missed (or there was no Steam ID to try).
    let igdbTimeToBeat: Awaited<ReturnType<typeof getTimeToBeat>> = null;
    try {
      igdbTimeToBeat = await getTimeToBeat(igdbId);
    } catch { /* IGDB unreachable / rate-limited — fall through with null */ }
    const result = await fetchHltbWithFallback(title, steamAppId, igdbTimeToBeat);
    if (!result) return;
    if (result.hltbId || result.gogAppId) {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          ...(result.hltbId ? { hltbId: result.hltbId } : {}),
          ...(result.gogAppId ? { gogAppId: result.gogAppId } : {}),
        },
      });
    }
    await prisma.hltbData.upsert({
      where: { gameId },
      update: {
        mainStory: result.mainStory,
        mainExtras: result.mainExtras,
        completionist: result.completionist,
        source: result.source,
        fetchedAt: new Date(),
      },
      create: {
        gameId,
        mainStory: result.mainStory,
        mainExtras: result.mainExtras,
        completionist: result.completionist,
        source: result.source,
      },
    });
  })();
}

export async function runSync(
  userId: string,
  syncedGames: SyncedGame[],
): Promise<SyncResult> {
  let imported = 0;
  let skipped = 0;
  const skippedTitles: string[] = [];
  const errorTitles: string[] = [];
  const errorMessages: Record<string, string> = {};
  // Per-title diagnostic — captures platform-side IDs for skipped/errored
  // games so the activity log can show "Lego Batman" → psnConceptId X.
  // Tells us whether the gap is "psn-api didn't return concept.id" vs
  // "IGDB doesn't have external_games for this concept" without needing
  // to run separate diagnostic scripts.
  const skippedIds: Record<string, { psnConceptId?: number; xboxTitleId?: number; gogAppId?: number; steamAppId?: number; itchGameId?: number; epicCatalogItemId?: string; nintendoTitleId?: string }> = {};

  for (const sg of syncedGames) {
    try {
      // N-series resolution order — try the stable platform-side ID
      // (Steam appid / PSN conceptId / Xbox titleId / GOG appid) FIRST
      // via IGDB external_games. Bypasses fuzzy title matching entirely,
      // which is critical for non-English platform accounts where the
      // sync returns localized titles (Andrea's Italian PSN reporting
      // "LEGO Batman: L'Eredità del Cavaliere Oscuro" against IGDB's
      // canonical English "Legacy of the Dark Knight"). If no platform
      // ID is available OR the lookup misses (IGDB doesn't have an
      // external_games row for this UID), fall back to text search with
      // the smart matcher (igdbMatch.ts), then to the L-series
      // localization fallback for any remaining localized titles.
      let igdbGame = sg.steamAppId ? await getGameBySteamId(sg.steamAppId) : null;
      if (!igdbGame && sg.psnConceptId) {
        igdbGame = await getGameByPsnConceptId(sg.psnConceptId);
      }
      if (!igdbGame && sg.xboxTitleId) {
        igdbGame = await getGameByXboxTitleId(sg.xboxTitleId);
      }
      if (!igdbGame && sg.gogAppId) {
        igdbGame = await getGameByGogAppId(sg.gogAppId);
      }
      if (!igdbGame && sg.itchGameId) {
        igdbGame = await getGameByItchGameId(sg.itchGameId);
      }
      if (!igdbGame && sg.epicCatalogItemId) {
        igdbGame = await getGameByEpicCatalogItemId(sg.epicCatalogItemId);
      }
      if (!igdbGame && sg.nintendoTitleId) {
        igdbGame = await getGameByNintendoTitleId(sg.nintendoTitleId);
      }
      if (!igdbGame) {
        const results = await searchGames(sg.igdbSearchTitle);
        igdbGame = pickBestMatch(sg.igdbSearchTitle, results, sg.platformCode);
      }
      // L-series localization fallback (applies to all 4 synced platforms).
      // When primary IGDB resolution misses, retry via IGDB's
      // `game_localizations` endpoint so titles returned in the user's
      // account locale (Italian PSN, French Steam, etc.) match the
      // regional name IGDB has on file. Two extra IGDB calls per
      // fallback iteration — happens only on miss, so 5-10% of titles
      // typically. The 300ms inter-iteration delay below absorbs the
      // burst; no extra delay needed.
      if (!igdbGame) {
        const locResults = await searchGameLocalizations(sg.igdbSearchTitle);
        igdbGame = pickBestMatch(sg.igdbSearchTitle, locResults, sg.platformCode);
      }
      await delay(300); // ~3.3 req/s — under the 4/s IGDB limit

      if (!igdbGame) {
        skipped++;
        skippedTitles.push(sg.igdbSearchTitle);
        // Capture platform-side IDs for this skipped title so the
        // activity log can show what psn-api/openxbl/gog actually
        // returned. If psnConceptId is undefined → psn-api didn't
        // report a concept for this game. If it's present → the IGDB
        // external_games lookup missed (no row for this concept).
        const ids: typeof skippedIds[string] = {};
        if (sg.psnConceptId !== undefined) ids.psnConceptId = sg.psnConceptId;
        if (sg.xboxTitleId !== undefined) ids.xboxTitleId = sg.xboxTitleId;
        if (sg.gogAppId !== undefined) ids.gogAppId = sg.gogAppId;
        if (sg.steamAppId !== undefined) ids.steamAppId = sg.steamAppId;
        if (sg.itchGameId !== undefined) ids.itchGameId = sg.itchGameId;
        if (sg.epicCatalogItemId !== undefined) ids.epicCatalogItemId = sg.epicCatalogItemId;
        if (sg.nintendoTitleId !== undefined) ids.nintendoTitleId = sg.nintendoTitleId;
        if (Object.keys(ids).length > 0) skippedIds[sg.igdbSearchTitle] = ids;
        continue;
      }

      // Upsert the Game record (deduplication by igdbId).
      //
      // Collision case: the upsert is keyed on igdbId, but Game.steamAppId
      // is independently @unique. If the smart matcher resolves a Steam app
      // to a different igdbId than a prior sync stored, the CREATE branch
      // will try to write a steamAppId that another Game row already owns
      // (P2002). We reuse the existing row in that case — wrong IGDB matches
      // are corrected via the in-app [wrong game?] remap UI, not silently
      // rebound by sync.
      const steamAppId = sg.steamAppId ?? null;
      const xboxTitleId = sg.xboxTitleId ?? null;
      const psnConceptId = sg.psnConceptId ?? null;
      // gogAppId is NOT @unique on the schema (unlike steamAppId,
      // xboxTitleId, psnConceptId) because HLTB lookups already populate
      // it as a side-effect via codepotatoes.de — making it unique now
      // would risk P2002 collisions with the existing data. Persisted on
      // upsert so the sync path keeps it fresh, but no recovery branch.
      const gogAppId = sg.gogAppId ?? null;
      const itchGameId = sg.itchGameId ?? null;
      const epicCatalogItemId = sg.epicCatalogItemId ?? null;
      const nintendoTitleId = sg.nintendoTitleId ?? null;
      let game;
      try {
        game = await prisma.game.upsert({
          where: { igdbId: igdbGame.igdbId },
          update: {
            title: igdbGame.title,
            developer: igdbGame.developer,
            releaseYear: igdbGame.releaseYear,
            genres: igdbGame.genres,
            // B-IGDB-3 — IGDB-tag triple. `igdbGame` is an `IgdbSearchResult`
            // which now carries themes + playerPerspectives via the service
            // factories. Persist them so the Library + Dashboard breakdown
            // can read them off Game.
            themes: igdbGame.themes,
            playerPerspectives: igdbGame.playerPerspectives,
            coverUrl: igdbGame.coverUrl,
            ...(steamAppId ? { steamAppId } : {}),
            ...(xboxTitleId ? { xboxTitleId } : {}),
            ...(psnConceptId ? { psnConceptId } : {}),
            ...(gogAppId ? { gogAppId } : {}),
            ...(itchGameId ? { itchGameId } : {}),
            ...(epicCatalogItemId ? { epicCatalogItemId } : {}),
            ...(nintendoTitleId ? { nintendoTitleId } : {}),
          },
          create: {
            igdbId: igdbGame.igdbId,
            title: igdbGame.title,
            developer: igdbGame.developer,
            releaseYear: igdbGame.releaseYear,
            genres: igdbGame.genres,
            themes: igdbGame.themes,
            playerPerspectives: igdbGame.playerPerspectives,
            coverUrl: igdbGame.coverUrl,
            steamAppId,
            xboxTitleId,
            psnConceptId,
            gogAppId,
            itchGameId,
            epicCatalogItemId,
            nintendoTitleId,
          },
        });
      } catch (err) {
        // Same P2002 recovery as steamAppId/xboxTitleId — if another Game
        // row already owns the platform-side id (e.g. the IGDB matcher
        // picked a different IGDB id for the same game on a re-sync),
        // reuse the existing row instead of failing the whole sync.
        const isP2002 = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        const target = (isP2002 && Array.isArray(err.meta?.target)) ? (err.meta.target as string[]) : [];
        const isSteamAppIdCollision = target.includes('steamAppId') && steamAppId !== null;
        const isXboxTitleIdCollision = target.includes('xboxTitleId') && xboxTitleId !== null;
        const isPsnConceptIdCollision = target.includes('psnConceptId') && psnConceptId !== null;
        const isItchGameIdCollision = target.includes('itchGameId') && itchGameId !== null;
        const isEpicCatalogItemIdCollision = target.includes('epicCatalogItemId') && epicCatalogItemId !== null;
        const isNintendoTitleIdCollision = target.includes('nintendoTitleId') && nintendoTitleId !== null;
        if (!isSteamAppIdCollision && !isXboxTitleIdCollision && !isPsnConceptIdCollision && !isItchGameIdCollision && !isEpicCatalogItemIdCollision && !isNintendoTitleIdCollision) throw err;
        // TS can't narrow any id to non-null through the disjunctive
        // guard above, so each branch asserts. The asserts are safe
        // because the isXxxCollision flags already include the non-null
        // check inline.
        const existing = isSteamAppIdCollision
          ? await prisma.game.findUnique({ where: { steamAppId: steamAppId! } })
          : isXboxTitleIdCollision
            ? await prisma.game.findUnique({ where: { xboxTitleId: xboxTitleId! } })
            : isPsnConceptIdCollision
              ? await prisma.game.findUnique({ where: { psnConceptId: psnConceptId! } })
              : isItchGameIdCollision
                ? await prisma.game.findUnique({ where: { itchGameId: itchGameId! } })
                : isEpicCatalogItemIdCollision
                  ? await prisma.game.findUnique({ where: { epicCatalogItemId: epicCatalogItemId! } })
                  : await prisma.game.findUnique({ where: { nintendoTitleId: nintendoTitleId! } });
        if (!existing) throw err;
        game = existing;
      }

      // Merge playtime into the platform slot for this game
      const platformKey = sg.platformCode as PlatformCode;
      const newPlaytime = sg.playtimeMinutes;

      // Upsert UserGame — preserve existing status, merge playtime
      const existing = await prisma.userGame.findUnique({
        where: { userId_gameId: { userId, gameId: game.id } },
      });

      const existingPlaytime = (existing?.playtimeByPlatform ?? {}) as Record<string, number>;
      const mergedPlaytime = {
        ...existingPlaytime,
        [platformKey]: Math.max(existingPlaytime[platformKey] ?? 0, newPlaytime),
      };

      const isNew = !existing;
      const newLastPlayed = sg.lastPlayedAt ?? existing?.lastPlayedAt ?? null;
      const totalMergedPlaytime = Object.values(mergedPlaytime).reduce<number>((sum, m) => sum + (m ?? 0), 0);
      // Engagement signal — true if we have any playtime minutes OR the
      // platform-specific "lastPlayed exists" flag (Xbox via OpenXBL
      // doesn't surface per-title minutes; hasBeenPlayed lets that path
      // still land in OnHold instead of Backlog). Steam + PSN reach this
      // via the playtime side since they expose real minutes.
      const hasEngagement = totalMergedPlaytime > 0 || sg.hasBeenPlayed === true;
      const initialStatus = hasEngagement ? 'OnHold' : 'Backlog';

      // CM13 wishlist auto-promotion — policy lives in
      // apps/api/src/lib/promoteWishlist.ts so the manual-add path
      // (F1-PR5) shares the same rule. `undefined` means no status
      // change; non-Wishlist existing statuses are preserved. Pass a
      // synthetic engagement value (1 if hasEngagement else 0) so the
      // helper's "playtime > 0 → OnHold" rule covers the Xbox case
      // without faking minutes downstream.
      const promoteToStatus = promoteWishlistOnOwnership(
        existing?.status,
        hasEngagement ? Math.max(totalMergedPlaytime, 1) : 0,
      );

      await prisma.userGame.upsert({
        where: { userId_gameId: { userId, gameId: game.id } },
        update: {
          playtimeByPlatform: mergedPlaytime,
          ...(newLastPlayed ? { lastPlayedAt: newLastPlayed } : {}),
          ...(promoteToStatus ? { status: promoteToStatus } : {}),
        },
        create: {
          userId,
          gameId: game.id,
          status: initialStatus,
          playtimeByPlatform: mergedPlaytime,
          lastPlayedAt: sg.lastPlayedAt,
        },
      });

      // Trigger background HLTB fetch for new games (or if no HLTB data yet).
      // Layered fallback runs Steam-ID → IGDB time_to_beat in fetchHltbWithFallback.
      if (isNew) {
        const hasHltb = await prisma.hltbData.findUnique({ where: { gameId: game.id } });
        if (!hasHltb) {
          void triggerHltbBackground(game.id, game.title, steamAppId, igdbGame.igdbId);
        }
      }

      imported++;
    } catch (err) {
      console.error(`[syncRunner] failed for "${sg.igdbSearchTitle}":`, err);
      skipped++;
      errorTitles.push(sg.igdbSearchTitle);
      const msg = err instanceof Error ? err.message : String(err);
      errorMessages[sg.igdbSearchTitle] = msg.slice(0, 300);
    }
  }

  return { imported, skipped, skippedTitles, errorTitles, errorMessages, skippedIds };
}
