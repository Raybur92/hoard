/**
 * Diagnostic: probes IGDB three ways to figure out why L-series isn't
 * catching localized titles like "LEGO Batman: L'Eredità del Cavaliere
 * Oscuro" or "宇宙机器人无线控制器使用指南".
 *
 * Usage:
 *   tsx scripts/probe-igdb-localizations.ts "LEGO Batman: L'Eredità del Cavaliere Oscuro"
 *
 * Prints raw JSON for each probe so we can see whether the issue is
 *   (a) IGDB lacks the localization data, or
 *   (b) our query syntax is wrong.
 *
 * No DB writes, no side effects. Requires TWITCH_CLIENT_ID +
 * TWITCH_CLIENT_SECRET in env (same as the API).
 */

// Load the API's .env explicitly so the script works no matter which
// directory you run it from.
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.join(__dirname, '..', 'apps', 'api', '.env') });

const TWITCH_CLIENT_ID = process.env['TWITCH_CLIENT_ID'];
const TWITCH_CLIENT_SECRET = process.env['TWITCH_CLIENT_SECRET'];

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
  console.error('Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET in env.');
  process.exit(1);
}

async function getToken(): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID!,
      client_secret: TWITCH_CLIENT_SECRET!,
      grant_type: 'client_credentials',
    }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Twitch token failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function igdbPost(endpoint: string, query: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID!,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: query,
  });
  const bodyText = await res.text();
  if (!res.ok) {
    return { error: `${res.status}: ${bodyText.slice(0, 400)}` };
  }
  try { return JSON.parse(bodyText); } catch { return { raw: bodyText.slice(0, 400) }; }
}

async function main(): Promise<void> {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: tsx scripts/probe-igdb-localizations.ts "<title>"');
    process.exit(1);
  }

  const token = await getToken();
  console.log(`\n=== probing IGDB for: "${query}" ===\n`);

  // Probe 1 — game_localizations with search "...":
  console.log('--- Probe 1: game_localizations / search "..." ---');
  const p1 = await igdbPost(
    'game_localizations',
    `search "${query}";
fields id, name, game, region;
limit 20;`,
    token,
  );
  console.log(JSON.stringify(p1, null, 2));

  // Probe 2 — game_localizations with name ~ "..." (case-insensitive substring):
  console.log('\n--- Probe 2: game_localizations / where name ~ *"..."* ---');
  // Escape any double quotes; IGDB's `where` clause uses double-quoted strings.
  const safeQuery = query.replace(/"/g, '\\"');
  const p2 = await igdbPost(
    'game_localizations',
    `fields id, name, game, region;
where name ~ *"${safeQuery}"*;
limit 20;`,
    token,
  );
  console.log(JSON.stringify(p2, null, 2));

  // Probe 3 — games endpoint search (what L-series falls back to today
  // before localization). Sanity check that the title actually doesn't
  // hit the canonical English index.
  console.log('\n--- Probe 3: games / search "..." (sanity — should return nothing useful) ---');
  const p3 = await igdbPost(
    'games',
    `search "${query}";
fields id, name, platforms.name;
limit 5;`,
    token,
  );
  console.log(JSON.stringify(p3, null, 2));

  // Probe 4 — games endpoint with a wildcard name search.
  console.log('\n--- Probe 4: games / where name ~ *"<first-two-words>"* ---');
  // Extract the first two non-trivial words from the query for a broad probe.
  const words = query.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).join(' ');
  if (words) {
    const p4 = await igdbPost(
      'games',
      `fields id, name, platforms.name;
where name ~ *"${words}"*;
limit 5;`,
      token,
    );
    console.log(`(searching games with: name ~ *"${words}"*)`);
    console.log(JSON.stringify(p4, null, 2));
  } else {
    console.log('(skipping — no usable words for substring search)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
