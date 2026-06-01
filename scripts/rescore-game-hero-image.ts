/**
 * B-Art-1 — one-time rescore of Game.heroImageUrl.
 *
 * Companion to `backfill-game-hero-image.ts`. That script fills in NULL
 * heroImageUrls. This one RE-EVALUATES rows that already have a value,
 * because the prior picker took `artworks[0] ?? screenshots[0]` and the
 * new picker scores by aspect (prefer 16:9), resolution (prefer larger),
 * and cover-duplicate penalty (skip portrait logo art).
 *
 * Scope: Library-overview-displayed games (top-12 per status per user,
 * union across all users + wishlistedPlatforms-non-empty per CM12). Same
 * scope as backfill-game-hero-image.ts so the two scripts converge on
 * the same row set. NO null-filter — re-processes both populated and
 * null rows.
 *
 * Behaviour: only writes when the new URL differs from the current one;
 * unchanged + null-result rows logged + skipped. Throttled at ~3 req/s.
 *
 * Usage:
 *   npx tsx scripts/rescore-game-hero-image.ts
 *   npx tsx scripts/rescore-game-hero-image.ts --dry-run
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
  // NO heroImageUrl filter — we want to re-score everything in scope.
  const rows = await prisma.game.findMany({
    where: { id: { in: [...gameIds] } },
    select: { id: true, igdbId: true, title: true, heroImageUrl: true },
  });

  console.log(`[rescore-hero] ${rows.length} candidate game(s)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (rows.length === 0) {
    console.log('[rescore-hero] nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let changed = 0;
  let unchanged = 0;
  let nulled = 0;
  let failed = 0;
  let i = 0;
  for (const row of rows) {
    i++;
    try {
      const g = await getGame(row.igdbId);
      if (!g) {
        console.log(`[rescore-hero] [${i}/${rows.length}] ${row.title} (igdbId=${row.igdbId}) — IGDB returned null, leaving as-is`);
        unchanged++;
        await sleep(REQ_DELAY_MS);
        continue;
      }
      const newUrl = g.heroImageUrl;
      const oldUrl = row.heroImageUrl;
      if (newUrl === oldUrl) {
        // Scorer picked the same image — common case for games where the
        // best candidate was already at index 0.
        unchanged++;
      } else if (!newUrl && oldUrl) {
        // Scorer rejected every candidate (e.g. only cover-duplicates).
        // Defensive: leave the existing URL alone rather than nulling it
        // out. The old picker accepted it, can't be worse than nothing.
        console.log(`[rescore-hero] [${i}/${rows.length}] ${row.title} — scorer returned null, KEEPING existing URL`);
        nulled++;
      } else {
        if (DRY_RUN) {
          console.log(`[rescore-hero] [${i}/${rows.length}] ${row.title} → swap`);
          console.log(`              old: ${oldUrl ?? '(null)'}`);
          console.log(`              new: ${newUrl ?? '(null)'}`);
        } else {
          await prisma.game.update({
            where: { id: row.id },
            data: { heroImageUrl: newUrl },
          });
          console.log(`[rescore-hero] [${i}/${rows.length}] ${row.title} ✓ swap`);
        }
        changed++;
      }
    } catch (err) {
      failed++;
      console.error(`[rescore-hero] [${i}/${rows.length}] ${row.title} (igdbId=${row.igdbId}) — error:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQ_DELAY_MS);
  }

  console.log(`\n[rescore-hero] done. changed=${changed} unchanged=${unchanged} kept-on-null=${nulled} failed=${failed}`);
  await prisma.$disconnect();
}

void main();
