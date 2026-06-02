/**
 * Focused probe — only hits the gg.deals /v1/prices/by-steam-app-id/
 * endpoint and dumps the full JSON. Confirms whether docs are complete
 * (just aggregates) or whether per-store detail is present.
 */
const KEY = process.env['GG_DEALS_API_KEY'];
if (!KEY) { console.error('GG_DEALS_API_KEY missing'); process.exit(1); }

async function main(): Promise<void> {
  // Three known Steam-keyed games — God of War, Hollow Knight, Baldur's Gate 3.
  const ids = '1593500,367520,1086940';
  const url = `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=${ids}&key=${KEY}&region=eu`;
  console.log(`URL: ${url.replace(KEY!, '<KEY>')}\n`);
  const res = await fetch(url);
  console.log(`Status: ${res.status}`);
  console.log(`Rate:   ${res.headers.get('x-ratelimit-remaining')}/${res.headers.get('x-ratelimit-limit')} remaining\n`);
  const body = await res.json() as unknown;
  console.log('FULL response body:');
  console.log(JSON.stringify(body, null, 2));
}

void main();
