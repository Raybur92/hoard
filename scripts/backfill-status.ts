/**
 * One-time backfill: for all Backlog games, set status to OnHold if any
 * platform playtime > 0, otherwise leave as Backlog.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const games = await prisma.userGame.findMany({
    where: { status: 'Backlog' },
    select: { id: true, playtimeByPlatform: true },
  });

  const toOnHold: string[] = [];

  for (const g of games) {
    const playtime = g.playtimeByPlatform as Record<string, number>;
    const totalMinutes = Object.values(playtime).reduce<number>((s, m) => s + (m ?? 0), 0);
    if (totalMinutes > 0) toOnHold.push(g.id);
  }

  if (toOnHold.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  const result = await prisma.userGame.updateMany({
    where: { id: { in: toOnHold } },
    data: { status: 'OnHold' },
  });

  console.log(`Updated ${result.count} games → On Hold (had playtime).`);
  console.log(`${games.length - result.count} games remain in Backlog (no playtime).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
