/**
 * Read-only audit: surfaces UserGames where the matched IGDB game's platform
 * list doesn't include the platform that synced it. These are the high-
 * confidence mismatches like "God of War Ragnarök" being matched to a
 * mobile-only Korean MMO called "Ragnarok: War of Gods" (real bug from
 * 2026-05-08 — see CLAUDE.md "Recent fixes").
 *
 * Output is a printed list per-user. No DB writes. Andrea/Luigi eyeball the
 * list and remap suspicious entries via Prisma Studio (or, eventually, a
 * GameDetail remap UI — v2).
 *
 * Limitations:
 *   - Catches the "wrong-platform IGDB result" class (Ragnarok-MMO case).
 *   - Does NOT catch wrong-sequel matches like "Slay the Spire 2" beating
 *     "Slay the Spire" — those games ARE on the right platform; the title
 *     is just wrong. The new pickBestMatch() path prevents these going
 *     forward; existing rows need user verification to spot.
 *   - Makes ~N IGDB calls, throttled to ~3/s under IGDB's 4/s limit. With
 *     ~1000 games per user the run is ~5 minutes — acceptable for a one-off.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';
import { getGame } from '../apps/api/src/services/igdb';
import { __testing as matchInternals } from '../apps/api/src/services/igdbMatch';

const prisma = new PrismaClient();
const { PLATFORM_TO_IGDB_NAMES } = matchInternals;

const SYNC_PLATFORM_CODES = ['ST', 'PS', 'XB', 'GG'] as const;
type SyncCode = typeof SYNC_PLATFORM_CODES[number];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function auditUser(userId: string, email: string | null): Promise<void> {
  const userGames = await prisma.userGame.findMany({
    where: { userId },
    include: { game: true },
    orderBy: { addedAt: 'desc' },
  });

  // Filter to UserGames where the user has actually synced something via a
  // syncable platform — i.e., playtimeByPlatform has a key in our sync set.
  const candidates = userGames.filter((ug) => {
    const ptbp = (ug.playtimeByPlatform ?? {}) as Record<string, number>;
    return SYNC_PLATFORM_CODES.some((c) => ptbp[c] !== undefined);
  });

  if (candidates.length === 0) {
    console.log(`\n== USER ${email ?? userId} ==`);
    console.log('  (no sync-derived games — nothing to audit)');
    return;
  }

  console.log(`\n== USER ${email ?? userId} ==`);
  console.log(`  Auditing ${candidates.length} sync-derived games against IGDB platforms…`);

  const suspicious: Array<{
    title: string;
    igdbId: number;
    userGameId: string;
    syncedVia: SyncCode[];
    igdbPlatforms: string[];
  }> = [];

  let i = 0;
  for (const ug of candidates) {
    i++;
    const ptbp = (ug.playtimeByPlatform ?? {}) as Record<string, number>;
    const syncedVia = SYNC_PLATFORM_CODES.filter((c) => ptbp[c] !== undefined);

    const igdb = await getGame(ug.game.igdbId).catch(() => null);
    await delay(330); // ~3 req/s

    if (!igdb) continue; // IGDB failed to resolve — not actionable here

    if (igdb.platforms.length === 0) continue; // IGDB has no platform data — can't cross-check

    // For each platform the user actually synced from, check whether IGDB
    // lists a matching platform on the matched game.
    const allMatched = syncedVia.every((code) => {
      const expected = PLATFORM_TO_IGDB_NAMES[code] ?? [];
      return igdb.platforms.some((p) => expected.includes(p));
    });

    if (!allMatched) {
      suspicious.push({
        title: ug.game.title,
        igdbId: ug.game.igdbId,
        userGameId: ug.id,
        syncedVia,
        igdbPlatforms: igdb.platforms,
      });
    }

    if (i % 50 === 0) console.log(`    [${i}/${candidates.length}]`);
  }

  if (suspicious.length === 0) {
    console.log(`  No platform mismatches detected.`);
    return;
  }

  console.log(`\n  ${suspicious.length} suspicious match${suspicious.length === 1 ? '' : 'es'} (IGDB platforms don't include the synced platform):\n`);
  for (const s of suspicious) {
    console.log(`  ✗ "${s.title}"`);
    console.log(`    igdbId=${s.igdbId}  userGameId=${s.userGameId}`);
    console.log(`    synced via [${s.syncedVia.join(', ')}]  IGDB platforms [${s.igdbPlatforms.join(', ')}]`);
    console.log();
  }
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`Found ${users.length} user${users.length === 1 ? '' : 's'}.`);
  for (const u of users) {
    await auditUser(u.id, u.email);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
