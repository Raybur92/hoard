import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  // Targeted delete: the specific Warlock Deal row produced by an older
  // PSN picker run before the 2026-06-03 apostrophe-normalisation fix.
  // Identified by exact gameId + shopId pair to avoid touching anything
  // else. After this, /api/deals should report Warlock absent.
  const result = await prisma.deal.deleteMany({
    where: {
      shopId: '-2', // PlayStation Store synthetic shopId
      game: { title: { equals: 'Warlock', mode: 'insensitive' } },
    },
  });
  console.log(`Deleted ${result.count} stale Warlock Deal row(s).`);
  await prisma.$disconnect();
})();
