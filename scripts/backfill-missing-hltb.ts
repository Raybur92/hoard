/**
 * Backfill HLTB / time-to-beat data for games that don't have a HltbData row.
 *
 * Layered fallback:
 *   1. /steam/{steamAppId}                — direct HLTB lookup when present
 *   2. IGDB time_to_beat                  — for everything else IGDB has data for
 *
 * Captures hltbId + gogAppId onto Game where the codepotatoes.de payload
 * provides them. Stores HltbData with source='hltb' or source='igdb'.
 *
 * Read the audit findings first via: npx tsx scripts/audit-hltb.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import {
  fetchHltbBySteamId,
  igdbTimeToBeatToHltb,
} from '../apps/api/src/services/hltb';
import { getTimeToBeat } from '../apps/api/src/services/igdb';

const prisma = new PrismaClient();

const REQ_DELAY_MS = 350; // ~3 req/s — under both HLTB-API and IGDB rate limits
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // Pull every game without a HltbData row. Eagerly load the existing
  // identifiers so we know which path each one goes through.
  const games = await prisma.game.findMany({
    where: { hltbData: null },
    select: { id: true, title: true, igdbId: true, steamAppId: true },
    orderBy: { title: 'asc' },
  });

  console.log(`Found ${games.length} games without HltbData. Starting backfill...\n`);

  const stats = { hltb: 0, igdb: 0, skipped: 0, errored: 0 };

  for (let i = 0; i < games.length; i++) {
    const g = games[i]!;
    const tag = `[${i + 1}/${games.length}]`;

    try {
      // Path 1 — Steam-ID direct lookup
      let result = null;
      let source: 'hltb' | 'igdb' | 'none' = 'none';

      if (g.steamAppId) {
        const hit = await fetchHltbBySteamId(g.steamAppId);
        if (hit) {
          result = hit;
          source = 'hltb';
        }
        await sleep(REQ_DELAY_MS);
      }

      // Path 2 — IGDB time_to_beat fallback (separate /game_time_to_beats endpoint)
      if (!result) {
        const ttb = await getTimeToBeat(g.igdbId).catch(() => null);
        await sleep(REQ_DELAY_MS);
        const igdbResult = igdbTimeToBeatToHltb(ttb);
        if (igdbResult) {
          result = igdbResult;
          source = 'igdb';
        }
      }

      if (!result) {
        stats.skipped++;
        console.log(`${tag} skip: ${g.title}`);
        continue;
      }

      // Persist hltbId / gogAppId onto Game when codepotatoes.de gave them
      if (result.hltbId || result.gogAppId) {
        await prisma.game.update({
          where: { id: g.id },
          data: {
            ...(result.hltbId ? { hltbId: result.hltbId } : {}),
            ...(result.gogAppId ? { gogAppId: result.gogAppId } : {}),
          },
        });
      }

      await prisma.hltbData.upsert({
        where: { gameId: g.id },
        update: {
          mainStory: result.mainStory,
          mainExtras: result.mainExtras,
          completionist: result.completionist,
          source: result.source,
          fetchedAt: new Date(),
        },
        create: {
          gameId: g.id,
          mainStory: result.mainStory,
          mainExtras: result.mainExtras,
          completionist: result.completionist,
          source: result.source,
        },
      });

      stats[source as 'hltb' | 'igdb']++;
      console.log(`${tag} ${source.toUpperCase().padEnd(4)}: ${g.title}`);
    } catch (err) {
      stats.errored++;
      console.error(`${tag} ERR : ${g.title} —`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n=== Backfill complete ===');
  console.log(`  HLTB-sourced (Steam-ID): ${stats.hltb}`);
  console.log(`  IGDB time_to_beat:       ${stats.igdb}`);
  console.log(`  No data available:       ${stats.skipped}`);
  console.log(`  Errored:                 ${stats.errored}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
