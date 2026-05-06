/**
 * Read-only HLTB coverage audit. Prints counts only — no DB writes.
 *
 * Goal: distinguish the structural gap (games with no steamAppId can't have
 * HLTB via the runner — fetchHltb returns null without an id) from the
 * operational gap (games with steamAppId but no HltbData row — failed fetch
 * or never triggered).
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%';
  return ((n / total) * 100).toFixed(1) + '%';
}

async function main(): Promise<void> {
  const totalGames = await prisma.game.count();
  const withSteamId = await prisma.game.count({ where: { steamAppId: { not: null } } });
  const withoutSteamId = totalGames - withSteamId;

  const totalHltb = await prisma.hltbData.count();

  // HLTB rows whose Game has steamAppId set
  const hltbWithSteamId = await prisma.hltbData.count({
    where: { game: { steamAppId: { not: null } } },
  });
  // HLTB rows whose Game has NO steamAppId (would have been backfilled via
  // scripts/backfill-psn-hltb.ts → Steam Store search, then steamAppId stored).
  // If this is 0, every HLTB record traces back to a Steam-sourced appid.
  const hltbWithoutSteamId = totalHltb - hltbWithSteamId;

  // Games WITH steamAppId but WITHOUT HltbData — operational gap, backfillable
  const steamIdNoHltb = await prisma.game.count({
    where: { steamAppId: { not: null }, hltbData: null },
  });

  // Games WITHOUT steamAppId AND WITHOUT HltbData — structural gap
  const noSteamIdNoHltb = await prisma.game.count({
    where: { steamAppId: null, hltbData: null },
  });

  // Stale: HLTB rows fetched more than 30 days ago (the documented refresh TTL)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const staleHltb = await prisma.hltbData.count({ where: { fetchedAt: { lt: thirtyDaysAgo } } });

  // Sample 10 games missing HLTB so we can eyeball patterns
  const sampleMissing = await prisma.game.findMany({
    where: { hltbData: null },
    select: { title: true, steamAppId: true, igdbId: true, releaseYear: true },
    orderBy: { title: 'asc' },
    take: 10,
  });

  console.log('=== HLTB Coverage Audit ===\n');

  console.log(`Total Game rows:          ${totalGames}`);
  console.log(`  with steamAppId:        ${withSteamId} (${pct(withSteamId, totalGames)})`);
  console.log(`  without steamAppId:     ${withoutSteamId} (${pct(withoutSteamId, totalGames)})`);
  console.log('');

  console.log(`Total HltbData rows:      ${totalHltb} (${pct(totalHltb, totalGames)} of all games)`);
  console.log(`  via Game.steamAppId:    ${hltbWithSteamId}`);
  console.log(`  without steamAppId:     ${hltbWithoutSteamId} (should be 0 — fetchHltb requires steamAppId)`);
  console.log('');

  console.log('Coverage by group:');
  console.log(`  steamAppId games:       ${withSteamId - steamIdNoHltb}/${withSteamId} have HLTB (${pct(withSteamId - steamIdNoHltb, withSteamId)})`);
  console.log(`  non-steamAppId games:   ${withoutSteamId - noSteamIdNoHltb}/${withoutSteamId} have HLTB (${pct(withoutSteamId - noSteamIdNoHltb, withoutSteamId)})`);
  console.log('');

  console.log('Gap analysis:');
  console.log(`  Operational gap (steamAppId present, no HLTB row): ${steamIdNoHltb}`);
  console.log('    → these can be backfilled by re-running fetchHltbBySteamId');
  console.log(`  Structural gap (no steamAppId, no HLTB row):       ${noSteamIdNoHltb}`);
  console.log('    → require Steam Store title search to map to an appid first');
  console.log(`    → scripts/backfill-psn-hltb.ts handles this for PSN games`);
  console.log('');

  console.log(`Stale HltbData (fetchedAt > 30 days ago): ${staleHltb} (${pct(staleHltb, totalHltb)} of HLTB rows)`);
  console.log('');

  console.log('Sample (10) of games missing HLTB:');
  for (const g of sampleMissing) {
    const tag = g.steamAppId ? `steamAppId=${g.steamAppId}` : 'no steamAppId';
    const year = g.releaseYear ? ` (${g.releaseYear})` : '';
    console.log(`  - ${g.title}${year} — igdbId=${g.igdbId}, ${tag}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
