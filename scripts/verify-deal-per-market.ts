import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  // Verify marketCode column exists + has data
  const counts = await prisma.$queryRawUnsafe<Array<{ marketCode: string; n: bigint }>>(
    `SELECT "marketCode", COUNT(*)::bigint AS n FROM "Deal" GROUP BY "marketCode" ORDER BY n DESC`,
  );
  console.log('Deal rows by marketCode:');
  counts.forEach((c) => console.log(`  ${c.marketCode}: ${c.n}`));
  const snapCounts = await prisma.$queryRawUnsafe<Array<{ marketCode: string; n: bigint }>>(
    `SELECT "marketCode", COUNT(*)::bigint AS n FROM "PriceSnapshot" GROUP BY "marketCode" ORDER BY n DESC`,
  );
  console.log('PriceSnapshot rows by marketCode:');
  snapCounts.forEach((c) => console.log(`  ${c.marketCode}: ${c.n}`));
  // Verify the new unique index
  const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE tablename IN ('Deal', 'PriceSnapshot') ORDER BY tablename, indexname`,
  );
  console.log('Indexes on Deal + PriceSnapshot:');
  indexes.forEach((i) => console.log(`  ${i.indexname}`));
  await prisma.$disconnect();
})();
