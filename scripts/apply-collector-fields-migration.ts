/**
 * One-off migration applier for 20260522180000_usergame_collector_fields.
 *
 * Uses Prisma Client (honors pgbouncer=true from DATABASE_URL → prepared
 * statements disabled → no s1-collision on retries) rather than the
 * `prisma db execute` / `migrate resolve` CLI path which has the
 * documented hang quirk against the Supabase pgbouncer pooler.
 *
 * Per the TL1.1 fallback recipe in CLAUDE.md operational gotchas.
 *
 * Idempotent: checks current state before each DDL, skips if already
 * applied. Safe to re-run.
 *
 * Run from the monorepo root via `npx tsx scripts/apply-collector-fields-migration.ts`.
 * Loads DATABASE_URL from `apps/api/.env` automatically (same pattern as
 * the other scripts in this directory).
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(process.cwd(), 'apps/api/.env') });

const prisma = new PrismaClient();
const MIGRATION_NAME = '20260522180000_usergame_collector_fields';

async function typeExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ typname: string }>>`
    SELECT typname FROM pg_type WHERE typname = ${name} LIMIT 1
  `;
  return rows.length > 0;
}

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
  console.log('[migration] checking current state…');

  // ── enums ──
  // pg_type.typname is lowercased even when CREATE TYPE used a quoted PascalCase name.
  const enumChecks = [
    { typname: 'MediaType', sql: `CREATE TYPE "MediaType" AS ENUM ('DIGITAL', 'PHYSICAL')` },
    { typname: 'Condition', sql: `CREATE TYPE "Condition" AS ENUM ('LOOSE', 'CIB', 'SEALED', 'REPLICA', 'GRADED')` },
    { typname: 'Region',    sql: `CREATE TYPE "Region" AS ENUM ('NTSC_U', 'NTSC_J', 'PAL', 'OTHER')` },
  ];
  for (const e of enumChecks) {
    if (await typeExists(e.typname)) {
      console.log(`[migration] ✓ enum ${e.typname} already exists, skipping`);
    } else {
      console.log(`[migration] → creating enum ${e.typname}`);
      await prisma.$executeRawUnsafe(e.sql);
      console.log(`[migration] ✓ enum ${e.typname} created`);
    }
  }

  // ── columns ──
  const colChecks = [
    { name: 'mediaType',           sql: `ALTER TABLE "UserGame" ADD COLUMN "mediaType" "MediaType"` },
    { name: 'condition',           sql: `ALTER TABLE "UserGame" ADD COLUMN "condition" "Condition"` },
    { name: 'region',              sql: `ALTER TABLE "UserGame" ADD COLUMN "region" "Region"` },
    { name: 'wishlistedPlatforms', sql: `ALTER TABLE "UserGame" ADD COLUMN "wishlistedPlatforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` },
  ];
  for (const c of colChecks) {
    if (await columnExists('UserGame', c.name)) {
      console.log(`[migration] ✓ column UserGame.${c.name} already exists, skipping`);
    } else {
      console.log(`[migration] → adding column UserGame.${c.name}`);
      await prisma.$executeRawUnsafe(c.sql);
      console.log(`[migration] ✓ column UserGame.${c.name} added`);
    }
  }

  // ── _prisma_migrations row ──
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

  // ── verify ──
  console.log('[migration] verifying final state…');
  const verifiedColumns = await prisma.$queryRaw<Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'UserGame'
      AND column_name IN ('mediaType', 'condition', 'region', 'wishlistedPlatforms')
    ORDER BY column_name
  `;
  console.log('[migration] final UserGame columns:');
  for (const c of verifiedColumns) {
    const nullable = c.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
    const def = c.column_default ? ` default ${c.column_default}` : '';
    console.log(`  ${c.column_name}: ${c.data_type} ${nullable}${def}`);
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
