/**
 * M0 read-only ambiguity probe (docs/SYNC_EXPANSION_PLAN.md §5 Q0).
 *
 * Before applying the M0 migration, count cross-platform rows where the
 * backfill heuristic is ambiguous — i.e. games with BOTH `playtimeByPlatform.ST`
 * and `playtimeByPlatform.PS` > 0 AND any value in the to-be-dropped flat
 * `achievementsTotal` column. For these, the backfill attributes the existing
 * flat-column data to the user's most-recently-synced platform among {ST, PS};
 * if both Steam and PSN syncs happened recently the attribution is a
 * coin-flip until the next per-platform sync rewrites the data correctly
 * (self-healing within one cycle).
 *
 * Decision rule from the plan: < 30 ambiguous rows → run the migration as-is;
 * > 100 → consider option 3 (re-fetch from both APIs during migration).
 *
 *   npx tsx scripts/probe-m0-ambiguity.ts
 *
 * Uses $queryRaw so it runs against the DB columns as they exist today
 * (Prisma schema has already been updated to drop these columns, but the
 * DB still has them — that's the point of this probe).
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Row {
  totalWithAchievementData: bigint;
  ambiguous: bigint;
  steamOnly: bigint;
  psnOnly: bigint;
  neitherPlaytime: bigint;
  bothSyncedRecently: bigint;
}

async function main() {
  // Uses Postgres JSONB `?` operator to test KEY PRESENCE, not value.
  // P-FIX-2 backfills `playtimeByPlatform.ST = 0` / `.PS = 0` when
  // achievement data lands but the row had no playtime entry — so the
  // presence of the key is hard evidence that the achievement-writer
  // touched the row, regardless of whether minutes are positive.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*) FILTER (WHERE ug."achievementsTotal" IS NOT NULL) AS "totalWithAchievementData",
      COUNT(*) FILTER (
        WHERE ug."achievementsTotal" IS NOT NULL
          AND ug."playtimeByPlatform" ? 'ST'
          AND ug."playtimeByPlatform" ? 'PS'
      ) AS "ambiguous",
      COUNT(*) FILTER (
        WHERE ug."achievementsTotal" IS NOT NULL
          AND ug."playtimeByPlatform" ? 'ST'
          AND NOT (ug."playtimeByPlatform" ? 'PS')
      ) AS "steamOnly",
      COUNT(*) FILTER (
        WHERE ug."achievementsTotal" IS NOT NULL
          AND NOT (ug."playtimeByPlatform" ? 'ST')
          AND ug."playtimeByPlatform" ? 'PS'
      ) AS "psnOnly",
      COUNT(*) FILTER (
        WHERE ug."achievementsTotal" IS NOT NULL
          AND NOT (ug."playtimeByPlatform" ? 'ST')
          AND NOT (ug."playtimeByPlatform" ? 'PS')
      ) AS "neitherPlaytime",
      0::bigint AS "bothSyncedRecently"
    FROM "UserGame" ug
  `;

  const r = rows[0];
  if (!r) {
    console.log('No rows returned — DB likely empty.');
    return;
  }

  const total = Number(r.totalWithAchievementData);
  const ambiguous = Number(r.ambiguous);
  const steamOnly = Number(r.steamOnly);
  const psnOnly = Number(r.psnOnly);
  const neither = Number(r.neitherPlaytime);

  console.log(JSON.stringify({
    totalWithAchievementData: total,
    breakdown: {
      ambiguous_both_ST_and_PS_playtime: ambiguous,
      steamOnly_clear_attribution: steamOnly,
      psnOnly_clear_attribution: psnOnly,
      neitherPlaytime_falls_back_to_PS: neither,
    },
    verdict:
      ambiguous < 30
        ? 'GREEN: < 30 ambiguous rows — run the migration as-is. Self-healing within one sync cycle.'
        : ambiguous < 100
          ? 'YELLOW: 30-99 ambiguous rows — migration still safe, but worth eyeballing post-sync.'
          : 'RED: 100+ ambiguous rows — consider option 3 (per-row re-fetch during migration).',
  }, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
