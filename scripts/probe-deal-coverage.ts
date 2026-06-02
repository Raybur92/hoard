/**
 * DEALS workstream — coverage probe.
 *
 * Two checks:
 *  1. What shops are currently represented in the Deal table? (groupBy
 *     shopName). Tells us which storefronts ITAD has actually been
 *     returning prices for during the sync runs.
 *  2. For 3 known console-only titles in Andrea's library, query ITAD
 *     directly and dump the per-shop response. Tells us whether ITAD has
 *     coverage that the classifier is filtering out, or whether ITAD
 *     genuinely has zero console-shop data.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { lookupItadIdsBySteamAppIds, lookupItadIdsByTitles, getPricesForGames, isItadConfigured } from '../apps/api/src/services/itad';
import { classifyShop } from '../apps/api/src/services/deals/storefronts';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (!isItadConfigured()) {
    console.error('ITAD_API_KEY missing');
    process.exit(1);
  }

  console.log('===  Deal table — shopName distribution  ===\n');
  const dealCounts = await prisma.deal.groupBy({
    by: ['shopName'],
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  });
  for (const row of dealCounts) {
    const tier = classifyShop(row.shopName);
    console.log(`  ${row.shopName.padEnd(28)} ${tier.padEnd(12)} ${row._count._all}`);
  }

  console.log('\n===  ITAD raw response for 3 PSN-leaning titles  ===\n');
  // Use 3 PSN-exclusive (or PSN-leaning) titles from Andrea's library.
  // These shouldn't appear on Steam/GOG at all — if ITAD returns
  // shops for them, those shops should be PSN.
  const titles = ['Astro Bot', 'God of War Ragnarök', "Marvel's Spider-Man: Miles Morales"];
  const lookups = await lookupItadIdsByTitles(titles);
  console.log(`title lookups: ${lookups.size}/${titles.length} resolved`);
  const titleToItadId = Array.from(lookups.entries());
  const itadIds = titleToItadId.map(([, id]) => id);
  if (itadIds.length === 0) {
    console.log('no titles resolved; skipping price probe');
  } else {
    const user = await prisma.user.findFirst({ where: { marketCode: { not: null } }, select: { marketCode: true } });
    const market = user?.marketCode ?? 'AT';
    console.log(`probing market: ${market}\n`);
    const prices = await getPricesForGames(itadIds, market);
    for (const p of prices) {
      const matchingTitle = titleToItadId.find(([, id]) => id === p.id)?.[0] ?? '(unknown)';
      console.log(`\n  ${matchingTitle}  (itadId=${p.id})`);
      if (p.deals.length === 0) {
        console.log('    (no deals returned)');
      } else {
        for (const d of p.deals) {
          const tier = classifyShop(d.shop.name);
          console.log(`    shop=${d.shop.name.padEnd(24)} tier=${tier.padEnd(12)} cut=${d.cut}%  price=${d.price.amount}${d.price.currency}`);
        }
      }
    }
  }

  console.log('\n===  Same probe but Steam-keyed titles for comparison  ===\n');
  const steamTitles = [
    { title: 'Hollow Knight', appId: 367520 },
    { title: 'Half-Life 2', appId: 220 },
    { title: 'Counter-Strike 2', appId: 730 },
  ];
  const steamMap = await lookupItadIdsBySteamAppIds(steamTitles.map((t) => t.appId));
  const market = 'AT';
  const steamItadIds = Array.from(steamMap.values());
  const steamPrices = await getPricesForGames(steamItadIds, market);
  for (const t of steamTitles) {
    const itadId = steamMap.get(t.appId);
    if (!itadId) { console.log(`  ${t.title} — no itadId resolved`); continue; }
    const p = steamPrices.find((x) => x.id === itadId);
    if (!p || p.deals.length === 0) { console.log(`  ${t.title} — no deals`); continue; }
    console.log(`\n  ${t.title}  (itadId=${itadId})`);
    for (const d of p.deals) {
      const tier = classifyShop(d.shop.name);
      console.log(`    shop=${d.shop.name.padEnd(24)} tier=${tier.padEnd(12)} cut=${d.cut}%`);
    }
  }

  await prisma.$disconnect();
}

void main();
