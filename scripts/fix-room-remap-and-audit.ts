/**
 * Fix Andrea's "Room Room → The Room" stuck pre-R2 remap, then audit the
 * rest of the DB for other pre-R2 stuck remaps.
 *
 * Phase 1 (mutating, transactional, idempotent):
 *   - Move steamAppId 288160 from "Room Room" (igdbId 176336) to "The Room"
 *     (igdbId 11625). This is the R2 fold applied retroactively for the one
 *     remap that landed before R2 shipped.
 *   - Delete the duplicate Room Room UserGame that the post-remap Steam
 *     sync re-created (addedAt 2026-06-01). The Room UserGame survives.
 *   - All inside one prisma.$transaction so we never end up in a half-state.
 *   - Idempotent: if The Room already owns 288160 and Room Room has no
 *     UserGame, the script reports "already fixed" and skips.
 *
 * Phase 2 (read-only audit):
 *   - Find every Game row that holds at least one platform-side ID
 *     (steamAppId / psnConceptId / xboxTitleId / gogAppId / itchGameId /
 *     epicCatalogItemId / nintendoTitleId) but has ZERO UserGames pointing
 *     at it across the whole DB. Those are the strongest candidates for
 *     stuck pre-R2 remap sources — they're holding a platform ID that next
 *     sync will resolve back to them, but no user actually has them in
 *     their library. Print the candidate list for review.
 *
 *   npx tsx scripts/fix-room-remap-and-audit.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROOM_ROOM_IGDB = 176336;
const THE_ROOM_IGDB = 11625;
const STEAM_APP_ID = 288160;

async function phase1Fix() {
  console.log('\n=== Phase 1 — fix "Room Room → The Room" ===\n');

  const roomRoom = await prisma.game.findUnique({
    where: { igdbId: ROOM_ROOM_IGDB },
    select: { id: true, title: true, steamAppId: true },
  });
  const theRoom = await prisma.game.findUnique({
    where: { igdbId: THE_ROOM_IGDB },
    select: { id: true, title: true, steamAppId: true },
  });

  if (!roomRoom || !theRoom) {
    console.log('  ! Could not find one or both Game rows. Aborting.');
    console.log(`    Room Room: ${roomRoom ? roomRoom.id : 'MISSING'}`);
    console.log(`    The Room:  ${theRoom ? theRoom.id : 'MISSING'}`);
    return;
  }

  console.log(`  Room Room  (id=${roomRoom.id}) steamAppId=${roomRoom.steamAppId}`);
  console.log(`  The Room   (id=${theRoom.id}) steamAppId=${theRoom.steamAppId}`);

  // Idempotent guards
  const dupUsergames = await prisma.userGame.findMany({
    where: { gameId: roomRoom.id },
    select: { id: true, userId: true, addedAt: true },
  });

  if (theRoom.steamAppId === STEAM_APP_ID && roomRoom.steamAppId === null && dupUsergames.length === 0) {
    console.log('  ✓ Already in target state — skipping.');
    return;
  }

  if (theRoom.steamAppId !== null && theRoom.steamAppId !== STEAM_APP_ID) {
    console.log(`  ! The Room already has steamAppId=${theRoom.steamAppId}, not ${STEAM_APP_ID}. Refusing to overwrite.`);
    return;
  }

  if (roomRoom.steamAppId !== null && roomRoom.steamAppId !== STEAM_APP_ID) {
    console.log(`  ! Room Room has steamAppId=${roomRoom.steamAppId}, not ${STEAM_APP_ID}. Aborting — unexpected state.`);
    return;
  }

  console.log(`  → ${dupUsergames.length} Room Room UserGame(s) to delete.`);

  await prisma.$transaction(async (tx) => {
    // Clear FIRST to release the @unique constraint before we set the same
    // value on The Room (same ordering R2 uses in routes/games.ts).
    if (roomRoom.steamAppId === STEAM_APP_ID) {
      await tx.game.update({
        where: { id: roomRoom.id },
        data: { steamAppId: null },
      });
      console.log(`    ✓ Cleared steamAppId on Room Room`);
    }
    if (theRoom.steamAppId === null) {
      await tx.game.update({
        where: { id: theRoom.id },
        data: { steamAppId: STEAM_APP_ID },
      });
      console.log(`    ✓ Set steamAppId=${STEAM_APP_ID} on The Room`);
    }
    for (const ug of dupUsergames) {
      await tx.userGame.delete({ where: { id: ug.id } });
      console.log(`    ✓ Deleted UserGame ${ug.id} (user=${ug.userId}, addedAt=${ug.addedAt.toISOString()})`);
    }
  });

  console.log('\n  ✓ Phase 1 complete. Next Steam sync will hit P2002 recovery → route to The Room.\n');
}

async function phase2Audit() {
  console.log('\n=== Phase 2 — audit stuck pre-R2 remap candidates ===\n');

  // Find Game rows with ANY platform-side ID and ZERO UserGames pointing
  // at them. These are the strongest candidates: they hold a platform ID
  // that the next platform sync will resolve back to them, but no user
  // actually has the game in their library (the only way that's stable is
  // if everyone who once did has remapped away).
  const candidates = await prisma.game.findMany({
    where: {
      AND: [
        {
          OR: [
            { steamAppId: { not: null } },
            { psnConceptId: { not: null } },
            { xboxTitleId: { not: null } },
            { gogAppId: { not: null } },
            { itchGameId: { not: null } },
            { epicCatalogItemId: { not: null } },
            { nintendoTitleId: { not: null } },
          ],
        },
        { userGames: { none: {} } },
      ],
    },
    select: {
      id: true,
      igdbId: true,
      title: true,
      steamAppId: true,
      psnConceptId: true,
      xboxTitleId: true,
      gogAppId: true,
      itchGameId: true,
      epicCatalogItemId: true,
      nintendoTitleId: true,
      psnNpCommunicationId: true,
    },
    orderBy: { title: 'asc' },
  });

  console.log(`  Found ${candidates.length} Game row(s) with a platform-side ID and no UserGames.\n`);

  if (candidates.length === 0) {
    console.log('  (none — DB looks clean)');
    return;
  }

  // Caveat: this audit also surfaces FALSE POSITIVES — any Game that was
  // touched by HLTB lookup (which can set gogAppId / steamAppId on Game
  // rows that no user ever added) or by a wishlist toggle that later got
  // removed. We print everything; Andrea reviews. Sorting steamAppId-first
  // since Steam is the most common pre-R2 case.
  for (const c of candidates) {
    const ids: string[] = [];
    if (c.steamAppId !== null) ids.push(`steamAppId=${c.steamAppId}`);
    if (c.psnConceptId !== null) ids.push(`psnConceptId=${c.psnConceptId}`);
    if (c.xboxTitleId !== null) ids.push(`xboxTitleId=${c.xboxTitleId}`);
    if (c.gogAppId !== null) ids.push(`gogAppId=${c.gogAppId}`);
    if (c.itchGameId !== null) ids.push(`itchGameId=${c.itchGameId}`);
    if (c.epicCatalogItemId !== null) ids.push(`epicCatalogItemId=${c.epicCatalogItemId}`);
    if (c.nintendoTitleId !== null) ids.push(`nintendoTitleId=${c.nintendoTitleId}`);
    if (c.psnNpCommunicationId !== null) ids.push(`psnNpCommunicationId=${c.psnNpCommunicationId}`);
    console.log(`  "${c.title}"  (igdbId=${c.igdbId})`);
    console.log(`     ${ids.join(' · ')}`);
  }

  console.log(`\n  Note: HLTB lookups also write platform IDs (gogAppId in particular) onto Game rows`);
  console.log(`  without anyone owning the game, so some of these will be benign false positives.`);
  console.log(`  Steam/PSN/Xbox/itch/Epic/Nintendo IDs are more reliable signals of stuck remaps.`);
}

async function main() {
  await phase1Fix();
  await phase2Audit();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
