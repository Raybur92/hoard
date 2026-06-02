/**
 * DEALS-PR2.5 — probe gg.deals' actual API endpoints (documented by
 * Andrea 2026-06-02). Browser-UA + structured headers; let's see what
 * /api/bundles/ and /api/prices/ return.
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function probe(label: string, url: string, init?: RequestInit): Promise<void> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, */*;q=0.8',
        ...init?.headers,
      },
    });
    const ct = res.headers.get('content-type') ?? '';
    const txt = await res.text();
    console.log(`\n── ${label} ──`);
    console.log(`  URL:    ${url}`);
    console.log(`  Status: ${res.status}`);
    console.log(`  CType:  ${ct}`);
    if (ct.includes('json')) {
      try {
        const parsed = JSON.parse(txt) as unknown;
        console.log(`  Body (parsed, first 800 chars):\n    ${JSON.stringify(parsed).slice(0, 800)}`);
      } catch {
        console.log(`  Body (raw, first 500):\n    ${txt.slice(0, 500)}`);
      }
    } else {
      console.log(`  Body (first 500):\n    ${txt.slice(0, 500).replace(/\s+/g, ' ')}`);
    }
  } catch (e) {
    console.log(`\n── ${label} ──`);
    console.log(`  ERR: ${e instanceof Error ? e.message : e}`);
  }
}

async function main(): Promise<void> {
  console.log('=== gg.deals API endpoints (Andrea-supplied URLs) ===');

  /* Bare endpoints (probably need params; testing for the right shape of error). */
  await probe('GET /api/bundles/', 'https://gg.deals/api/bundles/');
  await probe('GET /api/prices/',  'https://gg.deals/api/prices/');

  /* Common query patterns for price lookups. */
  await probe('GET /api/prices/?title=hollow-knight', 'https://gg.deals/api/prices/?title=hollow-knight');
  await probe('GET /api/prices/?slug=hollow-knight',  'https://gg.deals/api/prices/?slug=hollow-knight');
  await probe('GET /api/prices/?ids=hollow-knight',   'https://gg.deals/api/prices/?ids=hollow-knight');
  await probe('GET /api/prices/?title=Hollow%20Knight', 'https://gg.deals/api/prices/?title=Hollow%20Knight');

  /* Region variants. */
  await probe('GET /api/prices/?region=at&title=hollow-knight',
    'https://gg.deals/api/prices/?region=at&title=hollow-knight');
  await probe('GET /api/prices/eu/?title=hollow-knight',
    'https://gg.deals/api/prices/eu/?title=hollow-knight');

  /* Doc-style URLs (the developer page often lives at the same prefix). */
  await probe('GET /api/', 'https://gg.deals/api/');

  /* Look for an OPTIONS preflight to learn allowed methods. */
  await probe('OPTIONS /api/prices/', 'https://gg.deals/api/prices/', { method: 'OPTIONS' });
}

void main();
