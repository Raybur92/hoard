/**
 * Backfill HLTB data for all games that don't have it yet.
 * Step 1: re-query Steam API to populate steamAppId on Game records (title match)
 * Step 2: fetch HLTB data via codepotatoes.de for games with a steamAppId
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });
import { PrismaClient } from '@prisma/client';
import { fetchHltbBySteamId } from '../apps/api/src/services/hltb';

const prisma = new PrismaClient();
const DELAY_MS = 300;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Steam library fetch ───────────────────────────────────────────────────────

async function fetchSteamLibrary(steamId: string): Promise<Map<string, number>> {
  const apiKey = process.env['STEAM_API_KEY'];
  if (!apiKey) throw new Error('STEAM_API_KEY not configured');

  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API error: ${res.status}`);

  const data = await res.json() as { response: { games?: Array<{ appid: number; name: string }> } };
  const map = new Map<string, number>();
  for (const g of data.response.games ?? []) {
    map.set(normalize(g.name), g.appid);
  }
  return map;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Get Andrea's Steam credentials
  const platform = await prisma.platform.findFirst({
    where: { code: 'ST' },
    select: { credentials: true },
  });
  const steamId = (platform?.credentials as { steamId?: string } | null)?.steamId;
  if (!steamId) throw new Error('No Steam platform found in DB');

  console.log(`Fetching Steam library for ${steamId}...`);
  const steamMap = await fetchSteamLibrary(steamId);
  console.log(`Steam library: ${steamMap.size} games\n`);

  // Step 1: populate steamAppId for games missing it
  const gamesWithoutSteamId = await prisma.game.findMany({
    where: { steamAppId: null },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  });

  console.log(`── Step 1: match steamAppId for ${gamesWithoutSteamId.length} games ──`);

  let steamIdFilled = 0;
  for (const g of gamesWithoutSteamId) {
    const appId = steamMap.get(normalize(g.title));
    if (appId) {
      try {
        await prisma.game.update({ where: { id: g.id }, data: { steamAppId: appId } });
        steamIdFilled++;
      } catch {
        // Unique constraint — skip duplicates
      }
    }
  }

  console.log(`Step 1 done: ${steamIdFilled} steam IDs matched.\n`);

  // Step 2: fetch HLTB for games with steamAppId but no HLTB data
  const gamesNeedingHltb = await prisma.game.findMany({
    where: { hltbData: null, steamAppId: { not: null } },
    select: { id: true, steamAppId: true, title: true },
    orderBy: { title: 'asc' },
  });

  console.log(`── Step 2: fetch HLTB for ${gamesNeedingHltb.length} games (~${Math.ceil(gamesNeedingHltb.length * DELAY_MS / 60000)} min) ──`);

  let hltbFilled = 0;
  let hltbSkipped = 0;

  for (let i = 0; i < gamesNeedingHltb.length; i++) {
    const g = gamesNeedingHltb[i]!;
    process.stdout.write(`[${i + 1}/${gamesNeedingHltb.length}] ${g.title.slice(0, 50).padEnd(50)} `);

    const result = await fetchHltbBySteamId(g.steamAppId!);
    if (!result || (!result.mainStory && !result.mainExtras && !result.completionist)) {
      console.log('—');
      hltbSkipped++;
    } else {
      await prisma.hltbData.upsert({
        where: { gameId: g.id },
        update: { mainStory: result.mainStory, mainExtras: result.mainExtras, completionist: result.completionist, fetchedAt: new Date() },
        create: { gameId: g.id, mainStory: result.mainStory, mainExtras: result.mainExtras, completionist: result.completionist },
      });
      console.log(`main: ${result.mainStory ? Math.round(result.mainStory / 60) + 'h' : '—'}`);
      hltbFilled++;
    }

    if (i < gamesNeedingHltb.length - 1) await delay(DELAY_MS);
  }

  console.log(`\nDone. ${hltbFilled} saved, ${hltbSkipped} not found.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
