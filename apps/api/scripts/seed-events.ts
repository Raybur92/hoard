// EV-PR1 — one-shot seed run from inside apps/api so the import path
// stays inside this workspace's tsconfig. Same code as syncAllEvents
// invoked by POST /api/admin/events/sync; bypasses admin auth for the
// initial seed.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { syncAllEvents } from '../src/services/events';

async function main() {
  const prisma = new PrismaClient();
  console.log('[seed] fetching IGDB events + resolving games…');
  const start = Date.now();
  const result = await syncAllEvents(prisma);
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`[seed] done in ${elapsed}s`);
  console.log(`[seed]   scanned: ${result.scanned}`);
  console.log(`[seed]   eventsUpserted: ${result.eventsUpserted}`);
  console.log(`[seed]   gamesUpserted: ${result.gamesUpserted}`);
  console.log(`[seed]   gameLinksUpserted: ${result.gameLinksUpserted}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
