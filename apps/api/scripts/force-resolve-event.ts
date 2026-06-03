// Diagnostic: bypass the slugCache and force-resolve a single event.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { clearEventsCaches, resolveEventGames } from '../src/services/events';

async function main() {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: tsx force-resolve-event.ts <slug>'); process.exit(1); }
  clearEventsCaches();
  const prisma = new PrismaClient();
  console.log(`[force] resolving ${slug}…`);
  const t0 = Date.now();
  const result = await resolveEventGames(prisma, slug);
  console.log(`[force] done in ${Date.now() - t0}ms`);
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
