/**
 * One-off migration applier for 20260526120000_game_xbox_title_id.
 *
 * Mirrors scripts/apply-collector-fields-migration.ts — uses Prisma
 * Client ($executeRawUnsafe / $executeRaw) which honors pgbouncer=true
 * from DATABASE_URL (prepared statements disabled → no s1-collision on
 * retries) instead of `prisma db execute` / `migrate resolve` CLI which
 * has the documented hang quirk against Supabase's pgbouncer pooler.
 *
 * Idempotent: checks current state before each DDL, skips if already
 * applied. Safe to re-run.
 *
 * Run from the monorepo root via
 *   `npx tsx scripts/apply-xbox-title-id-migration.ts`.
 * Loads DATABASE_URL from `apps/api/.env` automatically.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(process.cwd(), 'apps/api/.env') });

const prisma = new PrismaClient();
const MIGRATION_NAME = '20260526120000_game_xbox_title_id';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE indexname = ${name} LIMIT 1
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

  // ── column ──
  if (await columnExists('Game', 'xboxTitleId')) {
    console.log('[migration] ✓ Game.xboxTitleId already exists, skipping');
  } else {
    console.log('[migration] → adding column Game.xboxTitleId');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Game" ADD COLUMN "xboxTitleId" INTEGER`);
    console.log('[migration] ✓ column added');
  }

  // ── unique index ──
  if (await indexExists('Game_xboxTitleId_key')) {
    console.log('[migration] ✓ Game_xboxTitleId_key index already exists, skipping');
  } else {
    console.log('[migration] → creating unique index Game_xboxTitleId_key');
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "Game_xboxTitleId_key" ON "Game"("xboxTitleId")`,
    );
    console.log('[migration] ✓ unique index created');
  }

  // ── _prisma_migrations row ──
  if (await migrationRecorded()) {
    console.log(`[migration] ✓ ${MIGRATION_NAME} already recorded in _prisma_migrations, skipping`);
  } else {
    console.log(`[migration] → recording in _prisma_migrations`);
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

  // ── verify ──
  console.log('[migration] verifying final state…');
  const verified = await prisma.$queryRaw<Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'Game' AND column_name = 'xboxTitleId'
  `;
  for (const c of verified) {
    const nullable = c.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
    console.log(`  ${c.column_name}: ${c.data_type} ${nullable}`);
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
