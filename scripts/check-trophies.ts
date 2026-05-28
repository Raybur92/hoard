/**
 * Read-only diagnostic for the trophies workstream (`docs/TROPHIES_PLAN.md`),
 * updated for M0's per-platform achievement model.
 *
 * Prints the populated state of `UserGame.achievementsByPlatform` (rows with
 * any entry, rows with non-zero progress, per-platform breakdown) +
 * `Game.psnNpCommunicationId` + `Platform` sync status, plus a 5-row sample.
 * Use to confirm whether a sync actually populated the trophy aggregates
 * after deploying T2 / T3, before chasing UI-side issues.
 *
 *   npx tsx scripts/check-trophies.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const totalUserGames = await prisma.userGame.count();
  const rows = await prisma.userGame.findMany({
    select: { achievementsByPlatform: true },
  });

  let withAnyEntry = 0;
  let withProgress = 0;
  let sumEarned = 0;
  let sumTotal = 0;
  const perPlatform: Record<string, { rows: number; earned: number; total: number }> = {};
  for (const r of rows) {
    const map = (r.achievementsByPlatform ?? {}) as Record<string, { earned?: number; total?: number; percent?: number }>;
    const entries = Object.entries(map);
    if (entries.length === 0) continue;
    withAnyEntry++;
    let rowEarned = 0;
    let rowTotal = 0;
    for (const [code, e] of entries) {
      const earned = typeof e?.earned === 'number' ? e.earned : 0;
      const total = typeof e?.total === 'number' ? e.total : 0;
      rowEarned += earned;
      rowTotal += total;
      const bucket = perPlatform[code] ?? { rows: 0, earned: 0, total: 0 };
      bucket.rows += 1;
      bucket.earned += earned;
      bucket.total += total;
      perPlatform[code] = bucket;
    }
    if (rowTotal > 0) withProgress++;
    sumEarned += rowEarned;
    sumTotal += rowTotal;
  }

  const psNpIdSet = await prisma.game.count({
    where: { psnNpCommunicationId: { not: null } },
  });
  const totalGames = await prisma.game.count();

  // A few sample populated rows for sanity:
  const sample = await prisma.userGame.findMany({
    take: 5,
    select: {
      id: true,
      status: true,
      achievementsByPlatform: true,
      game: { select: { title: true, psnNpCommunicationId: true, steamAppId: true } },
    },
    where: { NOT: { achievementsByPlatform: { equals: {} } } },
  });

  // Also peek at platform sync status:
  const platforms = await prisma.platform.findMany({
    select: { code: true, syncStatus: true, lastSyncAt: true },
  });

  console.log(JSON.stringify({
    totalUserGames,
    withAnyAchievementEntry: withAnyEntry,
    withProgress,
    sumEarned,
    sumTotal,
    perPlatform,
    gamesWithPsnNpId: psNpIdSet,
    totalGames,
    sample,
    platforms,
  }, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
