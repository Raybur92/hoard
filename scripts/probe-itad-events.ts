/**
 * DEALS-PR2 discovery — probe ITAD for sale-event endpoints.
 *
 * ITAD's official docs (https://docs.isthereanydeal.com/) only list
 * /games/* /shops/* /user/* surfaces. But the ITAD web UI shows "current
 * sales" + per-sale pages, so SOME endpoint backs that. This script
 * tries common URL patterns under the standard auth (ITAD_API_KEY) and
 * reports which respond with valid JSON.
 *
 * Run: `npx tsx scripts/probe-itad-events.ts`
 */

import { config } from 'dotenv';
config({ path: new URL('../apps/api/.env', import.meta.url).pathname });

const KEY = process.env['ITAD_API_KEY'];
if (!KEY) {
  console.error('ITAD_API_KEY missing from apps/api/.env');
  process.exit(1);
}

const BASE = 'https://api.isthereanydeal.com';

const candidates = [
  // events
  '/events/v1',
  '/events/v2',
  '/events/v3',
  '/events/list/v1',
  '/events/current/v1',
  '/events/upcoming/v1',
  // sales
  '/sales/v1',
  '/sales/v2',
  '/sales/list/v1',
  '/sales/current/v1',
  // internal
  '/internal/events/v1',
  '/internal/events/v2',
  '/internal/sales/v1',
  '/internal/sales/v2',
  // service
  '/service/events/v1',
  '/service/sales/v1',
  // page-style routes (often back the SPA)
  '/pages/events',
  '/page/events',
  // shop-scoped
  '/shops/events/v1',
  // bundles / collections
  '/bundles/v1',
  '/collections/v1',
  '/internal/lists/v1',
  // common typos / variations
  '/event/v1',
  '/sale/v1',
];

async function probe(path: string): Promise<void> {
  const url = `${BASE}${path}?key=${KEY}`;
  try {
    const res = await fetch(url);
    const ct = res.headers.get('content-type') ?? '';
    let preview = '';
    if (ct.includes('application/json')) {
      try {
        const body = await res.json() as unknown;
        preview = JSON.stringify(body).slice(0, 200);
      } catch {
        preview = '(json parse failed)';
      }
    } else {
      const txt = await res.text();
      preview = txt.slice(0, 120).replace(/\s+/g, ' ');
    }
    const tag = res.status === 200 ? '✓' : res.status >= 400 ? '✗' : '?';
    console.log(`${tag} ${res.status.toString().padEnd(3)} ${path.padEnd(36)} ${ct.padEnd(28)} ${preview}`);
  } catch (e) {
    console.log(`✗ ERR ${path.padEnd(36)} ${e instanceof Error ? e.message : e}`);
  }
}

async function main(): Promise<void> {
  console.log(`[probe-itad] base=${BASE}  key=${KEY.slice(0, 8)}…`);
  console.log(`[probe-itad] testing ${candidates.length} endpoint candidates`);
  console.log('');
  for (const c of candidates) {
    await probe(c);
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log('\n[probe-itad] done');
}

void main();
