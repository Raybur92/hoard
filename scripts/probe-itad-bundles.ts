/**
 * DEALS-PR2 discovery — full inspection of ITAD's /bundles/v1 response
 * shape so we can size the Bundle schema correctly.
 */
import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

const KEY = process.env['ITAD_API_KEY'];
if (!KEY) { console.error('ITAD_API_KEY missing'); process.exit(1); }

async function main(): Promise<void> {
  const res = await fetch(`https://api.isthereanydeal.com/bundles/v1?key=${KEY}`);
  if (!res.ok) { console.error('fetch failed:', res.status); process.exit(1); }
  const body = await res.json() as unknown[];
  console.log(`got ${body.length} bundle(s); showing first 2 in full:\n`);
  console.log(JSON.stringify(body.slice(0, 2), null, 2));
  console.log(`\n--- top-level keys across all bundles ---`);
  const keys = new Set<string>();
  for (const b of body as Record<string, unknown>[]) {
    for (const k of Object.keys(b)) keys.add(k);
  }
  console.log(Array.from(keys).sort().join(', '));
}

void main();
