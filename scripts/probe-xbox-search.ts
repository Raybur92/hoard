/**
 * DEALS-PR2.5 — last attempt at the xbox.com side as a resolver/source.
 *
 * If xbox.com's store-search page renders bigIds in its HTML (like PSN
 * embeds __NEXT_DATA__), we can use title-based fuzzy lookup to resolve
 * xboxTitleId → bigId by matching the title. After that, Display
 * Catalog gives us the actual price.
 *
 * OR — maybe xbox.com search-results page embeds pricing directly,
 * letting us skip Display Catalog entirely.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function main(): Promise<void> {
  const url = 'https://www.xbox.com/en-us/Search?q=hollow+knight';
  console.log(`Probing: ${url}\n`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.log(await res.text().then((t) => t.slice(0, 300)));
    return;
  }

  const html = await res.text();
  console.log(`HTML size: ${html.length}\n`);

  // Look for bigId patterns (12-char alphanumeric starting with 9)
  const bigIds = html.match(/\b9[A-Z0-9]{11}\b/g);
  console.log(`bigId patterns in HTML: ${bigIds ? new Set(bigIds).size : 0}`);
  if (bigIds) {
    for (const id of [...new Set(bigIds)].slice(0, 5)) console.log(`  ${id}`);
  }

  // Look for embedded JSON
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  console.log(`__NEXT_DATA__: ${nextDataMatch ? `YES (${nextDataMatch[1]!.length} chars)` : 'no'}`);

  const initialStateMatch = html.match(/window\.__data\s*=\s*({[\s\S]*?})\s*;/);
  console.log(`window.__data: ${initialStateMatch ? `YES (${initialStateMatch[1]!.length} chars)` : 'no'}`);

  // Any large embedded JSON blob in <script>
  const scriptJson = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]{500,}?)<\/script>/g);
  console.log(`Large embedded JSON scripts: ${scriptJson ? scriptJson.length : 0}`);

  // Currency pattern
  const prices = html.match(/(?:€|£|\$)\s?\d+(?:[.,]\d{1,2})?/g);
  console.log(`Currency tokens: ${prices ? prices.length : 0} ${prices ? prices.slice(0, 6).join(', ') : ''}`);

  // Direct page approach: try xbox.com/<locale>/games/store/<slug>/<bigid>
  console.log('\n--- Try direct product page by slug ---');
  const r2 = await fetch('https://www.xbox.com/en-us/games/store/hollow-knight/BPC2MR48VLM5', {
    headers: { 'User-Agent': UA },
  });
  console.log(`Status: ${r2.status}`);
  if (r2.ok) {
    const h2 = await r2.text();
    console.log(`HTML size: ${h2.length}`);
    const bigIds2 = h2.match(/\b9[A-Z0-9]{11}\b/g);
    console.log(`bigIds: ${bigIds2 ? new Set(bigIds2).size : 0}`);
    const nextData2 = h2.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    console.log(`__NEXT_DATA__: ${nextData2 ? `YES (${nextData2[1]!.length} chars)` : 'no'}`);
    const prices2 = h2.match(/(?:€|£|\$)\s?\d+(?:[.,]\d{1,2})?/g);
    console.log(`Currency tokens: ${prices2 ? prices2.length : 0} ${prices2 ? prices2.slice(0, 6).join(', ') : ''}`);
  }
}

void main();
