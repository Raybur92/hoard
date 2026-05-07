/**
 * Read-only diagnostic for the trophies workstream (`docs/TROPHIES_PLAN.md`).
 *
 * Prints the populated state of the four `UserGame.achievements*` columns +
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
  const withAchievements = await prisma.userGame.count({
    where: { achievementsTotal: { not: null } },
  });
  const withProgress = await prisma.userGame.count({
    where: { achievementsTotal: { gt: 0 } },
  });
  const agg = await prisma.userGame.aggregate({
    where: { achievementsTotal: { not: null } },
    _sum: { achievementsEarned: true, achievementsTotal: true },
  });
  const psNpIdSet = await prisma.game.count({
    where: { psnNpCommunicationId: { not: null } },
  });
  const totalGames = await prisma.game.count();

  // A few sample populated rows for sanity:
  const sample = await prisma.userGame.findMany({
    where: { achievementsTotal: { not: null } },
    take: 5,
    select: {
      id: true,
      status: true,
      achievementsEarned: true,
      achievementsTotal: true,
      achievementsPercent: true,
      achievementsUpdatedAt: true,
      game: { select: { title: true, psnNpCommunicationId: true, steamAppId: true } },
    },
  });

  // Also peek at platform sync status:
  const platforms = await prisma.platform.findMany({
    select: { code: true, syncStatus: true, lastSyncAt: true },
  });

  console.log(JSON.stringify({
    totalUserGames,
    withAchievements,
    withProgress,
    sumEarned: agg._sum.achievementsEarned,
    sumTotal: agg._sum.achievementsTotal,
    gamesWithPsnNpId: psNpIdSet,
    totalGames,
    sample,
    platforms,
  }, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
