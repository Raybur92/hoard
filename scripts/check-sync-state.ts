import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const total = await prisma.deal.count();
  const latest = await prisma.deal.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } });
  const now = new Date();
  const ageSec = latest?.fetchedAt ? Math.round((now.getTime() - latest.fetchedAt.getTime()) / 1000) : null;
  console.log('Total deals:', total);
  console.log('Last fetched:', latest?.fetchedAt?.toISOString(), ageSec !== null ? `(${ageSec}s ago)` : '');
  await prisma.$disconnect();
})();
