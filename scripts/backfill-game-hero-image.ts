/**
 * B-IGDB-3b2 follow-up — one-time backfill of Game.heroImageUrl.
 *
 * After the `20260531120000_game_hero_image_url` migration, every
 * existing Game row has heroImageUrl null. Newly-synced/added games
 * persist heroImageUrl via the updated IGDB factories starting this
 * commit; this script catches historical rows.
 *
 * Resolution: re-fetches each Game by igdbId via the same IGDB service
 * the sync uses; persists whichever heroImageUrl the factory derived
 * (artworks[0]?.image_id preferred, screenshots[0]?.image_id fallback).
 * Throttled at ~3 req/s via REQ_DELAY_MS (under IGDB's 4 req/s budget).
 * Resumable — re-runs skip rows that already have a non-null
 * heroImageUrl.
 *
 * Usage:
 *   npx tsx scripts/backfill-game-hero-image.ts
 *   npx tsx scripts/backfill-game-hero-image.ts --dry-run
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
  // Scope: only Games rendered by /api/games/shelves — the per-status
  // top-PER_STATUS-by-most-recent-play (or addedAt for Wishlist) slice
  // per user. That's the EXACT set the Library overview cards show.
  // Andrea 2026-05-31: *"my library overview is just selecting a bunch
  // of games to display there. why cant we JUST load what the library
  // overview is displaying"* — point taken.
  //
  // Replicates the shelves endpoint's query shape: 12 games per status
  // per user (matches the API default). Union across all users so every
  // user's overview cards converge after a single backfill run.
  const PER_STATUS = 12;
  const STATUSES = ['Playing', 'OnHold', 'Completed', 'Backlog', 'Dropped'] as const;
  const users = await prisma.user.findMany({ select: { id: true } });
  const gameIds = new Set<string>();
  for (const u of users) {
    for (const status of STATUSES) {
      const rows = await prisma.userGame.findMany({
        where: { userId: u.id, status },
        orderBy: { lastPlayedAt: 'desc' },
        take: PER_STATUS,
        select: { gameId: true },
      });
      rows.forEach((r) => gameIds.add(r.gameId));
    }
    // Wishlist shelf widens to wishlistedPlatforms-non-empty per CM12.
    const wishlistRows = await prisma.userGame.findMany({
      where: {
        userId: u.id,
        OR: [{ status: 'Wishlist' }, { wishlistedPlatforms: { isEmpty: false } }],
      },
      orderBy: { addedAt: 'desc' },
      take: PER_STATUS,
      select: { gameId: true },
    });
    wishlistRows.forEach((r) => gameIds.add(r.gameId));
  }
  const rows = await prisma.game.findMany({
    where: { id: { in: [...gameIds] }, heroImageUrl: null },
    select: { id: true, igdbId: true, title: true },
  });

  console.log(`[backfill-hero] ${rows.length} candidate game(s) (heroImageUrl IS NULL)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (rows.length === 0) {
    console.log('[backfill-hero] nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let i = 0;
  for (const row of rows) {
    i++;
    try {
      const g = await getGame(row.igdbId);
      if (!g) {
        console.log(`[backfill-hero] [${i}/${rows.length}] ${row.title} (igdbId=${row.igdbId}) — IGDB returned null, skipping`);
        unchanged++;
        await sleep(REQ_DELAY_MS);
        continue;
      }
      if (!g.heroImageUrl) {
        console.log(`[backfill-hero] [${i}/${rows.length}] ${row.title} — no artworks/screenshots in IGDB, leaving null`);
        unchanged++;
        await sleep(REQ_DELAY_MS);
        continue;
      }
      if (DRY_RUN) {
        console.log(`[backfill-hero] [${i}/${rows.length}] ${row.title} → ${g.heroImageUrl}`);
      } else {
        await prisma.game.update({
          where: { id: row.id },
          data: { heroImageUrl: g.heroImageUrl },
        });
        console.log(`[backfill-hero] [${i}/${rows.length}] ${row.title} ✓`);
      }
      updated++;
    } catch (err) {
      failed++;
      console.error(`[backfill-hero] [${i}/${rows.length}] ${row.title} (igdbId=${row.igdbId}) — error:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQ_DELAY_MS);
  }

  console.log(`\n[backfill-hero] done. updated=${updated} unchanged=${unchanged} failed=${failed}`);
  await prisma.$disconnect();
}

void main();
