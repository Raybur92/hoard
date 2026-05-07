/**
 * Recovery script for a Steam Platform row stuck in `syncStatus: 'syncing'`.
 *
 * Symptom: Steam sync triggered but the async pass never finished — usually
 * because a Railway redeploy killed the in-memory promise mid-run. The DB
 * row stays `syncing` forever and the "sync now" button on PlatformDetail
 * is locked into a disabled `syncing…` state.
 *
 * Fix: flip the row to `error` so the UI re-enables the manual sync button.
 * The user can then click "sync now" to rerun the pass.
 *
 *   npx tsx scripts/unstick-steam-sync.ts
 *
 * History:
 *   - 2026-05-08 — Steam sync stuck since 2026-05-07T17:55 from a
 *     post-T3-deploy interruption. 1 row flipped.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.platform.findMany({
    where: { code: 'ST' },
    select: { id: true, userId: true, syncStatus: true, lastSyncAt: true },
  });
  console.log('Steam platforms before:', before);

  const result = await prisma.platform.updateMany({
    where: { code: 'ST', syncStatus: 'syncing' },
    data: { syncStatus: 'error' },
  });
  console.log(`\nUpdated ${result.count} Steam platform row(s) from 'syncing' → 'error'.`);

  const after = await prisma.platform.findMany({
    where: { code: 'ST' },
    select: { id: true, userId: true, syncStatus: true, lastSyncAt: true },
  });
  console.log('\nSteam platforms after:', after);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
