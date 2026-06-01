/**
 * One-off migration applier for 20260601200000_bundle. Pgbouncer-safe
 * via Prisma Client (same recipe as other migrations).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(process.cwd(), 'apps/api/.env') });

const prisma = new PrismaClient();
const MIGRATION_NAME = '20260601200000_bundle';

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${table}
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
  const migrationSql = readFileSync(
    resolve(process.cwd(), 'packages/db/prisma/migrations', MIGRATION_NAME, 'migration.sql'),
    'utf8',
  );

  if (await tableExists('Bundle')) {
    console.log('[migration] ✓ Bundle table already exists, skipping DDL');
  } else {
    console.log('[migration] → creating Bundle table + indexes (separate statements)');
    // Each DDL as its own call so pgbouncer transaction-mode doesn't
    // strand the second/third statement before the first commits.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Bundle" (
        "id"           TEXT PRIMARY KEY,
        "itadBundleId" INTEGER NOT NULL UNIQUE,
        "title"        TEXT NOT NULL,
        "shopId"       INTEGER NOT NULL,
        "shopName"     TEXT NOT NULL,
        "url"          TEXT NOT NULL,
        "detailsUrl"   TEXT,
        "publishedAt"  TIMESTAMP(3),
        "expiresAt"    TIMESTAMP(3),
        "isMature"     BOOLEAN NOT NULL DEFAULT FALSE,
        "gameCount"    INTEGER NOT NULL DEFAULT 0,
        "mediaCount"   INTEGER NOT NULL DEFAULT 0,
        "tiers"        JSONB NOT NULL DEFAULT '[]'::jsonb,
        "itadGameIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        "fetchedAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX "Bundle_expiresAt_idx" ON "Bundle"("expiresAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "Bundle_itadGameIds_idx" ON "Bundle" USING GIN ("itadGameIds")`);
    console.log('[migration] ✓ Bundle table + indexes created');
  }

  if (await migrationRecorded()) {
    console.log(`[migration] ✓ ${MIGRATION_NAME} already recorded`);
  } else {
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
  console.log('[migration] DONE');
}

main()
  .catch((err) => { console.error('[migration] FAILED:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
