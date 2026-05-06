/**
 * One-time backfill for WishlistRelease rows whose extra metadata was dropped
 * by the previous wishlist-toggle endpoint (PR B Path-B persistence fix).
 *
 * Walks every row whose releaseDate is null OR platforms is empty (the two
 * sentinels that the old code wrote unconditionally) and re-fetches the
 * full release shape from IGDB. Updates releaseDate, releaseDateCategory,
 * platforms, synopsis, hype, category in place. ~3 req/s rate-limit.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { getReleaseDetails } from '../apps/api/src/services/igdb';

const prisma = new PrismaClient();

const REQ_DELAY_MS = 350; // ~3 req/s — under IGDB's 4/s budget
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // The old toggle endpoint hard-coded releaseDate=null + platforms=[] so any
  // row matching either is a candidate. Skip rows that already have full data
  // (in case this script gets re-run after partial completion).
  const rows = await prisma.wishlistRelease.findMany({
    where: {
      OR: [
        { releaseDate: null },
        { platforms: { isEmpty: true } },
      ],
    },
    select: { id: true, igdbId: true, title: true },
    orderBy: { title: 'asc' },
  });

  console.log(`Found ${rows.length} WishlistRelease rows missing data. Starting backfill...\n`);

  const stats = { updated: 0, skipped: 0, errored: 0 };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const tag = `[${i + 1}/${rows.length}]`;
    try {
      const details = await getReleaseDetails(row.igdbId);
      await sleep(REQ_DELAY_MS);
      if (!details) {
        stats.skipped++;
        console.log(`${tag} SKIP: ${row.title} — IGDB returned no record`);
        continue;
      }
      await prisma.wishlistRelease.update({
        where: { id: row.id },
        data: {
          // Refresh everything that was lost. Title / developer / coverUrl /
          // genres are usually fine but harmless to refresh.
          title: details.title,
          developer: details.developer,
          coverUrl: details.coverUrl,
          genres: details.genres,
          releaseDate: details.releaseDate ? new Date(details.releaseDate) : null,
          releaseDateCategory: details.releaseDateCategory,
          platforms: details.platforms,
          synopsis: details.synopsis,
          hype: details.hype,
          category: details.category,
        },
      });
      stats.updated++;
      console.log(`${tag} OK  : ${row.title}${details.releaseDate ? ` (${details.releaseDate.slice(0, 10)})` : ' (TBA)'}`);
    } catch (err) {
      stats.errored++;
      console.error(`${tag} ERR : ${row.title} —`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n=== Backfill complete ===');
  console.log(`  Updated:  ${stats.updated}`);
  console.log(`  Skipped:  ${stats.skipped} (IGDB had no record)`);
  console.log(`  Errored:  ${stats.errored}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
