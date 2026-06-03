/**
 * For each stuck-remap candidate from fix-room-remap-and-audit.ts, find
 * Andrea's existing UserGames whose title best matches the candidate so
 * we can suggest a fold target. Read-only.
 *
 *   npx tsx scripts/suggest-stuck-remap-targets.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// igdbIds of the 19 candidates surfaced by the audit
const CANDIDATE_IGDB_IDS = [
  55056,   // Age of Empires II: Definitive Edition
  11575,   // Arma II: DayZ
  9781,    // Beyond Divinity
  1005,    // Blasphemous II
  2368,    // Dark Souls II
  21040,   // Dark Souls: Prepare to Die Edition
  671,     // Divine Divinity
  78459,   // Divinity II: Developer's Cut
  328284,  // Dragon Ball: Sparking! Zero - DLC
  395816,  // Dredge+
  325591,  // Elden Ring Nightreign
  8773,    // Homeworld: Remastered Collection
  315367,  // LEGO Harry Potter Collection
  384426,  // Maneater
  2977,    // Mortal Kombat: Komplete Edition
  109277,  // Samurai Shodown
  20740,   // The Witcher 2: Assassins of Kings - Enhanced Edition
  318779,  // Triangle Strategy
  20871,   // Zombie Army Trilogy
];

// Andrea's userId from the prior phase 1 run
const ANDREA_USER_ID = 'cmooks9ey0000ho06z65remze';

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[®™:'.,!?\-–—()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((t) => t.length > 1));
}

// Jaccard similarity of token sets, with bonus for shared multi-word prefixes
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  return jaccard;
}

async function main() {
  // Pull Andrea's library + all candidate Game rows
  const userGames = await prisma.userGame.findMany({
    where: { userId: ANDREA_USER_ID },
    select: {
      id: true,
      status: true,
      playtimeByPlatform: true,
      achievementsByPlatform: true,
      game: {
        select: {
          id: true,
          igdbId: true,
          title: true,
          steamAppId: true,
          psnConceptId: true,
          xboxTitleId: true,
          gogAppId: true,
        },
      },
    },
  });

  const candidates = await prisma.game.findMany({
    where: { igdbId: { in: CANDIDATE_IGDB_IDS } },
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
  });

  console.log(`\nMatching ${candidates.length} candidates against ${userGames.length} of your UserGames.\n`);

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

    // Rank user's UserGames by title similarity
    const scored = userGames
      .map((ug) => ({ ug, score: similarity(c.title, ug.game.title) }))
      .filter((s) => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log(`■ "${c.title}"  (igdbId=${c.igdbId})`);
    console.log(`    holding: ${ids.join(' · ')}`);
    if (scored.length === 0) {
      console.log(`    (no library matches — probably benign)`);
    } else {
      for (const { ug, score } of scored) {
        const pt = JSON.stringify(ug.playtimeByPlatform);
        console.log(`    → ${ug.game.title}  (igdbId=${ug.game.igdbId}, score=${score.toFixed(2)})`);
        console.log(`         status=${ug.status} playtime=${pt}`);
        console.log(`         existing platform IDs: steamAppId=${ug.game.steamAppId} psnConceptId=${ug.game.psnConceptId} xboxTitleId=${ug.game.xboxTitleId} gogAppId=${ug.game.gogAppId}`);
      }
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
