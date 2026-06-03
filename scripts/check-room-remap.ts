/**
 * Read-only diagnostic — check the DB state for "The Room" vs "Room Room"
 * after Andrea's reported remap-reversion.
 *
 *   npx tsx scripts/check-room-remap.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { title: { contains: 'Room', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      igdbId: true,
      title: true,
      developer: true,
      releaseYear: true,
      steamAppId: true,
      psnConceptId: true,
      xboxTitleId: true,
      gogAppId: true,
      psnNpCommunicationId: true,
    },
    orderBy: { title: 'asc' },
  });

  console.log(`\n=== Game rows matching "Room" (${games.length}) ===\n`);
  for (const g of games) {
    console.log(`  ${g.title}  (igdbId=${g.igdbId}, gameId=${g.id})`);
    console.log(`    dev="${g.developer}" year=${g.releaseYear}`);
    console.log(`    steamAppId=${g.steamAppId} · psnConceptId=${g.psnConceptId} · xboxTitleId=${g.xboxTitleId} · gogAppId=${g.gogAppId}`);
    console.log(`    psnNpCommunicationId=${g.psnNpCommunicationId}`);
  }

  // Filter down to The Room / Room Room specifically
  const interesting = games.filter(g =>
    /^the room$/i.test(g.title) ||
    /^room room$/i.test(g.title)
  );

  console.log(`\n=== UserGame rows for Andrea on those Game rows ===\n`);
  for (const g of interesting) {
    const ugs = await prisma.userGame.findMany({
      where: { gameId: g.id },
      select: {
        id: true,
        userId: true,
        status: true,
        playtimeByPlatform: true,
        achievementsByPlatform: true,
        addedAt: true,
        lastPlayedAt: true,
        notes: true,
        rating: true,
        user: { select: { email: true, name: true } },
      },
    });
    console.log(`  --- Game "${g.title}" (igdbId=${g.igdbId}) ---`);
    if (ugs.length === 0) {
      console.log(`      (no UserGames)`);
    } else {
      for (const ug of ugs) {
        console.log(`      UserGame ${ug.id}`);
        console.log(`        user=${ug.user.email ?? ug.user.name} status=${ug.status}`);
        console.log(`        playtime=${JSON.stringify(ug.playtimeByPlatform)}`);
        console.log(`        achievements=${JSON.stringify(ug.achievementsByPlatform)}`);
        console.log(`        addedAt=${ug.addedAt.toISOString()} lastPlayed=${ug.lastPlayedAt?.toISOString() ?? '—'}`);
        console.log(`        notes=${ug.notes ? JSON.stringify(ug.notes).slice(0, 80) : '—'} rating=${ug.rating}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
