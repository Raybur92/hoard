import { config } from 'dotenv';
config({ path: './apps/api/.env' });

import { PrismaClient } from '@prisma/client';
import { searchGames } from '../apps/api/src/services/igdb';
import { syncPsnLibrary } from '../apps/api/src/services/platforms/psn';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  const userId = user!.id;
  const platform = await prisma.platform.findFirst({ where: { code: 'PS' }, select: { credentials: true } });
  const creds = platform!.credentials as { npsso: string };

  console.log('Fetching PSN library...');
  const games = await syncPsnLibrary({ npssoToken: creds.npsso });
  console.log('PSN games fetched:', games.length);

  let matched = 0;
  let unmatched = 0;
  let dbErrors = 0;

  for (const sg of games) {
    try {
      const results = await searchGames(sg.igdbSearchTitle);
      const igdbGame = results[0] ?? null;
      if (!igdbGame) {
        unmatched++;
        console.log(`  [IGDB MISS] ${sg.igdbSearchTitle}`);
        continue;
      }

      const game = await prisma.game.upsert({
        where: { igdbId: igdbGame.igdbId },
        update: { title: igdbGame.title },
        create: {
          igdbId: igdbGame.igdbId,
          title: igdbGame.title,
          developer: igdbGame.developer,
          releaseYear: igdbGame.releaseYear,
          genres: igdbGame.genres,
          coverUrl: igdbGame.coverUrl,
          steamAppId: null,
        },
      });

      const existing = await prisma.userGame.findUnique({
        where: { userId_gameId: { userId, gameId: game.id } },
      });
      const merged = { ...(existing?.playtimeByPlatform as Record<string, number> ?? {}), PS: sg.playtimeMinutes };
      await prisma.userGame.upsert({
        where: { userId_gameId: { userId, gameId: game.id } },
        update: { playtimeByPlatform: merged },
        create: {
          userId,
          gameId: game.id,
          status: 'Backlog',
          playtimeByPlatform: merged,
          lastPlayedAt: sg.lastPlayedAt,
        },
      });

      matched++;
    } catch (e: unknown) {
      dbErrors++;
      console.error(`  [DB ERROR] ${sg.igdbSearchTitle}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total PSN games: ${games.length}`);
  console.log(`IGDB matched + saved: ${matched}`);
  console.log(`IGDB misses: ${unmatched}`);
  console.log(`DB errors: ${dbErrors}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
