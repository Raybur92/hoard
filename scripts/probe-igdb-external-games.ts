/**
 * Probe IGDB's `external_games` endpoint for PSN / Xbox / GOG coverage.
 *
 * Given an IGDB game id, dumps every external_games row for it across
 * the relevant categories. If PSN's titleId mapping exists, N-series
 * (match-by-Sony-titleId) is viable.
 *
 * Usage:
 *   tsx scripts/probe-igdb-external-games.ts <igdb-game-id>
 *
 * Example (LEGO Batman: Legacy of the Dark Knight per probe 4 above):
 *   tsx scripts/probe-igdb-external-games.ts 361855
 *
 * IGDB external_games category reference:
 *   1   Steam
 *   5   GOG
 *   31  Xbox Marketplace
 *   36  Playstation Store US
 *   54  Xbox Live
 */

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
  if (!res.ok) return { error: `${res.status}: ${bodyText.slice(0, 400)}` };
  try { return JSON.parse(bodyText); } catch { return { raw: bodyText.slice(0, 400) }; }
}

async function main(): Promise<void> {
  const idArg = process.argv[2];
  if (!idArg) {
    console.error('Usage: tsx scripts/probe-igdb-external-games.ts <igdb-game-id>');
    process.exit(1);
  }
  const gameId = Number(idArg);
  if (!Number.isFinite(gameId) || gameId <= 0) {
    console.error('IGDB game id must be a positive integer.');
    process.exit(1);
  }

  const token = await getToken();
  console.log(`\n=== probing IGDB external_games for game id: ${gameId} ===\n`);

  // 1 — game name (sanity)
  console.log('--- IGDB game ---');
  const game = await igdbPost(
    'games',
    `fields id, name, platforms.name; where id = ${gameId}; limit 1;`,
    token,
  );
  console.log(JSON.stringify(game, null, 2));

  // 2 — ALL external_games rows for this game (any category)
  console.log('\n--- All external_games rows for this game ---');
  const external = await igdbPost(
    'external_games',
    `fields category, uid, name, url, platform; where game = ${gameId}; limit 50;`,
    token,
  );
  console.log(JSON.stringify(external, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
