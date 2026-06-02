/**
 * DEALS-PR2.5 discovery — probe candidate data sources for PSN +
 * Nintendo eShop pricing. Goal: figure out which sources are actually
 * usable before writing integration code.
 *
 * Per-source checks:
 *  - Does the endpoint respond at all?
 *  - Can it return data for a known game (input by ITAD/our-side title)?
 *  - Is pricing present in the response, with currency + discount %?
 *  - Is the response shape stable enough to integrate against?
 *
 * Sources probed:
 *   1. Nintendo Europe Solr search — `search.nintendo-europe.com/<locale>/select`
 *   2. Nintendo Americas Algolia search — `https://u3b6gr4ua3-dsn.algolia.net/...`
 *   3. PSN web GraphQL — `https://web.np.playstation.com/api/graphql/v1/op`
 *   4. PSN store search REST — `https://store.playstation.com/store/api/...`
 *   5. gg.deals — check if they expose any public API surface
 *
 * Run: `npx tsx scripts/probe-console-prices.ts`
 */

import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

interface ProbeResult {
  source: string;
  url: string;
  status: number | 'ERR';
  contentType?: string;
  bodyPreview?: string;
  notes?: string;
}

const results: ProbeResult[] = [];

async function probe(label: string, url: string, init?: RequestInit, notes?: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, init);
    const ct = res.headers.get('content-type') ?? '';
    let body: unknown = null;
    let preview = '';
    if (ct.includes('application/json')) {
      try {
        body = await res.json();
        preview = JSON.stringify(body).slice(0, 400);
      } catch { preview = '(json parse failed)'; }
    } else {
      const txt = await res.text();
      preview = txt.slice(0, 200).replace(/\s+/g, ' ');
    }
    results.push({ source: label, url, status: res.status, contentType: ct, bodyPreview: preview, notes });
    console.log(`${res.status === 200 ? '✓' : '?'} ${res.status} ${label}`);
    return body;
  } catch (e) {
    results.push({ source: label, url, status: 'ERR', notes: `${notes ?? ''} — ${e instanceof Error ? e.message : e}` });
    console.log(`✗ ERR ${label}`);
    return null;
  }
}

async function main(): Promise<void> {
  /* ───────────────────────────────────────────────────────────────
   * (1) Nintendo Europe — Solr index, locale-dependent. Used by
   * Nintendo's own eShop pages. Returns price + sale price + currency.
   * Locale slug determines language + currency.
   * ─────────────────────────────────────────────────────────────── */

  // Match all GAME-type entries in en/austria locale
  await probe(
    'NIntendo Europe search (DE/AT, all games, top-3)',
    'https://search.nintendo-europe.com/en/select?q=*&fq=type:GAME%20AND%20system_type:nintendoswitch*&rows=3&wt=json',
    undefined,
    'Solr endpoint; locale=en, market=AT-equivalent EUR pricing',
  );

  await probe(
    'Nintendo Europe search (specific title: "Astro Bot"-equivalent search)',
    'https://search.nintendo-europe.com/en/select?q=hollow+knight&fq=type:GAME&rows=5&wt=json',
    undefined,
    'Hollow Knight is a known Switch title; should return a hit',
  );

  /* ───────────────────────────────────────────────────────────────
   * (2) Nintendo Americas — Algolia. Endpoint requires app id + api
   * key (publicly extractable from their website). Used by nintendo.com.
   * ─────────────────────────────────────────────────────────────── */

  // Public app credentials are: app id "U3B6GR4UA3", api key extracted
  // from nintendo.com/store responses. These are anon search keys
  // designed for browser-side use; rate-limited but otherwise open.
  await probe(
    'Nintendo Americas Algolia (anon app keys, search hollow knight)',
    'https://u3b6gr4ua3-dsn.algolia.net/1/indexes/store_game_en_us/query',
    {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': 'U3B6GR4UA3',
        // Algolia search-only key extracted from nintendo.com — publicly visible.
        'X-Algolia-API-Key': 'c4da8be7fd29f0f5bfa42920b0a99dc7',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'hollow knight', hitsPerPage: 3 }),
    },
    'Anon Algolia search; nintendo.com uses this',
  );

  /* ───────────────────────────────────────────────────────────────
   * (3) PSN web GraphQL — undocumented but public-readable for store
   * browsing. Endpoint is `web.np.playstation.com/api/graphql/v1/op`.
   * Requires region header.
   * ─────────────────────────────────────────────────────────────── */

  await probe(
    'PSN web GraphQL — anonymous search probe',
    'https://web.np.playstation.com/api/graphql/v1/op',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PSN-Store-Locale-Override': 'en-US' },
      body: JSON.stringify({
        operationName: 'metGetSearchResults',
        variables: { searchTerm: 'astro bot', pageSize: 3, pageOffset: 0 },
        query: 'query metGetSearchResults($searchTerm: String!, $pageSize: Int, $pageOffset: Int) { search(searchTerm: $searchTerm, pageSize: $pageSize, pageOffset: $pageOffset) { results { id name price { discountText basePrice basePriceValue discountedPrice currencyCode } } } }',
      }),
    },
    'Sony PSN web app GraphQL — anon query',
  );

  /* ───────────────────────────────────────────────────────────────
   * (4) PSN store REST — old API still backing parts of store.playstation.com
   * ─────────────────────────────────────────────────────────────── */

  await probe(
    'PSN store REST — region en-us, "astro bot" search',
    'https://store.playstation.com/valkyrie-api/en/US/19/select/?query=astro+bot&size=3',
    { headers: { 'User-Agent': 'Mozilla/5.0 (Hoard probe)' } },
    'Legacy "valkyrie" API; may be deprecated',
  );

  /* ───────────────────────────────────────────────────────────────
   * (5) gg.deals — public-facing site; checking if they expose a JSON
   * endpoint that's accessible. Many sites have *.json variants for
   * SSR hydration.
   * ─────────────────────────────────────────────────────────────── */

  await probe(
    'gg.deals — explore for any API surface (search)',
    'https://gg.deals/api/search?q=hollow+knight',
    undefined,
    'gg.deals — probing for a public API path',
  );

  await probe(
    'gg.deals — search alt path',
    'https://gg.deals/api/v1/search?q=hollow+knight',
    undefined,
    'gg.deals — alt API path',
  );

  /* ───────────────────────────────────────────────────────────────
   * Summary
   * ─────────────────────────────────────────────────────────────── */

  console.log('\n\n===  FULL RESULTS  ===\n');
  for (const r of results) {
    console.log(`\n  source: ${r.source}`);
    console.log(`  url:    ${r.url}`);
    console.log(`  status: ${r.status}`);
    if (r.contentType) console.log(`  ctype:  ${r.contentType}`);
    if (r.notes) console.log(`  notes:  ${r.notes}`);
    if (r.bodyPreview) console.log(`  body:   ${r.bodyPreview}`);
  }
}

void main();
