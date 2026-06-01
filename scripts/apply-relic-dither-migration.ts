/**
 * One-off migration applier for 20260601120000_game_relic_dither_svg.
 *
 * Same pattern as apply-game-tags-migration.ts — uses Prisma Client
 * (pgbouncer-safe) to dodge the documented `prisma migrate resolve` hang
 * against the Supabase pooler. Idempotent.
 *
 * Run from the monorepo root:
 *   npx tsx scripts/apply-relic-dither-migration.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(process.cwd(), 'apps/api/.env') });

const prisma = new PrismaClient();
const MIGRATION_NAME = '20260601120000_game_relic_dither_svg';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function migrationRecorded(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations WHERE migration_name = ${MIGRATION_NAME} LIMIT 1
  `;
  return rows.length > 0;
}

async function main(): Promise<void> {
  console.log('[migration] starting apply for', MIGRATION_NAME);

  if (await columnExists('Game', 'relicDitherSvg')) {
    console.log('[migration] ✓ column Game.relicDitherSvg already exists, skipping');
  } else {
    console.log('[migration] → adding column Game.relicDitherSvg');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Game" ADD COLUMN "relicDitherSvg" TEXT`,
    );
    console.log('[migration] ✓ column Game.relicDitherSvg added');
  }

  if (await migrationRecorded()) {
    console.log(`[migration] ✓ ${MIGRATION_NAME} already recorded in _prisma_migrations, skipping`);
  } else {
    console.log(`[migration] → inserting row into _prisma_migrations`);
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'packages/db/prisma/migrations', MIGRATION_NAME, 'migration.sql'),
      'utf8',
    );
    const checksum = createHash('sha256').update(migrationSql).digest('hex');

    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations (
        id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
      ) VALUES (
        ${randomUUID()}, ${checksum}, NOW(), ${MIGRATION_NAME}, NULL, NULL, NOW(), 1
      )
      ON CONFLICT (id) DO NOTHING
    `;
    console.log(`[migration] ✓ ${MIGRATION_NAME} recorded`);
  }

  console.log('[migration] verifying final state…');
  const verifiedColumns = await prisma.$queryRaw<Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'Game' AND column_name = 'relicDitherSvg'
    LIMIT 1
  `;
  for (const c of verifiedColumns) {
    const nullable = c.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
    console.log(`  Game.${c.column_name}: ${c.data_type} ${nullable}`);
  }
  if (verifiedColumns.length !== 1) {
    throw new Error(`Expected 1 column, found ${verifiedColumns.length}`);
  }

  console.log('[migration] DONE');
}

main()
  .catch((err) => {
    console.error('[migration] FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
