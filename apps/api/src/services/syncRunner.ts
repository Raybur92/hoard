import { prisma } from '@hoard/db';
import type { PlatformCode } from '@hoard/types';
import { searchGames, getGameBySteamId } from './igdb';
import { fetchHltb } from './hltb';
import type { SyncedGame } from './platforms/steam';

export interface SyncResult {
  imported: number;
  skipped: number;
}

// Stay comfortably under the IGDB 4 req/s rate limit
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerHltbBackground(gameId: string, title: string, steamAppId?: number | null): Promise<void> {
  void (async () => {
    const result = await fetchHltb(title, steamAppId);
    if (!result) return;
    await prisma.hltbData.upsert({
      where: { gameId },
      update: {
        mainStory: result.mainStory,
        mainExtras: result.mainExtras,
        completionist: result.completionist,
        fetchedAt: new Date(),
      },
      create: {
        gameId,
        mainStory: result.mainStory,
        mainExtras: result.mainExtras,
        completionist: result.completionist,
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
      // Look up IGDB via Steam App ID first (exact match), fall back to text search
      let igdbGame = sg.steamAppId ? await getGameBySteamId(sg.steamAppId) : null;
      if (!igdbGame) {
        const results = await searchGames(sg.igdbSearchTitle);
        igdbGame = results[0] ?? null;
      }
      await delay(300); // ~3.3 req/s — under the 4/s IGDB limit

      if (!igdbGame) {
        skipped++;
        continue;
      }

      // Upsert the Game record (deduplication by igdbId)
      const steamAppId = sg.steamAppId ?? null;
      const game = await prisma.game.upsert({
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
      await prisma.userGame.upsert({
        where: { userId_gameId: { userId, gameId: game.id } },
        update: {
          playtimeByPlatform: mergedPlaytime,
          ...(newLastPlayed ? { lastPlayedAt: newLastPlayed } : {}),
        },
        create: {
          userId,
          gameId: game.id,
          status: 'Backlog',
          playtimeByPlatform: mergedPlaytime,
          lastPlayedAt: sg.lastPlayedAt,
        },
      });

      // Trigger background HLTB fetch for new games (or if no HLTB data yet)
      if (isNew) {
        const hasHltb = await prisma.hltbData.findUnique({ where: { gameId: game.id } });
        if (!hasHltb) {
          triggerHltbBackground(game.id, game.title, steamAppId);
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
