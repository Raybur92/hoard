import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  // Find any Deal rows on Game(s) whose title contains "warlock"
  const rows = await prisma.deal.findMany({
    where: { game: { title: { contains: 'Warlock', mode: 'insensitive' } } },
    select: {
      id: true, shopName: true, shopId: true, marketCode: true,
      currentPrice: true, discountPct: true, dealUrl: true,
      fetchedAt: true,
      game: { select: { title: true, igdbId: true } },
    },
  });
  console.log(`Found ${rows.length} Deal row(s) on Warlock-named games:`);
  rows.forEach((r) => {
    console.log(`  [${r.shopName}] (shopId=${r.shopId} mkt=${r.marketCode}) "${r.game.title}" (igdb=${r.game.igdbId}): €${r.currentPrice} -${r.discountPct}% fetched=${r.fetchedAt.toISOString()}`);
    console.log(`    url: ${r.dealUrl}`);
  });
  await prisma.$disconnect();
})();
