/**
 * Investigate why Nintendo sync isn't populating Game.nintendoTitleId.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  /* How many UserGames exist that have NT in playtimeByPlatform? */
  const allUgs = await prisma.userGame.findMany({
    select: { id: true, gameId: true, playtimeByPlatform: true, status: true },
  });
  let ntUgs = 0;
  const ntGameIds = new Set<string>();
  for (const ug of allUgs) {
    const ptb = ug.playtimeByPlatform as Record<string, number> | null;
    if (ptb && 'NT' in ptb) {
      ntUgs++;
      ntGameIds.add(ug.gameId);
    }
  }
  console.log(`UserGames with NT in playtimeByPlatform: ${ntUgs}`);
  console.log(`Distinct Game IDs:                       ${ntGameIds.size}`);

  /* What's the most recent PlatformLog entry for NT? */
  const ntPlat = await prisma.platform.findFirst({ where: { code: 'NT' }, select: { id: true, userId: true } });
  if (ntPlat) {
    const logs = await prisma.platformLog.findMany({
      where: { platformId: ntPlat.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { createdAt: true, level: true, message: true, details: true },
    });
    console.log(`\nLast ${logs.length} NT platform log entries:\n`);
    for (const l of logs) {
      console.log(`  ${l.createdAt.toISOString().slice(11, 19)}  [${l.level}]  ${l.message}`);
      if (l.details) console.log(`    details: ${JSON.stringify(l.details).slice(0, 200)}`);
    }
  }

  /* Sample a few NT-tagged UserGames to see what Game rows they point to */
  if (ntGameIds.size > 0) {
    const sample = await prisma.game.findMany({
      where: { id: { in: [...ntGameIds].slice(0, 5) } },
      select: { title: true, igdbId: true, nintendoTitleId: true, steamAppId: true, psnConceptId: true },
    });
    console.log(`\nSample of NT-tagged Games:`);
    for (const g of sample) {
      console.log(`  ${g.title.padEnd(40)} nintendoTitleId=${g.nintendoTitleId} igdbId=${g.igdbId} steamAppId=${g.steamAppId}`);
    }
  }

  await prisma.$disconnect();
}

void main();
