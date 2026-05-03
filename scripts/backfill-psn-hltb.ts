/**
 * Backfill HLTB data for PSN games that don't have it yet.
 * Strategy: search Steam Store by title to find a Steam App ID, then use
 * hltbapi.codepotatoes.de/steam/{id}. Skips PS-exclusive titles that aren't
 * on Steam at all.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { fetchHltbBySteamId } from '../apps/api/src/services/hltb';

const prisma = new PrismaClient();
const DELAY_MS = 800; // Steam Store search is forgiving but don't hammer it

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface SteamStoreItem {
  id: number;
  name: string;
  type: string;
}

async function searchSteamStore(title: string): Promise<number | null> {
  try {
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;

    const data = await res.json() as { total: number; items: SteamStoreItem[] };
    const games = (data.items ?? []).filter((i) => i.type === 'app');
    if (!games.length) return null;

    const normTitle = normalize(title);
    for (const g of games) {
      if (normalize(g.name) === normTitle) return g.id;
    }
    // Accept top result if it starts with the same normalized prefix (handles subtitle differences)
    const top = games[0]!;
    if (normalize(top.name).startsWith(normTitle.slice(0, Math.max(8, normTitle.length - 3)))) {
      return top.id;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const candidates = await prisma.game.findMany({
    where: {
      hltbData: null,
      steamAppId: null,
      userGames: {
        some: { playtimeByPlatform: { path: ['PS'], not: null } },
      },
    },
    select: { id: true, igdbId: true, title: true },
    orderBy: { title: 'asc' },
  });

  console.log(`PSN games without HLTB: ${candidates.length}`);
  console.log(`Estimated time: ~${Math.ceil(candidates.length * DELAY_MS / 60000)} min\n`);

  let steamFound = 0;
  let hltbSaved = 0;

  for (let i = 0; i < candidates.length; i++) {
    const game = candidates[i]!;
    process.stdout.write(`[${i + 1}/${candidates.length}] ${game.title.slice(0, 45).padEnd(45)} `);

    const steamAppId = await searchSteamStore(game.title);
    if (!steamAppId) {
      console.log('no Steam match');
      await delay(DELAY_MS);
      continue;
    }

    steamFound++;
    try {
      await prisma.game.update({ where: { id: game.id }, data: { steamAppId } });
    } catch {
      // steamAppId unique constraint — another game already has it, skip HLTB
      console.log(`steam=${steamAppId} (duplicate, skipped)`);
      await delay(DELAY_MS);
      continue;
    }

    const hltb = await fetchHltbBySteamId(steamAppId);
    if (!hltb || (!hltb.mainStory && !hltb.mainExtras && !hltb.completionist)) {
      console.log(`steam=${steamAppId} no HLTB data`);
    } else {
      await prisma.hltbData.upsert({
        where: { gameId: game.id },
        update: {
          mainStory: hltb.mainStory,
          mainExtras: hltb.mainExtras,
          completionist: hltb.completionist,
          fetchedAt: new Date(),
        },
        create: {
          gameId: game.id,
          mainStory: hltb.mainStory,
          mainExtras: hltb.mainExtras,
          completionist: hltb.completionist,
        },
      });
      hltbSaved++;
      console.log(
        `steam=${steamAppId} main=${hltb.mainStory ? Math.round(hltb.mainStory / 60) + 'h' : '—'}`,
      );
    }

    await delay(DELAY_MS);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Steam matches found: ${steamFound} / ${candidates.length}`);
  console.log(`HLTB records saved: ${hltbSaved}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
