/**
 * DEALS-PR2.5+ — one-shot backfill of Game.platforms.
 *
 * The new `Game.platforms` column was added 2026-06-02 with default
 * `[]`. Existing Game rows have empty arrays. Future syncs (syncRunner,
 * wishlistImport, upcoming/wishlist toggle, games-remap) populate it
 * from `IgdbSearchResult.platforms` (already in the type — just wasn't
 * being persisted). This script catches existing rows.
 *
 * Scope: every Game with at least one UserGame (the only Games where
 * platforms could be actionable for the user). Re-fetches via IGDB's
 * `getGame(igdbId)` and stores the returned platforms array. Throttled
 * at ~3 req/s to stay under IGDB's 4/s budget. Resumable — skips rows
 * that already have a non-empty platforms array.
 *
 * Run: `npx tsx scripts/backfill-game-platforms.ts [--dry-run]`
 */

import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { getGame } from '../apps/api/src/services/igdb';

const prisma = new PrismaClient();
const REQ_DELAY_MS = 350;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const rows = await prisma.game.findMany({
    where: {
      userGames: { some: {} },
      platforms: { isEmpty: true },
    },
    select: { id: true, igdbId: true, title: true },
  });
  console.log(`[backfill-platforms] ${rows.length} candidate game(s)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (rows.length === 0) {
    console.log('[backfill-platforms] nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let empty = 0;
  let failed = 0;
  let i = 0;
  for (const r of rows) {
    i++;
    try {
      const g = await getGame(r.igdbId);
      if (!g) {
        console.log(`[backfill-platforms] [${i}/${rows.length}] ${r.title} (igdbId=${r.igdbId}) — IGDB returned null`);
        empty++;
        await sleep(REQ_DELAY_MS);
        continue;
      }
      if (g.platforms.length === 0) {
        console.log(`[backfill-platforms] [${i}/${rows.length}] ${r.title} — no platforms in IGDB`);
        empty++;
      } else if (DRY_RUN) {
        console.log(`[backfill-platforms] [${i}/${rows.length}] ${r.title} → ${g.platforms.join(', ')}`);
        updated++;
      } else {
        await prisma.game.update({
          where: { id: r.id },
          data: { platforms: g.platforms },
        });
        console.log(`[backfill-platforms] [${i}/${rows.length}] ${r.title} ✓ ${g.platforms.length} platforms`);
        updated++;
      }
    } catch (err) {
      failed++;
      console.error(`[backfill-platforms] [${i}/${rows.length}] ${r.title}:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQ_DELAY_MS);
  }

  console.log(`\n[backfill-platforms] done. updated=${updated} empty=${empty} failed=${failed}`);
  await prisma.$disconnect();
}

void main();
