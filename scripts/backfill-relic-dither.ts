/**
 * GD-PR4a — one-time backfill for `Game.relicDitherSvg`.
 *
 * Scope: every Completed UserGame (per user, union across all users)
 * whose Game has a heroImageUrl. This is the EXACT set that will render
 * the OQ-GD-13 relic centerpiece in GD-PR4b (only S4 state — Completed
 * games). Backfilling other statuses would be wasted work since they
 * route to S3 (non-relic) surfaces.
 *
 * Behaviour: skips rows where `relicDitherSvg` is already populated AND
 * its embedded `<!-- src=... -->` matches the current heroImageUrl
 * (same self-healing check the route uses). Re-renders rows where the
 * cache is stale or missing.
 *
 * Throttle: ~3 renders/second (sharp + IGDB image fetch ≈ 200-400ms
 * each). 100 games ≈ 30s.
 *
 * Usage:
 *   npx tsx scripts/backfill-relic-dither.ts
 *   npx tsx scripts/backfill-relic-dither.ts --dry-run
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { renderRelicDither, extractRelicSource } from '../apps/api/src/services/relicDither';

const prisma = new PrismaClient();

const REQ_DELAY_MS = 350;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const gameIds = new Set<string>();
  for (const u of users) {
    const rows = await prisma.userGame.findMany({
      where: { userId: u.id, status: 'Completed' },
      select: { gameId: true },
    });
    rows.forEach((r) => gameIds.add(r.gameId));
  }
  const rows = await prisma.game.findMany({
    where: { id: { in: [...gameIds] }, heroImageUrl: { not: null } },
    select: { id: true, title: true, heroImageUrl: true, relicDitherSvg: true },
  });

  console.log(`[backfill-relic] ${rows.length} candidate Completed-Game(s)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (rows.length === 0) {
    console.log('[backfill-relic] nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let rendered = 0;
  let skipped = 0;
  let failed = 0;
  let i = 0;
  for (const row of rows) {
    i++;
    const heroUrl = row.heroImageUrl!;
    const cachedSrc = extractRelicSource(row.relicDitherSvg);
    if (cachedSrc === heroUrl) {
      console.log(`[backfill-relic] [${i}/${rows.length}] ${row.title} — cache fresh, skipping`);
      skipped++;
      continue;
    }
    try {
      if (DRY_RUN) {
        console.log(`[backfill-relic] [${i}/${rows.length}] ${row.title} → would render (heroUrl=${heroUrl})`);
      } else {
        const svg = await renderRelicDither(heroUrl);
        await prisma.game.update({ where: { id: row.id }, data: { relicDitherSvg: svg } });
        const kb = (svg.length / 1024).toFixed(1);
        console.log(`[backfill-relic] [${i}/${rows.length}] ${row.title} ✓ (${kb}KB)`);
      }
      rendered++;
    } catch (err) {
      failed++;
      console.error(`[backfill-relic] [${i}/${rows.length}] ${row.title} — error:`, err instanceof Error ? err.message : err);
    }
    await sleep(REQ_DELAY_MS);
  }

  console.log(`\n[backfill-relic] done. rendered=${rendered} skipped=${skipped} failed=${failed}`);
  await prisma.$disconnect();
}

void main();
