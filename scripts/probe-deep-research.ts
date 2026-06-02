/**
 * DEALS-PR2.5 — final deep-research probe.
 *
 * Three high-value angles we haven't explored:
 *
 *   1. Microsoft Display Catalog API
 *      Public endpoint at `displaycatalog.mp.microsoft.com` used by
 *      xbox.com + Microsoft Store + every third-party Xbox tracker
 *      (TrueAchievements etc). Returns game pricing per market.
 *      No auth required — used by browser code.
 *
 *   2. Direct PSN persisted-query approach
 *      Sony rotates GraphQL operation hashes but they're observable in
 *      the page source of store.playstation.com. If we can extract a
 *      live hash + call GraphQL with it, we can read prices anonymously.
 *
 *   3. psn-api library capabilities
 *      The psn-api npm package we already use for trophy sync — does it
 *      have any price-related endpoints we haven't explored?
 *
 *   4. Nintendo Americas Algolia with FRESH publicly-extracted key
 *      Earlier probe used a stale key. The current key is visible in
 *      nintendo.com/store page source; let's try that approach.
 *
 *   5. Region-specific Sony endpoints (Japan, Korea, etc).
 *      Different anti-bot levels per region.
 *
 *   6. Reddit r/GameDeals JSON feed (.json suffix) — user-aggregated
 *      deals. Not authoritative but real-time and free.
 */

interface Result {
  source: string;
  status: number | string;
  ct?: string;
  notes?: string;
  hasPriceData?: boolean;
  preview?: string;
}
const results: Result[] = [];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function probe(label: string, url: string, init?: RequestInit, notes?: string): Promise<unknown | null> {
  console.log(`\n── ${label} ──`);
  console.log(`  URL: ${url}`);
  try {
    const res = await fetch(url, init);
    const ct = res.headers.get('content-type') ?? '';
    let body: unknown = null;
    let preview = '';
    if (ct.includes('json')) {
      try {
        body = await res.json();
        preview = JSON.stringify(body).slice(0, 800);
      } catch { preview = '(json parse fail)'; }
    } else {
      const txt = await res.text();
      preview = txt.slice(0, 400).replace(/\s+/g, ' ');
    }
    const hasPriceData = preview.toLowerCase().includes('price') || preview.includes('"€') || preview.includes('"$') || preview.includes('"£');
    results.push({ source: label, status: res.status, ct, notes, hasPriceData, preview });
    console.log(`  ${res.status === 200 ? '✓' : '?'} status=${res.status} ct=${ct}`);
    console.log(`  body: ${preview.slice(0, 300)}`);
    return body;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    results.push({ source: label, status: 'ERR', notes: errMsg });
    console.log(`  ✗ ERR: ${errMsg}`);
    return null;
  }
}

async function main(): Promise<void> {
  /* ─── 1. Microsoft Display Catalog (Xbox / Microsoft Store) ─── */
  // bigIds for Hollow Knight on Microsoft Store: 9P78MQTN9PWG
  // Format from Microsoft's public docs + xbox.com source.
  await probe(
    '1a. Microsoft Display Catalog — Hollow Knight (Xbox)',
    'https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P78MQTN9PWG&market=AT&languages=de-AT&MS-CV=DGU1mcuYo0WMMp+F.1',
    { headers: { 'User-Agent': UA } },
    'Public endpoint, no auth required',
  );

  await probe(
    '1b. Microsoft Display Catalog — Sea of Thieves (Xbox)',
    'https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9P2N57MC619K&market=AT&languages=de-AT&MS-CV=DGU1mcuYo0WMMp+F.1',
    { headers: { 'User-Agent': UA } },
    'Another well-known Xbox title',
  );

  /* ─── 2. PSN GraphQL — extract live persisted-query hash from web source ─── */

  // Step 2a: fetch store.playstation.com home page, look for GraphQL hashes embedded
  console.log('\n── 2a. Scraping persisted-query hashes from store.playstation.com ──');
  try {
    const homeRes = await fetch('https://store.playstation.com/en-us/concept/10004099', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    });
    if (homeRes.ok) {
      const html = await homeRes.text();
      console.log(`  fetched ${html.length} chars`);
      // Sony embeds the persisted-query metadata in script tags
      const hashMatches = html.match(/"sha256Hash":"([a-f0-9]{64})"/g);
      console.log(`  found ${hashMatches ? hashMatches.length : 0} sha256 hashes`);
      if (hashMatches) {
        const uniq = [...new Set(hashMatches)].slice(0, 5);
        for (const m of uniq) console.log(`    ${m}`);
      }
      // Also look for operationName references
      const opMatches = html.match(/"operationName":"[a-zA-Z]+"/g);
      console.log(`  found ${opMatches ? new Set(opMatches).size : 0} unique operations`);
      if (opMatches) {
        const uniq = [...new Set(opMatches)].slice(0, 10);
        for (const m of uniq) console.log(`    ${m}`);
      }
    } else {
      console.log(`  status: ${homeRes.status}`);
    }
  } catch (e) {
    console.log(`  ERR: ${e instanceof Error ? e.message : e}`);
  }

  /* ─── 3. Reddit r/GameDeals JSON feed ─── */
  await probe(
    '3. Reddit r/GameDeals JSON feed',
    'https://www.reddit.com/r/GameDeals/.json?limit=5',
    { headers: { 'User-Agent': UA } },
    'Append .json to any reddit URL; community-aggregated deals',
  );

  /* ─── 4. Nintendo Americas Algolia (need fresh key from nintendo.com source) ─── */
  console.log('\n── 4. Scraping fresh Algolia key from nintendo.com store ──');
  try {
    const ninRes = await fetch('https://www.nintendo.com/us/store/', { headers: { 'User-Agent': UA } });
    if (ninRes.ok) {
      const html = await ninRes.text();
      // Algolia keys are usually in the page as JSON-embedded config
      const algoliaApp = html.match(/algolia[^"]*?[Aa]pp[Ii][dD]"?\s*[:=]\s*"([A-Z0-9]+)"/);
      const algoliaKey = html.match(/algolia[^"]*?[Aa]pi[Kk]ey"?\s*[:=]\s*"([a-f0-9]+)"/);
      console.log(`  Algolia app ID: ${algoliaApp?.[1] ?? 'not found'}`);
      console.log(`  Algolia API key: ${algoliaKey?.[1] ? algoliaKey[1].slice(0, 16) + '…' : 'not found'}`);
    } else {
      console.log(`  fetch failed: ${ninRes.status}`);
    }
  } catch (e) {
    console.log(`  ERR: ${e instanceof Error ? e.message : e}`);
  }

  /* ─── 5. Some other candidate price-aggregator endpoints ─── */
  await probe(
    '5a. DekuDeals — see if API surface exists',
    'https://www.dekudeals.com/api/v1/games/hollow-knight',
    { headers: { 'User-Agent': UA } },
    'Switch-only deal tracker; check for public API',
  );

  await probe(
    '5b. PSPrices — community PSN tracker, check for API',
    'https://psprices.com/api/region-us/games/?query=astro+bot',
    { headers: { 'User-Agent': UA } },
    'PSN-focused community site',
  );

  /* ─── 6. Steam direct (for completeness — we use ITAD instead) ─── */
  await probe(
    '6. Steam Storefront API — direct Hollow Knight pricing',
    'https://store.steampowered.com/api/appdetails?appids=367520&cc=AT&l=en',
    { headers: { 'User-Agent': UA } },
    'Official Steam endpoint; alt path to current ITAD usage',
  );

  /* ─── 7. Other regions of Sony — maybe less anti-bot? ─── */
  await probe(
    '7. PSN store search via legacy chihiro endpoint (en-us)',
    'https://store.playstation.com/chihiro-api/viewfinder/en/US/19/concept/?suggested_size=5&mediaList=hollow+knight',
    { headers: { 'User-Agent': UA } },
    'Older Sony Chihiro API — was used by PSN store',
  );

  /* ─── Summary table ─── */
  console.log('\n\n===  SUMMARY  ===\n');
  for (const r of results) {
    const tag = r.status === 200 ? '✓' : '✗';
    console.log(`${tag} ${String(r.status).padEnd(4)} hasPrice=${r.hasPriceData ? 'YES' : 'no  '}  ${r.source}`);
  }
}

void main();
