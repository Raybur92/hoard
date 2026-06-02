/**
 * DEALS-PR2.5 — verify Sony's per-concept page works for direct lookup.
 *
 * Test URLs:
 *   /en-us/concept/<id>     — North America English
 *   /de-de/concept/<id>     — Germany / Austria (EUR)
 *   /en-gb/concept/<id>     — UK (GBP)
 *
 * We already capture `Game.psnConceptId` for synced PSN games. Direct
 * lookup beats fuzzy title search.
 *
 * Test concept ID 10003925 is Astro Bot (well-known PSN-exclusive).
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function probeConcept(label: string, url: string): Promise<void> {
  console.log(`\n── ${label} ──`);
  console.log(`  ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
  });
  console.log(`  Status: ${res.status}`);
  if (!res.ok) {
    const txt = await res.text();
    console.log(`  Body preview: ${txt.slice(0, 300)}`);
    return;
  }

  const html = await res.text();
  console.log(`  HTML size: ${html.length}`);

  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) { console.log(`  no __NEXT_DATA__ found`); return; }

  try {
    const data = JSON.parse(nextDataMatch[1]!) as Record<string, unknown>;
    const props = (data['props'] as Record<string, unknown>) ?? {};
    const pageProps = (props['pageProps'] as Record<string, unknown>) ?? {};
    console.log(`  pageProps keys: ${Object.keys(pageProps).join(', ')}`);

    // Drill into the page data to find product + pricing
    const recursiveFind = (obj: unknown, hits: string[] = [], depth = 0): string[] => {
      if (depth > 8 || !obj || typeof obj !== 'object') return hits;
      if (Array.isArray(obj)) {
        for (const v of obj) recursiveFind(v, hits, depth + 1);
        return hits;
      }
      const o = obj as Record<string, unknown>;
      if (o['__typename'] === 'SkuPrice' || ('basePrice' in o && 'discountedPrice' in o)) {
        hits.push(JSON.stringify(o).slice(0, 250));
      }
      // Also surface product titles / sku info we'd want to read
      if ((o['__typename'] === 'Product' || o['__typename'] === 'Concept') && typeof o['name'] === 'string') {
        hits.push(`PRODUCT name="${o['name']}" id=${o['id']}`);
      }
      for (const k of Object.keys(o)) recursiveFind(o[k], hits, depth + 1);
      return hits;
    };
    const hits = recursiveFind(data);
    console.log(`  found ${hits.length} price/product hits`);
    for (const h of hits.slice(0, 6)) console.log(`    ${h}`);
  } catch (e) {
    console.log(`  __NEXT_DATA__ parse failed: ${e instanceof Error ? e.message : e}`);
  }
}

async function main(): Promise<void> {
  // Astro Bot — concept id is 10003925 per psn-api/psnprices community knowledge
  const conceptId = 10003925;

  await probeConcept('US (USD)',         `https://store.playstation.com/en-us/concept/${conceptId}`);
  await probeConcept('Germany (EUR)',    `https://store.playstation.com/de-de/concept/${conceptId}`);
  await probeConcept('Italy (EUR)',      `https://store.playstation.com/it-it/concept/${conceptId}`);
  await probeConcept('Austria (EUR)',    `https://store.playstation.com/en-at/concept/${conceptId}`);
  await probeConcept('UK (GBP)',         `https://store.playstation.com/en-gb/concept/${conceptId}`);

  console.log('\n=== Probe: confirm whether the URL pattern is /concept/ID or product/ID ===');
  // Try direct product lookup
  await probeConcept('product URL — Astro Bot fallback', 'https://store.playstation.com/en-us/product/UP9000-PPSA01290_00-ASTROSPLAYROOM0');
}

void main();
