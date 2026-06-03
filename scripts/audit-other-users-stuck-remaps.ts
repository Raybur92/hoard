/**
 * Read-only — find stuck-remap-class problems across all users.
 *
 * Two detection signals:
 *
 *   (A) "Andrea's pattern" — user has TWO UserGames whose Games look like
 *       the same actual game (fuzzy title similarity ≥ 0.8) AND share at
 *       least one identical playtime entry per platform. The newer entry
 *       is almost certainly a sync-recreation after a pre-R2 remap.
 *
 *   (B) Orphan stuck IDs per platform — same as the global audit but
 *       useful for context: any Game row that holds a platform-side ID
 *       AND has zero UserGames. We already audited this for the whole
 *       DB; this run just prints user-attribution context where we can
 *       infer it.
 *
 *   npx tsx scripts/audit-other-users-stuck-remaps.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[®™:'.,!?\-–—()+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((t) => t.length > 1));
}

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

interface UgRow {
  id: string;
  status: string;
  addedAt: Date;
  playtimeByPlatform: Record<string, number>;
  achievementsByPlatform: Record<string, { earned: number; total: number; percent: number }>;
  game: {
    id: string;
    igdbId: number;
    title: string;
    steamAppId: number | null;
    psnConceptId: number | null;
    xboxTitleId: bigint | null;
    gogAppId: number | null;
  };
}

function platformsPresent(pt: Record<string, number>): string[] {
  return Object.keys(pt);
}

function sharesPlatform(a: Record<string, number>, b: Record<string, number>): { code: string; aMin: number; bMin: number } | null {
  for (const code of platformsPresent(a)) {
    if (b[code] !== undefined) {
      return { code, aMin: a[code], bMin: b[code] };
    }
  }
  return null;
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      _count: { select: { userGames: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== Users (${users.length}) ===\n`);
  for (const u of users) {
    console.log(`  ${u.email ?? u.name ?? '(no email)'}  id=${u.id}  ugames=${u._count.userGames}`);
  }

  console.log(`\n=== Signal A — duplicate-look UserGames per user ===\n`);

  for (const u of users) {
    const ugs = (await prisma.userGame.findMany({
      where: { userId: u.id },
      select: {
        id: true,
        status: true,
        addedAt: true,
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
    })) as unknown as UgRow[];

    const flagged: Array<{ a: UgRow; b: UgRow; sim: number; sharedPlatform: ReturnType<typeof sharesPlatform> }> = [];

    for (let i = 0; i < ugs.length; i++) {
      for (let j = i + 1; j < ugs.length; j++) {
        const a = ugs[i];
        const b = ugs[j];
        const sim = similarity(a.game.title, b.game.title);
        if (sim < 0.8) continue;
        const sp = sharesPlatform(a.playtimeByPlatform, b.playtimeByPlatform);
        if (!sp) continue;
        // Only interesting if the same platform's playtime is identical
        // (within 1 min slack for sync rounding) — strongest signal of
        // "same actual game, sync re-recorded the same minutes".
        if (Math.abs(sp.aMin - sp.bMin) <= 1) {
          flagged.push({ a, b, sim, sharedPlatform: sp });
        }
      }
    }

    if (flagged.length === 0) continue;

    console.log(`\n  --- ${u.email ?? u.name ?? '(no email)'} (id=${u.id}, ${flagged.length} flagged pair${flagged.length === 1 ? '' : 's'}) ---`);
    for (const { a, b, sim, sharedPlatform } of flagged) {
      console.log(`\n    ${a.game.title}  (igdbId=${a.game.igdbId})`);
      console.log(`      status=${a.status} addedAt=${a.addedAt.toISOString()} playtime=${JSON.stringify(a.playtimeByPlatform)}`);
      console.log(`      ids: steamAppId=${a.game.steamAppId} psnConceptId=${a.game.psnConceptId} xboxTitleId=${a.game.xboxTitleId} gogAppId=${a.game.gogAppId}`);
      console.log(`    ${b.game.title}  (igdbId=${b.game.igdbId})`);
      console.log(`      status=${b.status} addedAt=${b.addedAt.toISOString()} playtime=${JSON.stringify(b.playtimeByPlatform)}`);
      console.log(`      ids: steamAppId=${b.game.steamAppId} psnConceptId=${b.game.psnConceptId} xboxTitleId=${b.game.xboxTitleId} gogAppId=${b.game.gogAppId}`);
      console.log(`    similarity=${sim.toFixed(2)} sharedPlatform=${sharedPlatform!.code} mins=${sharedPlatform!.aMin}/${sharedPlatform!.bMin}`);
    }
  }

  console.log(`\n=== Signal B — Game rows with platform IDs and zero UserGames anywhere ===\n`);
  const orphans = await prisma.game.findMany({
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
    select: { igdbId: true, title: true, steamAppId: true, psnConceptId: true, xboxTitleId: true, gogAppId: true },
    orderBy: { title: 'asc' },
  });
  console.log(`  ${orphans.length} orphan Game rows. (Same list as the prior global audit — not user-attributable without remap history.)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
