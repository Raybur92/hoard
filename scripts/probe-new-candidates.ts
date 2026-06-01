/**
 * OQ-GD-13 — probe IGDB for the 8 new relic-prototype candidates.
 *
 * For each title: search IGDB, pick the best match (lowest id wins
 * when there are multiple hits — generally the canonical entry),
 * fetch cover + artworks + screenshots + genres + themes + perspectives
 * + developer + first_release_date. Score the artworks (aspect bonus +
 * resolution bonus − cover-duplicate penalty) and pick the best.
 *
 * Outputs a TypeScript snippet ready to paste into relic-composition.ts.
 *
 * Run: `npx tsx scripts/probe-new-candidates.ts`.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), 'apps/api/.env') });

const CLIENT_ID = process.env['TWITCH_CLIENT_ID'] ?? '';
const CLIENT_SECRET = process.env['TWITCH_CLIENT_SECRET'] ?? '';
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing.');
  process.exit(1);
}

const titles = [
  'Cyberpunk 2077',
  'The Witcher 3: Wild Hunt',
  'Disco Elysium',
  'Control',
  'Alan Wake II',
  'Starfield',
  'Death Stranding',
  'Kingdom Come: Deliverance II',
];

async function getToken(): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }).toString(),
  });
  if (!res.ok) throw new Error(`token: ${res.status}`);
  return (await res.json() as { access_token: string }).access_token;
}

interface Image { id: number; image_id: string; width: number; height: number }
interface IgdbGame {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { image_id: string };
  artworks?: Image[];
  screenshots?: Image[];
  genres?: { name: string }[];
  themes?: { name: string }[];
  player_perspectives?: { name: string }[];
  involved_companies?: { company: { name: string }; developer: boolean }[];
}

async function igdbPost(endpoint: string, query: string, token: string): Promise<IgdbGame[]> {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) throw new Error(`${endpoint}: ${res.status}: ${await res.text()}`);
  return await res.json() as IgdbGame[];
}

function scoreImage(a: Image, coverImageId: string | null): number {
  const aspect = a.width / Math.max(1, a.height);
  const aspectScore = Math.max(0, 100 - Math.abs(aspect - 16 / 9) * 60);
  const resScore = Math.min(100, Math.log10(Math.max(1, a.width * a.height) / 1000) * 30);
  const dup = coverImageId && a.image_id === coverImageId ? -200 : 0;
  return aspectScore + resScore + dup;
}

function pickBestArtwork(g: IgdbGame): string | null {
  const cover = g.cover?.image_id ?? null;
  const all = [...(g.artworks ?? []), ...(g.screenshots ?? [])];
  if (all.length === 0) return null;
  const ranked = all.map((a) => ({ a, s: scoreImage(a, cover) })).sort((x, y) => y.s - x.s);
  return ranked[0]?.a.image_id ?? null;
}

function developerOf(g: IgdbGame): string | null {
  return g.involved_companies?.find((ic) => ic.developer)?.company.name ?? null;
}

async function main() {
  const token = await getToken();
  const results: Array<{ title: string; entry: string }> = [];
  for (const title of titles) {
    // Constrain to category=0 (main game) — excludes DLC, bundles, fan
    // editions. Use IGDB's `search` plus an additional `where` filter.
    // IGDB's `search` returns relevance-sorted results; the first
    // category-0 hit is generally the canonical entry.
    const fields = `fields id, name, first_release_date, cover.image_id, artworks.image_id, artworks.width, artworks.height, screenshots.image_id, screenshots.width, screenshots.height, genres.name, themes.name, player_perspectives.name, involved_companies.company.name, involved_companies.developer, category, hypes, total_rating_count;`;
    // Use `where name ~` (case-insensitive partial match) so we can
    // compose with category=0 filter. Sort by total_rating_count desc
    // to push the canonical / popular entry to the top.
    const escaped = title.replace(/"/g, '\\"');
    const q = `${fields} where name ~ *"${escaped}"* & category = 0; sort total_rating_count desc; limit 5;`;
    const games = await igdbPost('games', q, token);
    const g = games[0];
    if (!g) {
      console.log(`✗ ${title} — not found`);
      continue;
    }
    const coverUrl = g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : '';
    const artId = pickBestArtwork(g);
    const artworkUrl = artId ? `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${artId}.jpg` : null;
    const developer = developerOf(g) ?? 'Unknown';
    const releaseYear = g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : 0;
    const genres = (g.genres ?? []).map((x) => x.name);
    const themes = (g.themes ?? []).map((x) => x.name);
    const perspectives = (g.player_perspectives ?? []).map((x) => x.name);
    console.log(`✓ ${title} → IGDB ${g.id} (${g.name}) · ${genres.length} genres · ${themes.length} themes · ${perspectives.length} persp · art=${artId ? 'yes' : 'NO'}`);
    results.push({
      title,
      entry: `  { title: ${JSON.stringify(g.name)}, igdbId: ${g.id}, coverUrl: ${JSON.stringify(coverUrl)}, artworkUrl: ${JSON.stringify(artworkUrl)}, developer: ${JSON.stringify(developer)}, releaseYear: ${releaseYear}, igdbGenres: ${JSON.stringify(genres)}, igdbThemes: ${JSON.stringify(themes)}, igdbPerspectives: ${JSON.stringify(perspectives)}, platform: 'PC', completedAt: 'YYYY-MM-DD', playtimeMin: 0, subStatus: 'main', rating: 0, notes: '' },`,
    });
  }
  console.log('\n--- TypeScript snippet ---');
  for (const r of results) console.log(r.entry);
}

main().catch((e) => { console.error(e); process.exit(1); });
