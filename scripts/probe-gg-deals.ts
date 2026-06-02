/**
 * DEALS-PR2.5 follow-up — deeper probe of gg.deals.
 *
 * Earlier shallow probe (probe-console-prices.ts) got 403 Cloudflare on
 * `/api/search` and `/api/v1/search`. That doesn't mean no API exists.
 * Three more careful angles:
 *
 *   1. Hit their main game page with a browser-like User-Agent + Accept,
 *      look for embedded JSON (Next.js __NEXT_DATA__, JSON-LD, etc).
 *   2. Probe known docs / developer paths (`/dev`, `/api/docs`, etc).
 *   3. Probe their sitemap + RSS for structured discovery.
 *
 * Goal: determine whether gg.deals exposes a public way to read deal
 * data programmatically — even if it's "scrape the embedded JSON
 * from the HTML page."
 */

const REAL_BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function probe(label: string, url: string, init?: RequestInit): Promise<{ status: number | string; ct: string; preview: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': REAL_BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...init?.headers,
      },
    });
    const ct = res.headers.get('content-type') ?? '';
    const txt = await res.text();
    return {
      status: res.status,
      ct,
      preview: txt.length > 600 ? txt.slice(0, 600) : txt,
    };
  } catch (e) {
    return { status: 'ERR', ct: '', preview: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  console.log('=== gg.deals probe — browser-like User-Agent ===\n');

  /* 1. Hit the main game page for a known Switch title */
  const gamePage = await probe(
    'GET gg.deals/game/hollow-knight',
    'https://gg.deals/game/hollow-knight/',
  );
  console.log(`  status: ${gamePage.status}  ct: ${gamePage.ct}`);
  console.log(`  preview (first 600 chars):\n${gamePage.preview}\n`);

  /* If we got HTML back, look for __NEXT_DATA__ + JSON-LD + price info */
  if (typeof gamePage.status === 'number' && gamePage.status === 200) {
    const fullRes = await fetch('https://gg.deals/game/hollow-knight/', {
      headers: { 'User-Agent': REAL_BROWSER_UA },
    });
    const html = await fullRes.text();
    console.log(`  full HTML length: ${html.length} chars`);

    // Look for embedded data blobs
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    console.log(`  has __NEXT_DATA__:  ${nextDataMatch ? 'YES' : 'no'}`);
    if (nextDataMatch) {
      console.log(`    blob length: ${nextDataMatch[1]!.length} chars`);
      console.log(`    first 400:\n${nextDataMatch[1]!.slice(0, 400)}`);
    }

    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
    console.log(`  JSON-LD blocks:    ${jsonLdMatch ? jsonLdMatch.length : 0}`);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch.slice(0, 3)) {
        const inner = block.replace(/<\/?script[^>]*>/g, '').trim();
        console.log(`    block preview: ${inner.slice(0, 200)}\n`);
      }
    }

    // Look for any obvious price patterns in the HTML
    const priceMatches = html.match(/(?:€|£|\$)\s?\d+(?:\.\d{1,2})?/g);
    console.log(`  inline price tokens: ${priceMatches ? priceMatches.length : 0} ${priceMatches ? priceMatches.slice(0, 8).join(', ') : ''}`);

    // Look for any "api" reference in scripts
    const apiRefs = html.match(/\bhttps?:\/\/[^"'\s]*\/api\/[^"'\s]*/g);
    console.log(`  api URL references: ${apiRefs ? apiRefs.length : 0}`);
    if (apiRefs) {
      const unique = [...new Set(apiRefs)].slice(0, 5);
      for (const u of unique) console.log(`    ${u}`);
    }
  }

  /* 2. Probe candidate doc paths */
  console.log('\n=== Candidate doc paths ===\n');
  const docPaths = ['/dev', '/api', '/api/docs', '/api/v2/search?query=hollow+knight', '/docs', '/developers'];
  for (const p of docPaths) {
    const r = await probe(`GET ${p}`, `https://gg.deals${p}`);
    console.log(`  ${String(r.status).padEnd(4)} ${p.padEnd(36)} ${r.ct}`);
  }

  /* 3. Sitemap */
  console.log('\n=== Sitemap ===\n');
  const sm = await probe('GET /sitemap.xml', 'https://gg.deals/sitemap.xml');
  console.log(`  status: ${sm.status}  ct: ${sm.ct}`);
  console.log(`  preview: ${sm.preview.slice(0, 300)}\n`);
}

void main();
