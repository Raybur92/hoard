/**
 * DEALS-PR2.5 — test if Sony's search PAGE (not API) is accessible.
 *
 * Insight from olakukielko/psn-price-tracker: their old scraper hits
 * `store.playstation.com/<locale>/search/<query>` directly. We've been
 * probing API endpoints (Chihiro, GraphQL, valkyrie) which Sony has
 * locked down — but the consumer-facing search PAGE has to work for
 * real users browsing.
 *
 * Probe goals:
 *   1. Does the search page load with a basic UA?
 *   2. Does the HTML contain embedded JSON (Next.js __NEXT_DATA__ or
 *      similar) with pricing data?
 *   3. Can we extract prices from the embedded JSON for a known title?
 *
 * Test query: "astro bot" (PSN-exclusive — should appear if anything does).
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function main(): Promise<void> {
  const url = 'https://store.playstation.com/en-us/search/astro%20bot';
  console.log(`Probing: ${url}\n`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  console.log(`Status:        ${res.status}`);
  console.log(`Content-Type:  ${res.headers.get('content-type')}`);
  console.log(`Size:          ${res.headers.get('content-length') ?? '(unknown)'}\n`);

  if (!res.ok) {
    const txt = await res.text();
    console.log(`Body preview:\n${txt.slice(0, 500)}`);
    return;
  }

  const html = await res.text();
  console.log(`Got ${html.length} chars of HTML\n`);

  // Look for embedded JSON blobs
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  console.log(`__NEXT_DATA__:    ${nextDataMatch ? `YES (${nextDataMatch[1]!.length} chars)` : 'no'}`);

  const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;/);
  console.log(`__INITIAL_STATE__: ${initialStateMatch ? `YES (${initialStateMatch[1]!.length} chars)` : 'no'}`);

  const ssrMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]{500,}?)<\/script>/);
  console.log(`Any large JSON script: ${ssrMatch ? `YES (${ssrMatch[1]!.length} chars)` : 'no'}`);

  // Price-pattern check in raw HTML
  const priceMatches = html.match(/(?:€|£|\$)\s?\d+(?:\.\d{1,2})?/g);
  console.log(`Currency tokens in HTML: ${priceMatches ? priceMatches.length : 0} ${priceMatches ? priceMatches.slice(0, 8).join(', ') : ''}`);

  // Common Apollo/Next.js cache key for prices
  const productHints = html.match(/"price"\s*:\s*\{[^}]+\}/g);
  console.log(`"price" JSON objects: ${productHints ? productHints.length : 0}`);
  if (productHints) {
    for (const p of productHints.slice(0, 3)) console.log(`    ${p}`);
  }

  // Look for the product card data attributes the SSR page uses
  const productCards = html.match(/data-qa="search-result-item"/g);
  console.log(`Product card markers: ${productCards ? productCards.length : 0}`);

  // Save the full HTML to disk so Andrea can inspect manually if needed
  if (html.length > 5000) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile('/tmp/psn-search-page.html', html);
    console.log(`\nSaved full HTML to /tmp/psn-search-page.html — inspect manually if needed`);
  }

  // If __NEXT_DATA__ exists, try to parse it and extract astro bot specifically
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]!) as Record<string, unknown>;
      console.log(`\n__NEXT_DATA__ top-level keys: ${Object.keys(nextData).join(', ')}`);

      // Apollo cache is often at pageProps.apolloState or props.pageProps.[something]
      const props = (nextData['props'] as Record<string, unknown>) ?? {};
      const pageProps = (props['pageProps'] as Record<string, unknown>) ?? {};
      console.log(`props.pageProps keys: ${Object.keys(pageProps).join(', ')}`);

      // Search nested structure for price-like nodes
      const recursiveFind = (obj: unknown, depth = 0): void => {
        if (depth > 6 || !obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (let i = 0; i < Math.min(obj.length, 3); i++) recursiveFind(obj[i], depth + 1);
          return;
        }
        const o = obj as Record<string, unknown>;
        if ('discountedPrice' in o || 'basePrice' in o || 'discountText' in o) {
          console.log(`  found price object at depth ${depth}: ${JSON.stringify(o).slice(0, 300)}`);
          return;
        }
        for (const k of Object.keys(o)) recursiveFind(o[k], depth + 1);
      };
      recursiveFind(nextData);
    } catch (e) {
      console.log(`  __NEXT_DATA__ parse failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

void main();
