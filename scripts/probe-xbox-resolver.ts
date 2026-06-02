/**
 * DEALS-PR2.5 — figure out the xboxTitleId → bigId resolver path.
 *
 * The Display Catalog products endpoint takes `bigIds` (e.g.
 * `9P2N57MC619K`). We capture `Game.xboxTitleId` (numeric int from
 * OpenXBL's M-series sync). Need to find a path that resolves the
 * latter to the former.
 *
 * Two candidates documented around Microsoft's catalog APIs:
 *   1. `/v7.0/products/lookup?alternateIds.IdType=XboxTitleId&alternateIds.IdValue=<id>`
 *   2. `/v7.0/products?legacyXboxProductId=<id>` (may exist as alias)
 *   3. Search endpoint with the titleId as a query term
 */

import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UA = 'Mozilla/5.0 (Hoard probe)';

async function probe(label: string, url: string): Promise<void> {
  console.log(`\n── ${label} ──`);
  console.log(`  URL: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  console.log(`  Status: ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  const txt = await res.text();
  if (ct.includes('json')) {
    try {
      const parsed = JSON.parse(txt) as unknown;
      const preview = JSON.stringify(parsed).slice(0, 800);
      console.log(`  Body preview: ${preview}`);
    } catch {
      console.log(`  Raw: ${txt.slice(0, 400)}`);
    }
  } else {
    console.log(`  Raw: ${txt.slice(0, 400)}`);
  }
}

async function main(): Promise<void> {
  /* Pull a sample of Andrea's actual xboxTitleId values */
  const games = await prisma.game.findMany({
    where: { xboxTitleId: { not: null }, userGames: { some: {} } },
    select: { title: true, xboxTitleId: true },
    take: 5,
  });
  console.log('Sample xboxTitleIds from DB:');
  for (const g of games) console.log(`  ${g.title.padEnd(50)} xboxTitleId=${g.xboxTitleId}`);

  if (games.length === 0) {
    console.log('No xbox titles in DB; nothing to test against');
    await prisma.$disconnect();
    return;
  }

  const id = games[0]!.xboxTitleId!;
  console.log(`\nProbing resolver candidates for ${games[0]!.title} (xboxTitleId=${id}):`);

  /* Candidate 1 — alternateIds parameter on products endpoint */
  await probe(
    'alternateIds.IdType=XboxTitleId',
    `https://displaycatalog.mp.microsoft.com/v7.0/products?alternateIds.IdType=XboxTitleId&alternateIds.IdValue=${id}&market=AT&languages=de-AT`,
  );

  /* Candidate 2 — same but lowercase or with `=` style */
  await probe(
    'alternateId.idType / idValue style',
    `https://displaycatalog.mp.microsoft.com/v7.0/products?alternateId.idType=XboxTitleId&alternateId.idValue=${id}&market=AT&languages=de-AT`,
  );

  /* Candidate 3 — legacyXboxProductId */
  await probe(
    'legacyXboxProductId',
    `https://displaycatalog.mp.microsoft.com/v7.0/products?legacyXboxProductId=${id}&market=AT&languages=de-AT`,
  );

  /* Candidate 4 — search endpoint */
  await probe(
    'search by id',
    `https://displaycatalog.mp.microsoft.com/v7.0/products?query=${id}&market=AT&languages=de-AT`,
  );

  /* Candidate 5 — Xbox Live's titles-mapping endpoint (different host) */
  await probe(
    'titlehub by xboxTitleId',
    `https://titlehub.xboxlive.com/titles/titleids(${id})/decoration/detail`,
  );

  /* Candidate 6 — public catalog search */
  const hex = Number(id).toString(16).toUpperCase();
  await probe(
    'productLookup by XboxTitleId hex',
    `https://displaycatalog.mp.microsoft.com/v7.0/productLookup?productIds=${hex}&market=AT&languages=de-AT`,
  );

  await prisma.$disconnect();
}

void main();
