/**
 * Inspect what Sony's search returns for "Borderlands 3" — to figure
 * out why our picker isn't finding the base game.
 */
import { extractPsnPriceFromHtml } from '../apps/api/src/services/psnPrices';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function main(): Promise<void> {
  const url = 'https://store.playstation.com/en-at/search/Borderlands%203';
  console.log(`Probing: ${url}\n`);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  console.log(`Status: ${res.status}`);
  const html = await res.text();
  console.log(`HTML: ${html.length} chars\n`);

  const { prices, title } = extractPsnPriceFromHtml(html);
  console.log(`Title harvested: ${title}`);
  console.log(`SkuPrice nodes found: ${prices.length}\n`);

  // Reach for the search results array directly
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) { console.log('no __NEXT_DATA__'); return; }
  const data = JSON.parse(match[1]!) as Record<string, unknown>;

  // Walk for all Product/Concept nodes with name + price, log each
  const found: { typename: string; name: string; price: unknown }[] = [];
  const walk = (v: unknown, d = 0): void => {
    if (d > 12 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; }
    const o = v as Record<string, unknown>;
    const tn = o['__typename'];
    if ((tn === 'Product' || tn === 'Concept') && typeof o['name'] === 'string') {
      found.push({ typename: tn as string, name: o['name'] as string, price: o['price'] });
    }
    for (const k of Object.keys(o)) walk(o[k], d + 1);
  };
  walk(data);

  console.log(`Found ${found.length} Product/Concept nodes with names:\n`);
  for (const f of found.slice(0, 25)) {
    const priceStr = f.price ? JSON.stringify(f.price).slice(0, 100) : '(no price)';
    console.log(`  [${f.typename}] "${f.name}"  price=${priceStr}`);
  }
}

void main();
