/**
 * One-time cleanup: delete Deal rows with fetchedAt older than 7 days.
 *
 * These are stale rows where a sale ended but the per-game cleanup
 * missed them (bug fixed 2026-06-23: seenShopIds now only includes
 * shops with active discounts, not all shops that responded).
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../apps/api/.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  console.log('Deleting Deal rows with fetchedAt <', sevenDaysAgo.toISOString());

  const result = await prisma.deal.deleteMany({
    where: { fetchedAt: { lt: sevenDaysAgo } },
  });
  console.log('Deleted stale Deal rows:', result.count);

  await prisma.$disconnect();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
