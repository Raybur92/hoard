// EV-PR1 — one-shot seed: fetch IGDB events + populate Event + EventGame
// tables. Same code path as POST /api/admin/events/sync; bypasses the
// admin auth dance for the initial seed.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { syncAllEvents } from '../apps/api/src/services/events';

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
