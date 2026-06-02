/**
 * Diagnostic for DEALS-PR2.5 sync results (Andrea 2026-06-02).
 * Two failure modes to inspect:
 *   1. Nintendo scanned=0 — no Game rows match nintendoTitleId+ug filter
 *   2. PSN scanned=144 fetched=0 — every getPsnPrice returned null
 *
 * Outputs:
 *   - Game count distributions for the relevant filters
 *   - Sample real psnConceptId values to manually probe Sony's pages
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });
import { PrismaClient } from '@prisma/client';
import { getPsnPrice, marketToLocale } from '../apps/api/src/services/psnPrices';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('=== Nintendo diagnostic ===');
  const totalGames = await prisma.game.count();
  const withNintendo = await prisma.game.count({ where: { nintendoTitleId: { not: null } } });
  const withNintendoAndUg = await prisma.game.count({
    where: { nintendoTitleId: { not: null }, userGames: { some: {} } },
  });
  const ntPlatform = await prisma.platform.findFirst({
    where: { code: 'NT' },
    select: { id: true, userId: true, lastSyncAt: true, syncStatus: true },
  });
  console.log(`  Total Game rows:               ${totalGames}`);
  console.log(`  Games with nintendoTitleId:    ${withNintendo}`);
  console.log(`  + at least one UserGame:       ${withNintendoAndUg}`);
  console.log(`  Switch Platform row:           ${ntPlatform ? `userId=${ntPlatform.userId} lastSync=${ntPlatform.lastSyncAt} status=${ntPlatform.syncStatus}` : 'none'}`);

  console.log('\n=== PSN diagnostic ===');
  const withPsn = await prisma.game.count({ where: { psnConceptId: { not: null } } });
  const withPsnAndUg = await prisma.game.count({
    where: { psnConceptId: { not: null }, userGames: { some: {} } },
  });
  console.log(`  Games with psnConceptId:       ${withPsn}`);
  console.log(`  + at least one UserGame:       ${withPsnAndUg}`);

  // Sample 3 real PSN games to do a live probe
  const samplePsn = await prisma.game.findMany({
    where: { psnConceptId: { not: null }, userGames: { some: {} } },
    select: { title: true, psnConceptId: true },
    take: 3,
  });
  console.log(`\nSample psnConceptId values:`);
  for (const s of samplePsn) console.log(`  ${s.title.padEnd(40)} conceptId=${s.psnConceptId}`);

  // Test getPsnPrice against the first 3
  if (samplePsn.length > 0) {
    const market = (await prisma.user.findFirst({
      where: { marketCode: { not: null } },
      select: { marketCode: true },
    }))?.marketCode ?? 'AT';
    const locale = marketToLocale(market);
    for (const s of samplePsn) {
      console.log(`\nLive probe — getPsnPrice("${s.title}", locale=${locale}):`);
      try {
        const p = await getPsnPrice(s.title, locale!);
        if (p) {
          console.log(`  GOT: title="${p.title}" regular=${p.regular}${p.currency} current=${p.current}${p.currency} discountPct=${p.discountPct} hasDiscount=${p.hasDiscount}`);
        } else {
          console.log(`  NULL — no usable SKU found via title search`);
        }
      } catch (e) {
        console.log(`  THREW: ${e instanceof Error ? e.message : e}`);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  await prisma.$disconnect();
}

void main();
