/**
 * B-IGDB-3 — one-time backfill of Game.themes + Game.playerPerspectives.
 *
 * After the `20260530120000_game_themes_perspectives` migration, every
 * existing Game row has the two new columns defaulted to `[]`. Newly-
 * synced Games (via syncRunner + manual-add + wishlist toggle + remap)
 * already persist themes + perspectives from IGDB starting this commit.
 * This script catches the historical rows.
 *
 * Throttled at ~3 req/s via REQ_DELAY_MS to stay under IGDB's 4 req/s
 * budget. Resumable — re-runs are no-ops on rows that already have
 * non-empty themes/perspectives (skipped by the WHERE clause). To force
 * a full re-fetch, narrow the WHERE clause in `main()`.
 *
 * Usage:
 *   npx tsx scripts/backfill-game-tags.ts
 *   npx tsx scripts/backfill-game-tags.ts --dry-run
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { getGame } from '../apps/api/src/services/igdb';

const prisma = new PrismaClient();

const REQ_DELAY_MS = 350; // ~3 req/s — under IGDB's 4/s budget
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  // Candidates: any Game whose themes AND playerPerspectives are both
  // empty. We could narrow further (e.g. themes IS NULL), but the column
  // defaults to []. The `isEmpty: true` filter catches all rows that
  // haven't been backfilled yet AND any new rows synced before the IGDB
  // service update landed.
  const rows = await prisma.game.findMany({
    where: {
      AND: [
        { themes: { isEmpty: true } },
        { playerPerspectives: { isEmpty: true } },
      ],
    },
    select: { id: true, igdbId: true, title: true },
    orderBy: { title: 'asc' },
  });

  console.log(`Found ${rows.length} Game rows missing themes + perspectives.`);
  if (DRY_RUN) console.log('--dry-run: no writes will be performed.');
  console.log('Starting backfill...\n');

  const stats = { updated: 0, skipped: 0, errored: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const tag = `[${i + 1}/${rows.length}]`;
    try {
      const details = await getGame(row.igdbId);
      await sleep(REQ_DELAY_MS);
      if (!details) {
        stats.skipped++;
        console.log(`${tag} SKIP: ${row.title} (igdb ${row.igdbId}) — IGDB returned no record`);
        continue;
      }
      const themes = details.themes ?? [];
      const playerPerspectives = details.playerPerspectives ?? [];
      if (themes.length === 0 && playerPerspectives.length === 0) {
        stats.skipped++;
        console.log(`${tag} SKIP: ${row.title} — IGDB has no themes/perspectives data`);
        continue;
      }
      if (!DRY_RUN) {
        await prisma.game.update({
          where: { id: row.id },
          data: { themes, playerPerspectives },
        });
      }
      stats.updated++;
      console.log(
        `${tag} ${DRY_RUN ? 'DRY' : 'OK '}: ${row.title}` +
        ` — themes=[${themes.join(', ')}], perspectives=[${playerPerspectives.join(', ')}]`,
      );
    } catch (err) {
      stats.errored++;
      console.error(`${tag} ERROR: ${row.title} — ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. updated=${stats.updated} skipped=${stats.skipped} errored=${stats.errored}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
