/**
 * Records the 20260603120000_deal_per_market migration in _prisma_migrations
 * (DDL was already applied successfully by apply-deal-per-market-migration.ts).
 * Splits this out because the original recipe used a 65-char checksum string
 * that violated the varchar(64) constraint.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = '20260603120000_deal_per_market';
const CHECKSUM = '0000000000000000000000000000000000000000000000000000000000000000'; // 64 chars

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      SELECT gen_random_uuid()::text, ${CHECKSUM}, NOW(), ${MIGRATION_NAME}, NULL, NULL, NOW(), 1
      WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME});
    `;
    console.log('✓ Migration recorded (or already present).');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
