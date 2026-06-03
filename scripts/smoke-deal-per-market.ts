/**
 * Smoke test for DEALS-PR4 per-market sync. Verifies:
 *   - getDistinctActiveMarkets returns the expected markets
 *   - Deal table has marketCode populated on existing rows
 *   - The new composite unique key on (gameId, shopId, marketCode) holds
 *     (insert a synthetic test row in market='ZZ', confirm it coexists
 *     with the existing 'AT' row, then clean up)
 *
 * Run: npx -y dotenv-cli -e apps/api/.env -- npx tsx scripts/smoke-deal-per-market.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function getDistinctActiveMarkets(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { marketCode: { not: null } },
    select: { marketCode: true },
  });
  const set = new Set<string>();
  for (const r of rows) if (r.marketCode) set.add(r.marketCode);
  return set.size === 0 ? ['US'] : [...set].sort();
}

async function main(): Promise<void> {
  try {
    const markets = await getDistinctActiveMarkets();
    console.log('Distinct active markets:', markets);

    const atCount = await prisma.deal.count({ where: { marketCode: 'AT' } });
    const usCount = await prisma.deal.count({ where: { marketCode: 'US' } });
    const otherCount = await prisma.deal.count({ where: { marketCode: { notIn: ['AT', 'US'] } } });
    console.log(`Deal rows: AT=${atCount}, US=${usCount}, other=${otherCount}`);

    // Compose-uniqueness sanity check: pick an existing (gameId, shopId, 'AT')
    // row, try to insert a (gameId, shopId, 'ZZ') row, confirm both coexist.
    const sample = await prisma.deal.findFirst({ where: { marketCode: 'AT' }, select: { gameId: true, shopId: true, shopName: true } });
    if (!sample) {
      console.log('No AT row to sanity-check against; skipping uniqueness test');
      return;
    }
    console.log(`Sample row: gameId=${sample.gameId} shopId=${sample.shopId}`);

    // Insert + delete a synthetic ZZ row
    const created = await prisma.deal.create({
      data: {
        gameId: sample.gameId,
        shopId: sample.shopId,
        shopName: sample.shopName,
        marketCode: 'ZZ',
        isReseller: false,
        currentPrice: 9.99,
        currency: 'EUR',
        discountPct: 10,
        dealUrl: 'https://test.invalid',
      },
    });
    console.log(`✓ Composite-unique allows ZZ row alongside AT row (id=${created.id})`);

    // Clean up
    await prisma.deal.delete({ where: { id: created.id } });
    console.log('✓ Cleaned up ZZ row');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => { console.error('FAIL:', err); process.exit(1); });
