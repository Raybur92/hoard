/**
 * Apply Andrea's confirmed stuck-remap cleanup (2026-06-03).
 *
 * FOLDS (move platform-side IDs from source Game row → target Game row,
 *        cleared on source first to release @unique constraints):
 *   1. LEGO Harry Potter Collection: steamAppId 2950340  315367 → 25083
 *   2. Triangle Strategy: steamAppId 1850510 + psnNpCommunicationId
 *      NPWR47523_00                                     318779 → 143610
 *   3. Maneater: steamAppId 629820                      384426 → 46800
 *   4. Dragon Ball: Sparking! Zero DLC → base game:
 *      steamAppId 3456600                               328284 → 279634
 *
 * CLEARS (null the steamAppId on the stuck Game row, no fold — these are
 *         games Andrea doesn't own and where folding into another Game
 *         row isn't possible due to @unique constraint or no target):
 *   5. Elden Ring Nightreign (igdbId 325591)
 *   6. Age of Empires II: Definitive Edition (igdbId 55056)
 *   7. The Witcher 2: Assassins of Kings - Enhanced Edition (igdbId 20740)
 *
 * Idempotent: each step checks current state before mutating.
 *
 *   npx tsx scripts/apply-stuck-remap-cleanup.ts
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Fold {
  label: string;
  sourceIgdb: number;
  targetIgdb: number;
  fields: Record<string, number | string>;
}

interface Clear {
  label: string;
  igdb: number;
  fields: Record<string, null>;
}

const FOLDS: Fold[] = [
  {
    label: 'LEGO Harry Potter Collection',
    sourceIgdb: 315367,
    targetIgdb: 25083,
    fields: { steamAppId: 2950340 },
  },
  {
    label: 'Triangle Strategy',
    sourceIgdb: 318779,
    targetIgdb: 143610,
    fields: { steamAppId: 1850510, psnNpCommunicationId: 'NPWR47523_00' },
  },
  {
    label: 'Maneater',
    sourceIgdb: 384426,
    targetIgdb: 46800,
    fields: { steamAppId: 629820 },
  },
  {
    label: 'Dragon Ball: Sparking! Zero DLC → base',
    sourceIgdb: 328284,
    targetIgdb: 279634,
    fields: { steamAppId: 3456600 },
  },
];

const CLEARS: Clear[] = [
  { label: 'Elden Ring Nightreign', igdb: 325591, fields: { steamAppId: null } },
  { label: 'Age of Empires II: Definitive Edition', igdb: 55056, fields: { steamAppId: null } },
  { label: 'The Witcher 2: Assassins of Kings - Enhanced Edition', igdb: 20740, fields: { steamAppId: null } },
];

async function applyFold(f: Fold) {
  const source = await prisma.game.findUnique({ where: { igdbId: f.sourceIgdb } });
  const target = await prisma.game.findUnique({ where: { igdbId: f.targetIgdb } });
  if (!source) {
    console.log(`  ! ${f.label} — source igdbId=${f.sourceIgdb} missing, skipping`);
    return;
  }
  if (!target) {
    console.log(`  ! ${f.label} — target igdbId=${f.targetIgdb} missing, skipping`);
    return;
  }

  // Build the actual fold per R2 rule (source has + target null only)
  const clearOnSource: Record<string, null> = {};
  const setOnTarget: Record<string, number | string> = {};
  const skipReasons: string[] = [];
  for (const [field, expectedValue] of Object.entries(f.fields)) {
    const sourceVal = (source as unknown as Record<string, unknown>)[field];
    const targetVal = (target as unknown as Record<string, unknown>)[field];
    if (sourceVal === null || sourceVal === undefined) {
      skipReasons.push(`${field}: already null on source`);
      continue;
    }
    if (sourceVal !== expectedValue) {
      skipReasons.push(`${field}: source has ${JSON.stringify(sourceVal)}, expected ${JSON.stringify(expectedValue)}`);
      continue;
    }
    if (targetVal !== null && targetVal !== undefined) {
      skipReasons.push(`${field}: target already has ${JSON.stringify(targetVal)} (would overwrite)`);
      continue;
    }
    clearOnSource[field] = null;
    setOnTarget[field] = expectedValue;
  }

  console.log(`  → ${f.label}  (${f.sourceIgdb} → ${f.targetIgdb})`);
  if (skipReasons.length > 0) {
    for (const r of skipReasons) console.log(`      skip: ${r}`);
  }
  if (Object.keys(setOnTarget).length === 0) {
    console.log(`      nothing to fold (idempotent)`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.game.update({ where: { id: source.id }, data: clearOnSource });
    await tx.game.update({ where: { id: target.id }, data: setOnTarget });
  });
  for (const k of Object.keys(setOnTarget)) {
    console.log(`      ✓ moved ${k}=${JSON.stringify(setOnTarget[k])}`);
  }
}

async function applyClear(c: Clear) {
  const game = await prisma.game.findUnique({ where: { igdbId: c.igdb } });
  if (!game) {
    console.log(`  ! ${c.label} — igdbId=${c.igdb} missing, skipping`);
    return;
  }
  const toClear: Record<string, null> = {};
  for (const field of Object.keys(c.fields)) {
    const val = (game as unknown as Record<string, unknown>)[field];
    if (val !== null && val !== undefined) toClear[field] = null;
  }

  console.log(`  → ${c.label}  (igdb=${c.igdb})`);
  if (Object.keys(toClear).length === 0) {
    console.log(`      already cleared (idempotent)`);
    return;
  }
  await prisma.game.update({ where: { id: game.id }, data: toClear });
  for (const k of Object.keys(toClear)) {
    console.log(`      ✓ cleared ${k}`);
  }
}

async function main() {
  console.log('\n=== Folds ===\n');
  for (const f of FOLDS) await applyFold(f);
  console.log('\n=== Clears ===\n');
  for (const c of CLEARS) await applyClear(c);
  console.log('\n✓ Done.\n');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
