import type { IgdbSearchResult, IgdbUpcomingRelease, ReleaseDateCategory } from '@hoard/types';

/* ── Token cache ── */

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const CLIENT_ID = process.env['TWITCH_CLIENT_ID'] ?? '';
  const CLIENT_SECRET = process.env['TWITCH_CLIENT_SECRET'] ?? '';
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not configured');

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Twitch token fetch failed: ${res.status}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  // Refresh 5 minutes before actual expiry
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

/* ── In-memory cache ── */

interface CacheEntry<T> { data: T; expiresAt: number }

function makeCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry || Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
      return entry.data;
    },
    set(key: string, data: T): void {
      store.set(key, { data, expiresAt: Date.now() + ttlMs });
    },
    clear(): void { store.clear(); },
  };
}

const FIVE_MIN = 5 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const searchCache = makeCache<IgdbSearchResult[]>(FIVE_MIN);
const gameCache = makeCache<IgdbSearchResult>(ONE_DAY);
const steamCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const upcomingCache = makeCache<IgdbUpcomingRelease[]>(ONE_DAY);

/* ── IGDB raw types ── */

interface IgdbRawGame {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { url: string };
  genres?: { name: string }[];
  platforms?: { name: string }[];
  involved_companies?: { company: { name: string }; developer: boolean }[];
  summary?: string;
}

interface IgdbRawExternalGame {
  game: IgdbRawGame;
}

/* ── Helpers ── */

function normalizeCover(url: string | null | undefined): string | null {
  if (!url) return null;
  // Raw URLs are protocol-relative: //images.igdb.com/igdb/image/upload/t_thumb/xxxxx.jpg
  return ('https:' + url).replace('/t_thumb/', '/t_cover_big/');
}

function getDeveloper(companies?: { company: { name: string }; developer: boolean }[]): string | null {
  const dev = companies?.find((c) => c.developer);
  return dev?.company.name ?? null;
}

function getReleaseYear(timestamp?: number): number | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).getFullYear();
}

function categoriseRelease(timestamp?: number): ReleaseDateCategory {
  if (!timestamp) return 'TBA';
  const date = new Date(timestamp * 1000);
  const m = date.getMonth(); // 0-indexed
  if (m <= 2) return 'Q1';
  if (m <= 5) return 'Q2';
  if (m <= 8) return 'Q3';
  return 'Q4';
}

async function igdbPost(endpoint: string, query: string): Promise<IgdbRawGame[]> {
  const token = await getToken();
  const clientId = process.env['TWITCH_CLIENT_ID'] ?? '';
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: query,
  });
  if (!res.ok) throw new Error(`IGDB ${endpoint} failed: ${res.status}`);
  return await res.json() as IgdbRawGame[];
}

function mapToSearchResult(raw: IgdbRawGame): IgdbSearchResult {
  return {
    igdbId: raw.id,
    title: raw.name,
    developer: getDeveloper(raw.involved_companies),
    releaseYear: getReleaseYear(raw.first_release_date),
    genres: raw.genres?.map((g) => g.name) ?? [],
    coverUrl: normalizeCover(raw.cover?.url),
  };
}

/* ── Public API ── */

export async function searchGames(query: string): Promise<IgdbSearchResult[]> {
  const key = query.toLowerCase().trim();
  const cached = searchCache.get(key);
  if (cached) return cached;

  const results = await igdbPost(
    'games',
    `search "${query}";
fields id, name, first_release_date, cover.url, genres.name, involved_companies.company.name, involved_companies.developer;
limit 10;`,
  );

  const mapped = results.map(mapToSearchResult);
  searchCache.set(key, mapped);
  return mapped;
}

export async function getGame(igdbId: number): Promise<IgdbSearchResult | null> {
  const key = String(igdbId);
  const cached = gameCache.get(key);
  if (cached) return cached;

  const results = await igdbPost(
    'games',
    `fields id, name, first_release_date, cover.url, genres.name, involved_companies.company.name, involved_companies.developer;
where id = ${igdbId};
limit 1;`,
  );

  if (!results[0]) return null;
  const mapped = mapToSearchResult(results[0]);
  gameCache.set(key, mapped);
  return mapped;
}

export async function getUpcomingReleases(
  fromDate: Date = new Date(),
  limit = 20,
): Promise<IgdbUpcomingRelease[]> {
  const key = `upcoming_${Math.floor(fromDate.getTime() / (ONE_DAY))}_${limit}`;
  const cached = upcomingCache.get(key);
  if (cached) return cached;

  const fromTs = Math.floor(fromDate.getTime() / 1000);
  const toTs = fromTs + 365 * 24 * 60 * 60; // next 12 months

  const results = await igdbPost(
    'games',
    `fields id, name, first_release_date, cover.url, genres.name, platforms.name, involved_companies.company.name, involved_companies.developer, summary;
where first_release_date >= ${fromTs} & first_release_date <= ${toTs} & platforms.name = ("PC (Microsoft Windows)","PlayStation 5","Xbox Series X|S","Nintendo Switch");
sort first_release_date asc;
limit ${limit};`,
  );

  const mapped: IgdbUpcomingRelease[] = results.map((raw) => ({
    igdbId: raw.id,
    title: raw.name,
    developer: getDeveloper(raw.involved_companies),
    releaseDate: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).toISOString()
      : null,
    releaseDateCategory: categoriseRelease(raw.first_release_date),
    platforms: raw.platforms?.map((p) => p.name) ?? [],
    genres: raw.genres?.map((g) => g.name) ?? [],
    coverUrl: normalizeCover(raw.cover?.url),
    synopsis: raw.summary ?? null,
    wishlisted: false,
  }));

  upcomingCache.set(key, mapped);
  return mapped;
}

export async function getGameBySteamId(steamAppId: number): Promise<IgdbSearchResult | null> {
  const key = `steam_${steamAppId}`;
  const cached = steamCache.get(key);
  if (cached !== undefined) return cached;

  const token = await getToken();
  const clientId = process.env['TWITCH_CLIENT_ID'] ?? '';
  const res = await fetch('https://api.igdb.com/v4/external_games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `fields game.id, game.name, game.first_release_date, game.cover.url, game.genres.name, game.involved_companies.company.name, game.involved_companies.developer;
where uid = "${steamAppId}" & category = 1;
limit 1;`,
  });
  if (!res.ok) throw new Error(`IGDB external_games failed: ${res.status}`);

  const data = await res.json() as IgdbRawExternalGame[];
  const raw = data[0]?.game;
  const result = raw ? mapToSearchResult(raw) : null;
  steamCache.set(key, result);
  return result;
}

export function clearCaches(): void {
  cachedToken = null;
  tokenExpiry = 0;
  searchCache.clear();
  gameCache.clear();
  steamCache.clear();
  upcomingCache.clear();
}
