import { config } from 'dotenv';
config({ path: 'apps/api/.env' });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Same scope as backfill-game-hero-image: every Game on every user's
  // Library overview shelves. Wipe heroImageUrl so the backfill re-runs
  // and picks up the new screenshots-first priority.
  const PER_STATUS = 12;
  const STATUSES = ['Playing', 'OnHold', 'Completed', 'Backlog', 'Dropped'] as const;
  const users = await prisma.user.findMany({ select: { id: true } });
  const gameIds = new Set<string>();
  for (const u of users) {
    for (const status of STATUSES) {
      const rows = await prisma.userGame.findMany({
        where: { userId: u.id, status },
        orderBy: { lastPlayedAt: 'desc' },
        take: PER_STATUS,
        select: { gameId: true },
      });
      rows.forEach((r) => gameIds.add(r.gameId));
    }
    const wishlistRows = await prisma.userGame.findMany({
      where: {
        userId: u.id,
        OR: [{ status: 'Wishlist' }, { wishlistedPlatforms: { isEmpty: false } }],
      },
      orderBy: { addedAt: 'desc' },
      take: PER_STATUS,
      select: { gameId: true },
    });
    wishlistRows.forEach((r) => gameIds.add(r.gameId));
  }
  const result = await prisma.game.updateMany({
    where: { id: { in: [...gameIds] } },
    data: { heroImageUrl: null },
  });
  console.log(`Cleared heroImageUrl on ${result.count} games. Now run scripts/backfill-game-hero-image.ts to repopulate with screenshots-first priority.`);
}
main().finally(() => prisma.$disconnect());
