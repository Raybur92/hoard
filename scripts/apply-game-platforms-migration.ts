/**
 * One-off migration applier for 20260602100000_game_platforms_array.
 * Same pgbouncer-safe recipe as apply-game-tags-migration.ts.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(process.cwd(), 'apps/api/.env') });

const prisma = new PrismaClient();
const MIGRATION_NAME = '20260602100000_game_platforms_array';

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
  if (await columnExists('Game', 'platforms')) {
    console.log('[migration] ✓ Game.platforms already exists, skipping DDL');
  } else {
    console.log('[migration] → adding Game.platforms column');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Game" ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    );
    console.log('[migration] ✓ added');
  }

  if (await migrationRecorded()) {
    console.log(`[migration] ✓ ${MIGRATION_NAME} already recorded`);
  } else {
    const sql = readFileSync(
      resolve(process.cwd(), 'packages/db/prisma/migrations', MIGRATION_NAME, 'migration.sql'),
      'utf8',
    );
    const checksum = createHash('sha256').update(sql).digest('hex');
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
  console.log('[migration] DONE');
}

main()
  .catch((err) => { console.error('[migration] FAILED:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
