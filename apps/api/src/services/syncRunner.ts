import { prisma } from '@hoard/db';
import { Prisma } from '@prisma/client';
import type { PlatformCode } from '@hoard/types';
import { searchGames, getGameBySteamId, getTimeToBeat } from './igdb';
import { pickBestMatch } from './igdbMatch';
import { fetchHltbWithFallback } from './hltb';
import type { SyncedGame } from './platforms/steam';

export interface SyncResult {
  imported: number;
  skipped: number;
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

  for (const sg of syncedGames) {
    try {
      // Look up IGDB via Steam App ID first (exact match), fall back to text
      // search with a smart matcher. The matcher scores top-N candidates by
      // title similarity + platform agreement + popularity so we don't pick
      // an obscure name-collision (Korean MMO "Ragnarok: War of Gods" beating
      // "God of War Ragnarök") or an early-access sequel (Slay the Spire 2
      // beating Slay the Spire) just because IGDB's relevance search ranked
      // them first. See apps/api/src/services/igdbMatch.ts for the algorithm.
      let igdbGame = sg.steamAppId ? await getGameBySteamId(sg.steamAppId) : null;
      if (!igdbGame) {
        const results = await searchGames(sg.igdbSearchTitle);
        igdbGame = pickBestMatch(sg.igdbSearchTitle, results, sg.platformCode);
      }
      await delay(300); // ~3.3 req/s — under the 4/s IGDB limit

      if (!igdbGame) {
        skipped++;
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
      let game;
      try {
        game = await prisma.game.upsert({
          where: { igdbId: igdbGame.igdbId },
          update: {
            title: igdbGame.title,
            developer: igdbGame.developer,
            releaseYear: igdbGame.releaseYear,
            genres: igdbGame.genres,
            coverUrl: igdbGame.coverUrl,
            ...(steamAppId ? { steamAppId } : {}),
          },
          create: {
            igdbId: igdbGame.igdbId,
            title: igdbGame.title,
            developer: igdbGame.developer,
            releaseYear: igdbGame.releaseYear,
            genres: igdbGame.genres,
            coverUrl: igdbGame.coverUrl,
            steamAppId,
          },
        });
      } catch (err) {
        const isSteamAppIdCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          Array.isArray(err.meta?.target) &&
          (err.meta.target as string[]).includes('steamAppId') &&
          steamAppId !== null;
        if (!isSteamAppIdCollision) throw err;
        const existing = await prisma.game.findUnique({ where: { steamAppId } });
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
      const initialStatus = totalMergedPlaytime > 0 ? 'OnHold' : 'Backlog';
      await prisma.userGame.upsert({
        where: { userId_gameId: { userId, gameId: game.id } },
        update: {
          playtimeByPlatform: mergedPlaytime,
          ...(newLastPlayed ? { lastPlayedAt: newLastPlayed } : {}),
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
    }
  }

  return { imported, skipped };
}
