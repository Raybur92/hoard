/**
 * DEALS-PR2.5 — probe gg.deals API with a real key.
 *
 * Goal: determine the actual response shape. The docs only describe
 * `currentRetail` + `currentKeyshops` as aggregate numbers, but the
 * website displays per-store breakdowns including PSN / Nintendo /
 * Microsoft Store. We want to find out whether:
 *   (a) the documented endpoint returns aggregates ONLY (docs are
 *       complete; per-store data lives elsewhere)
 *   (b) the documented endpoint actually returns more than docs say
 *       (undocumented fields in response)
 *   (c) there are undocumented query params that expose per-store data
 *
 * Usage:
 *   GG_DEALS_API_KEY=your_key npx tsx scripts/probe-gg-deals-with-key.ts
 *
 * Hits 4 known Steam App IDs:
 *   1593500  God of War (PC port; also on PSN)
 *   367520   Hollow Knight (PC + Switch)
 *   1086940  Baldur's Gate 3 (multi-platform)
 *   2222560  Astro's Playroom / Astro Bot search    (likely null — PSN exclusive)
 */

const KEY = process.env['GG_DEALS_API_KEY'];
if (!KEY) {
  console.error('GG_DEALS_API_KEY env var missing. Run as:');
  console.error('  GG_DEALS_API_KEY=your_key npx tsx scripts/probe-gg-deals-with-key.ts');
  process.exit(1);
}

const STEAM_APP_IDS = [
  { id: 1593500, label: 'God of War (PC port)' },
  { id: 367520, label: 'Hollow Knight' },
  { id: 1086940, label: "Baldur's Gate 3" },
];

// gg.deals doesn't support 'at' (Austria) directly. Valid regions per
// docs: au, be, br, ca, ch, de, dk, es, eu, fi, fr, gb, ie, it, nl, no,
// pl, se, us. For Andrea (AT market) we fall through to 'eu' which is
// the generic Eurozone aggregate.
const REGION = 'eu';

async function probe(label: string, url: string): Promise<void> {
  console.log(`\n── ${label} ──`);
  console.log(`  URL: ${url.replace(KEY!, '<KEY>')}`);
  try {
    const res = await fetch(url);
    console.log(`  Status: ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    console.log(`  CType:  ${ct}`);
    if (remaining || limit) console.log(`  Rate:   ${remaining}/${limit} remaining`);

    const txt = await res.text();
    if (ct.includes('json')) {
      try {
        const body = JSON.parse(txt) as unknown;
        console.log(`  Body (full):\n${JSON.stringify(body, null, 2)}`);
      } catch {
        console.log(`  Body (raw): ${txt.slice(0, 1000)}`);
      }
    } else {
      console.log(`  Body (text, first 600): ${txt.slice(0, 600)}`);
    }
  } catch (e) {
    console.log(`  ERR: ${e instanceof Error ? e.message : e}`);
  }
}

async function main(): Promise<void> {
  console.log(`=== gg.deals API probe (region=${REGION}) ===`);

  /* 1. Documented endpoint, multiple IDs at once */
  const ids = STEAM_APP_IDS.map((g) => g.id).join(',');
  await probe(
    'GET /v1/prices/by-steam-app-id/ — documented endpoint',
    `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=${ids}&key=${KEY}&region=${REGION}`,
  );

  /* 2. Try common undocumented params that might expose per-store data */
  await probe(
    'Try ?detailed=true',
    `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=367520&key=${KEY}&region=${REGION}&detailed=true`,
  );
  await probe(
    'Try ?include=stores',
    `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=367520&key=${KEY}&region=${REGION}&include=stores`,
  );
  await probe(
    'Try ?expand=offers',
    `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=367520&key=${KEY}&region=${REGION}&expand=offers`,
  );

  /* 3. Try a /stores or /offers endpoint shape */
  await probe(
    'Try /v1/offers/by-steam-app-id/ (does this path exist?)',
    `https://api.gg.deals/v1/offers/by-steam-app-id/?ids=367520&key=${KEY}&region=${REGION}`,
  );
  await probe(
    'Try /v1/stores/by-steam-app-id/ (does this path exist?)',
    `https://api.gg.deals/v1/stores/by-steam-app-id/?ids=367520&key=${KEY}&region=${REGION}`,
  );

  /* 4. Active bundles to confirm bundle endpoint works + see its shape */
  await probe(
    'GET /v1/bundles/active/',
    `https://api.gg.deals/v1/bundles/active/?key=${KEY}&region=${REGION}`,
  );

  console.log('\n=== probe done ===');
}

void main();
