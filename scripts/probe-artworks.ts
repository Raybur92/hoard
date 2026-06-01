/**
 * OQ-GD-13 — probe IGDB artworks for the prototype candidates.
 *
 * For each of the 8 sample games, fetch the FULL `artworks[]` array
 * and rank them by a quality score. Outputs the best artwork URL per
 * game so we can manually feed curated picks back into the prototype.
 *
 * Scoring heuristics (deliberately simple — these are the same
 * signals a future smarter-heroImageUrl backfill would use):
 *   + aspect ratio bonus when closer to 16:9 (landscape preferred)
 *   + resolution bonus when larger (more pixels of detail)
 *   − penalty if image_id equals the game's cover image_id (duplicate)
 *
 * Run: `npx tsx scripts/probe-artworks.ts`. Outputs JSON.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Source TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET from apps/api/.env.
config({ path: resolve(process.cwd(), 'apps/api/.env') });

const CLIENT_ID = process.env['TWITCH_CLIENT_ID'] ?? '';
const CLIENT_SECRET = process.env['TWITCH_CLIENT_SECRET'] ?? '';
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing. Run from repo root.');
  process.exit(1);
}

const candidates: { igdbId: number; title: string }[] = [
  { igdbId: 113112, title: 'Hades (alt — 113112)' }, // probe the other Hades; 80529 had no artworks
  { igdbId: 7342,   title: 'Inside (looking at screenshots too)' },
];

async function getToken(): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }).toString(),
  });
  if (!res.ok) throw new Error(`token fetch failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

interface Artwork {
  id: number;
  image_id: string;
  width: number;
  height: number;
}

interface IgdbGame {
  id: number;
  name: string;
  cover?: { image_id: string };
  artworks?: Artwork[];
  screenshots?: Artwork[];
}

async function igdbPost(endpoint: string, query: string, token: string): Promise<IgdbGame[]> {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) throw new Error(`igdb ${endpoint} ${res.status}: ${await res.text()}`);
  return await res.json() as IgdbGame[];
}

interface ScoredArtwork extends Artwork {
  score: number;
  url: string;
  reason: string;
}

const TARGET_ASPECT = 16 / 9;

function scoreArtwork(a: Artwork, coverImageId: string | null): ScoredArtwork {
  // Aspect: 100 when exact 16:9, decays linearly with distance.
  const aspect = a.width / Math.max(1, a.height);
  const aspectScore = Math.max(0, 100 - Math.abs(aspect - TARGET_ASPECT) * 60);
  // Resolution: log-scaled so we don't let a 4K image swamp everything else.
  const resScore = Math.min(100, Math.log10(Math.max(1, a.width * a.height) / 1000) * 30);
  // Cover duplicate penalty: -200 if image_id matches the cover (huge).
  const duplicatePenalty = coverImageId && a.image_id === coverImageId ? -200 : 0;
  const score = aspectScore + resScore + duplicatePenalty;
  const reason = [
    `aspect ${aspect.toFixed(2)} → ${aspectScore.toFixed(0)}`,
    `${a.width}×${a.height} → ${resScore.toFixed(0)}`,
    duplicatePenalty < 0 ? 'COVER DUPLICATE -200' : '',
  ].filter(Boolean).join(' · ');
  return { ...a, score, reason, url: `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${a.image_id}.jpg` };
}

async function main() {
  console.log('fetching token…');
  const token = await getToken();
  const igdbIds = candidates.map((c) => c.igdbId);
  const query = `fields id, name, cover.image_id, artworks.image_id, artworks.width, artworks.height, screenshots.image_id, screenshots.width, screenshots.height; where id = (${igdbIds.join(',')}); limit 50;`;
  console.log('querying IGDB…');
  const games = await igdbPost('games', query, token);

  for (const c of candidates) {
    const g = games.find((x) => x.id === c.igdbId);
    if (!g) {
      console.log(`\n=== ${c.title} (igdbId ${c.igdbId}) — NOT FOUND IN IGDB ===`);
      continue;
    }
    const coverImageId = g.cover?.image_id ?? null;
    const arts = g.artworks ?? [];
    const screens = g.screenshots ?? [];
    console.log(`\n=== ${c.title} (igdbId ${c.igdbId}) ===`);
    console.log(`  cover: ${coverImageId ?? '—'}`);
    console.log(`  artworks: ${arts.length} · screenshots: ${screens.length}`);
    const scored = arts
      .map((a) => scoreArtwork(a, coverImageId))
      .sort((a, b) => b.score - a.score);
    for (const a of scored.slice(0, 8)) console.log(`  ART score ${a.score.toFixed(0)} · ${a.reason} · ${a.url}`);
    const scoredScreens = screens.map((a) => scoreArtwork(a, coverImageId)).sort((a, b) => b.score - a.score);
    for (const s of scoredScreens.slice(0, 8)) console.log(`  SCR score ${s.score.toFixed(0)} · ${s.reason} · ${s.url}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
