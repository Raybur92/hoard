/**
 * Apply the DEALS-PR4 per-market migration via Prisma Client $executeRawUnsafe.
 * Use this when `prisma db execute` hangs against the pgbouncer pooler
 * (documented in CLAUDE.md operational gotchas).
 *
 * Run with the API .env loaded so DATABASE_URL points at production:
 *   cd /path/to/Hoard
 *   npx -y dotenv-cli -e apps/api/.env -- npx tsx scripts/apply-deal-per-market-migration.ts
 *
 * Idempotent: every statement uses IF (NOT) EXISTS where possible.
 * Also writes the _prisma_migrations row directly because `migrate
 * resolve` reliably hangs against pgbouncer too.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = '20260603120000_deal_per_market';

const STATEMENTS = [
  `ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "marketCode" VARCHAR NOT NULL DEFAULT 'AT'`,
  `ALTER TABLE "Deal" ALTER COLUMN "marketCode" DROP DEFAULT`,
  `ALTER TABLE "PriceSnapshot" ADD COLUMN IF NOT EXISTS "marketCode" VARCHAR NOT NULL DEFAULT 'AT'`,
  `ALTER TABLE "PriceSnapshot" ALTER COLUMN "marketCode" DROP DEFAULT`,
  `DROP INDEX IF EXISTS "Deal_gameId_shopId_key"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Deal_gameId_shopId_marketCode_key" ON "Deal"("gameId", "shopId", "marketCode")`,
  `DROP INDEX IF EXISTS "PriceSnapshot_gameId_shopId_snapshotAt_idx"`,
  `CREATE INDEX IF NOT EXISTS "PriceSnapshot_gameId_shopId_marketCode_snapshotAt_idx" ON "PriceSnapshot"("gameId", "shopId", "marketCode", "snapshotAt" DESC)`,
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (let i = 0; i < STATEMENTS.length; i++) {
      const sql = STATEMENTS[i]!;
      console.log(`[${i + 1}/${STATEMENTS.length}] ${sql.slice(0, 80)}...`);
      await prisma.$executeRawUnsafe(sql);
    }
    console.log('--- SQL applied. Recording migration row...');
    const checksum = '00000000000000000000000000000000000000000000000000000000000000000';
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      SELECT gen_random_uuid()::text, ${checksum}, NOW(), ${MIGRATION_NAME}, NULL, NULL, NOW(), 1
      WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME});
    `;
    console.log('✓ Migration applied + recorded.');
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
