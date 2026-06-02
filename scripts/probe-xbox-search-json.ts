/**
 * Extract the embedded JSON from xbox.com search results.
 * See if it contains bigId + pricing together (would let us skip
 * Display Catalog entirely).
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function main(): Promise<void> {
  const url = 'https://www.xbox.com/en-us/Search?q=hollow+knight';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const html = await res.text();

  /* Grab the large application/json script */
  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]{500,}?)<\/script>/);
  if (!match) { console.log('no embedded JSON'); return; }
  console.log(`embedded JSON: ${match[1]!.length} chars`);

  try {
    const data = JSON.parse(match[1]!) as unknown;
    console.log(`top-level type: ${Array.isArray(data) ? 'array' : typeof data}`);
    if (data && typeof data === 'object') {
      console.log(`top-level keys: ${Object.keys(data).slice(0, 15).join(', ')}`);
    }

    /* Walk and find Product-like entries with bigIds + prices */
    const products: Record<string, unknown>[] = [];
    const walk = (v: unknown, depth = 0): void => {
      if (depth > 12 || !v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        for (const x of v) walk(x, depth + 1);
        return;
      }
      const o = v as Record<string, unknown>;
      // Heuristic: a product-like node has a productId/title + price
      const hasProductId = typeof o['productId'] === 'string' || typeof o['bigId'] === 'string';
      const hasTitle = typeof o['title'] === 'string';
      const hasPrice = o['price'] !== undefined || o['msrp'] !== undefined || o['listPrice'] !== undefined;
      if (hasProductId && hasTitle && hasPrice) {
        products.push(o);
      }
      for (const k of Object.keys(o)) walk(o[k], depth + 1);
    };
    walk(data);

    console.log(`\nfound ${products.length} product-like nodes; showing first 3:\n`);
    for (const p of products.slice(0, 3)) {
      console.log(JSON.stringify(p).slice(0, 600));
      console.log('---');
    }
  } catch (e) {
    console.log(`parse failed: ${e instanceof Error ? e.message : e}`);
    console.log('first 600 chars:');
    console.log(match[1]!.slice(0, 600));
  }
}

void main();
