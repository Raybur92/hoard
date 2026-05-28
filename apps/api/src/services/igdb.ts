import type { IgdbSearchResult, IgdbTimeToBeat, IgdbUpcomingRelease, ReleaseDateCategory } from '@hoard/types';

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
const psnConceptCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const xboxTitleCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const gogAppCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const itchGameCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const epicCatalogCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const nintendoTitleCache = makeCache<IgdbSearchResult | null>(ONE_DAY);
const upcomingCache = makeCache<IgdbUpcomingRelease[]>(ONE_DAY);

/* ── IGDB raw types ── */

interface IgdbRawGame {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { url: string };
  genres?: { name: string }[];
  platforms?: { id: number; name: string }[];
  involved_companies?: { company: { name: string }; developer: boolean }[];
  summary?: string;
  hypes?: number;
  category?: number;
  version_parent?: number | null;
  total_rating_count?: number;
}

interface IgdbRawGameTimeToBeat {
  id: number;
  game_id: number;
  hastily?: number;
  normally?: number;
  completely?: number;
  count?: number;
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
    platforms: raw.platforms?.map((p) => p.name) ?? [],
    totalRatingCount: raw.total_rating_count ?? null,
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
fields id, name, first_release_date, cover.url, genres.name, involved_companies.company.name, involved_companies.developer, platforms.name, total_rating_count;
limit 10;`,
  );

  const mapped = results.map(mapToSearchResult);
  searchCache.set(key, mapped);
  return mapped;
}

/**
 * L-series localization fallback.
 *
 * IGDB's `game_localizations` endpoint maps each game to its regional
 * translations: rows like `{ name: "LEGO Batman: L'Eredità del Cavaliere
 * Oscuro", region: <region_id>, game: 12345 }`. When a platform sync
 * returns a localized title (PSN/Xbox accounts often report titles in
 * the user's account locale) that `searchGames` can't match against
 * IGDB's English-default game names, this fallback catches it.
 *
 * Two-step:
 *   1. Search `game_localizations` for the localized query.
 *   2. Resolve each unique parent game via the `games` endpoint to get
 *      the full IgdbSearchResult shape (developer, platforms, popularity,
 *      etc.) needed by `pickBestMatch`.
 *
 * The returned `IgdbSearchResult.matchTitle` carries the LOCALIZED
 * name from the localization row so `pickBestMatch` can score the
 * Italian query against the Italian name. `title` stays as IGDB's
 * canonical English name — that's what gets persisted on `Game.title`,
 * keeping the catalog consistent across users + locales.
 *
 * Limit 20 candidates: enough to catch DLC/regional variants without
 * blowing the budget. Returns `[]` on any failure (caller treats as
 * "no localization match found, give up").
 */
interface IgdbRawLocalization {
  id: number;
  name: string;
  game: number;
}
export async function searchGameLocalizations(query: string): Promise<IgdbSearchResult[]> {
  // L-FIX: IGDB rejects `search "..."` on game_localizations with a 400
  // ("Searchable endpoints: Characters, Collections, Games, Platforms,
  // Themes"). Use a case-insensitive wildcard substring instead. Escape
  // any internal double quotes so the where clause stays valid; IGDB
  // tolerates apostrophes and Unicode characters inside double-quoted
  // strings as long as they aren't `"`.
  const safe = query.replace(/"/g, '\\"');
  let localizations: IgdbRawLocalization[];
  try {
    localizations = await igdbPost(
      'game_localizations',
      `fields id, name, game;
where name ~ *"${safe}"*;
limit 20;`,
    ) as unknown as IgdbRawLocalization[];
  } catch {
    return [];
  }
  if (localizations.length === 0) return [];

  // Resolve each unique parent game id. `game_localizations.search` may
  // return multiple rows for the same game (regional variants), so we
  // dedupe before the games-endpoint call to keep the second query
  // cheap. Map preserves the first localization seen per game so
  // matchTitle reflects the BEST localization match (search ranks).
  const firstLocByGame = new Map<number, string>();
  for (const loc of localizations) {
    if (!firstLocByGame.has(loc.game)) {
      firstLocByGame.set(loc.game, loc.name);
    }
  }
  const gameIds = [...firstLocByGame.keys()];

  let parents: IgdbRawGame[];
  try {
    parents = await igdbPost(
      'games',
      `fields id, name, first_release_date, cover.url, genres.name, involved_companies.company.name, involved_companies.developer, platforms.name, total_rating_count;
where id = (${gameIds.join(',')});
limit ${gameIds.length};`,
    );
  } catch {
    return [];
  }

  return parents.map((parent) => {
    const mapped = mapToSearchResult(parent);
    const locName = firstLocByGame.get(parent.id);
    return locName ? { ...mapped, matchTitle: locName } : mapped;
  });
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

const PLATFORM_IGDB_IDS: Record<string, number[]> = {
  ST: [6],          // PC (Windows) / Steam
  GG: [6],          // GOG → PC
  EP: [6],          // Epic → PC
  PS: [48, 167],    // PS4, PS5
  XB: [49, 169],    // Xbox One, Xbox Series X/S
  NT: [130],        // Nintendo Switch
};

export function platformCodesToIgdbIds(codes: string[]): number[] {
  return [...new Set(codes.flatMap((c) => PLATFORM_IGDB_IDS[c] ?? []))];
}

export interface UpcomingOptions {
  platformIds: number[];
  allPlatforms: boolean;
  hypeThreshold: number;
  fromDate?: Date;
  limit?: number;
}

/**
 * Upcoming releases feed. Trust the hype filter to keep the result
 * relevant — don't impose an arbitrary date ceiling.
 *
 * Earlier versions hard-capped the query at `first_release_date <= now + 365d`
 * AND `limit 50`, which truncated visible games at the back end of the year
 * and made anything announced ~1 year+ out invisible everywhere. With
 * `hypes > {threshold}` doing the qualitative gate, neither cap is needed.
 *
 * `limit 500` is IGDB's hard ceiling per query. With the hype default (5)
 * the actual return is ~100-200 rows; with hypeThreshold=0 (rare) it can
 * approach the cap, which is fine — the client buckets/zooms it.
 */
export async function getUpcomingReleases(opts: UpcomingOptions): Promise<IgdbUpcomingRelease[]> {
  const { platformIds, allPlatforms, hypeThreshold, fromDate = new Date(), limit = 500 } = opts;

  const sortedIds = [...platformIds].sort((a, b) => a - b);
  const cacheKey = `upcoming_${Math.floor(fromDate.getTime() / ONE_DAY)}_h${hypeThreshold}_${allPlatforms ? 'all' : sortedIds.join(',')}`;
  const cached = upcomingCache.get(cacheKey);
  if (cached) return cached;

  const fromTs = Math.floor(fromDate.getTime() / 1000);

  const platformClause = !allPlatforms && platformIds.length > 0
    ? `& platforms = (${sortedIds.join(',')})`
    : '';
  const hypeClause = hypeThreshold > 0 ? `& hypes > ${hypeThreshold}` : '';

  const query = `fields id, name, first_release_date, cover.url, genres.name, platforms.id, platforms.name, involved_companies.company.name, involved_companies.developer, summary, hypes, category, version_parent, total_rating_count;
where (category = (2, 8) | category = null)
  ${hypeClause}
  & version_parent = null
  & first_release_date >= ${fromTs}
  ${platformClause};
sort first_release_date asc;
limit ${limit};`;

  const results = await igdbPost('games', query);

  const nowTs = Math.floor(Date.now() / 1000);
  const mapped: IgdbUpcomingRelease[] = results
    .filter((raw) => {
      // Rating count floor for any already-released titles that slipped through
      if (raw.total_rating_count !== undefined && raw.first_release_date && raw.first_release_date < nowTs) {
        return raw.total_rating_count > 10;
      }
      return true;
    })
    .map((raw) => ({
      igdbId: raw.id,
      title: raw.name,
      developer: getDeveloper(raw.involved_companies),
      releaseDate: raw.first_release_date ? new Date(raw.first_release_date * 1000).toISOString() : null,
      releaseDateCategory: categoriseRelease(raw.first_release_date),
      platforms: raw.platforms?.map((p) => p.name) ?? [],
      genres: raw.genres?.map((g) => g.name) ?? [],
      coverUrl: normalizeCover(raw.cover?.url),
      synopsis: raw.summary ?? null,
      wishlisted: false,
      category: raw.category ?? 0,
      hype: raw.hypes ?? null,
      // Per-user fields (`wishlisted`, `userGameId`) are placeholders here —
      // the route layer enriches them by joining against the caller's
      // WishlistRelease + UserGame rows.
      userGameId: null,
    }));

  upcomingCache.set(cacheKey, mapped);
  return mapped;
}

export interface RecentReleasesOptions {
  /** UNIX seconds, inclusive lower bound. Typically `Date.now() / 1000 - 14 * 86400`. */
  fromTs: number;
  /** UNIX seconds, inclusive upper bound. Typically `Date.now() / 1000`. */
  toTs: number;
  /** Minimum hype value to include. Spec uses 80 for the muted-banner threshold. */
  minHype: number;
  limit?: number;
}

/**
 * Backward-looking IGDB query: recently-released titles with hype above
 * `minHype`. Powers the muted-banner / RECENT high-hype list. Mirrors the
 * shape of `getUpcomingReleases` so callers can consume both feeds the same
 * way; differs only in the date-window direction and the hype lower bound.
 */
export async function getRecentlyReleased(opts: RecentReleasesOptions): Promise<IgdbUpcomingRelease[]> {
  const { fromTs, toTs, minHype, limit = 50 } = opts;
  const cacheKey = `recent_${Math.floor(fromTs / 86400)}_${Math.floor(toTs / 86400)}_h${minHype}`;
  const cached = upcomingCache.get(cacheKey);
  if (cached) return cached;

  const query = `fields id, name, first_release_date, cover.url, genres.name, platforms.id, platforms.name, involved_companies.company.name, involved_companies.developer, summary, hypes, category, version_parent, total_rating_count;
where (category = (0, 2, 8) | category = null)
  & hypes >= ${minHype}
  & version_parent = null
  & first_release_date >= ${fromTs}
  & first_release_date <= ${toTs};
sort first_release_date desc;
limit ${limit};`;

  const results = await igdbPost('games', query);

  const mapped: IgdbUpcomingRelease[] = results.map((raw) => ({
    igdbId: raw.id,
    title: raw.name,
    developer: getDeveloper(raw.involved_companies),
    releaseDate: raw.first_release_date ? new Date(raw.first_release_date * 1000).toISOString() : null,
    releaseDateCategory: categoriseRelease(raw.first_release_date),
    platforms: raw.platforms?.map((p) => p.name) ?? [],
    genres: raw.genres?.map((g) => g.name) ?? [],
    coverUrl: normalizeCover(raw.cover?.url),
    synopsis: raw.summary ?? null,
    wishlisted: false,  // caller fills this in (always false for the hyped list)
    category: raw.category ?? 0,
    hype: raw.hypes ?? null,
    userGameId: null,   // route layer enriches by joining against the caller's UserGames
  }));

  upcomingCache.set(cacheKey, mapped);
  return mapped;
}

/**
 * Shared core for the platform-id → IGDB Game resolution path. Hits
 * IGDB's external_games endpoint with a (uid, url-pattern) filter and
 * joins through to the parent game in a single query.
 *
 * **Why URL-pattern instead of category=N:** IGDB is migrating from
 * the legacy `category` enum to a newer `external_game_source` field.
 * Many current rows (e.g. Lego Batman: Legacy of the Dark Knight on
 * PSN, uid=10008537) have `category` set to NULL — the filter
 * `category = 36` returned `[]` against IGDB even though the row
 * exists. The storefront URL pattern is stable across both old and
 * new rows (verified 2026-05-27 via scripts/probe-igdb-external-games.ts).
 *
 * URL patterns by platform:
 *   Steam: store.steampowered.com
 *   GOG:   gog.com
 *   PSN:   store.playstation.com
 *   Xbox:  microsoft.com         (covers Microsoft Store + xbox.com under
 *                                  Microsoft's domain)
 */
async function getGameByExternalUid(
  urlPattern: string,
  uid: string,
): Promise<IgdbSearchResult | null> {
  const token = await getToken();
  const clientId = process.env['TWITCH_CLIENT_ID'] ?? '';
  const res = await fetch('https://api.igdb.com/v4/external_games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `fields game.id, game.name, game.first_release_date, game.cover.url, game.genres.name, game.involved_companies.company.name, game.involved_companies.developer, game.platforms.name, game.total_rating_count;
where uid = "${uid}" & url ~ *"${urlPattern}"*;
limit 1;`,
  });
  if (!res.ok) throw new Error(`IGDB external_games failed: ${res.status}`);

  const data = await res.json() as IgdbRawExternalGame[];
  const raw = data[0]?.game;
  return raw ? mapToSearchResult(raw) : null;
}

export async function getGameBySteamId(steamAppId: number): Promise<IgdbSearchResult | null> {
  const key = `steam_${steamAppId}`;
  const cached = steamCache.get(key);
  if (cached !== undefined) return cached;
  const result = await getGameByExternalUid('store.steampowered.com', String(steamAppId));
  steamCache.set(key, result);
  return result;
}

/**
 * N-series — match a PSN game by Sony's "concept ID". Returned by
 * psn-api as `titles[].concept.id` and mapped to IGDB via external_games
 * with category = 36 (Playstation Store). Bypasses fuzzy title matching
 * entirely — crucial for non-English PSN accounts where the title comes
 * back localized (Italian "L'Eredità del Cavaliere Oscuro" vs IGDB's
 * canonical English "Legacy of the Dark Knight").
 */
export async function getGameByPsnConceptId(conceptId: number): Promise<IgdbSearchResult | null> {
  const key = `psn_${conceptId}`;
  const cached = psnConceptCache.get(key);
  if (cached !== undefined) return cached;
  let result: IgdbSearchResult | null;
  try {
    result = await getGameByExternalUid('store.playstation.com', String(conceptId));
  } catch {
    return null; // graceful degradation — sync falls through to title search
  }
  psnConceptCache.set(key, result);
  return result;
}

/**
 * N-series — match an Xbox game by OpenXBL's titleId. IGDB external_games
 * Xbox rows have URLs under Microsoft's domain (microsoft.com/store/…
 * for newer Xbox titles or older xbox.com/games/… paths — both fall
 * under microsoft.com, since Microsoft routes both).
 */
export async function getGameByXboxTitleId(xboxTitleId: number): Promise<IgdbSearchResult | null> {
  const key = `xbox_${xboxTitleId}`;
  const cached = xboxTitleCache.get(key);
  if (cached !== undefined) return cached;
  let result: IgdbSearchResult | null;
  try {
    result = await getGameByExternalUid('microsoft.com', String(xboxTitleId));
  } catch {
    return null;
  }
  xboxTitleCache.set(key, result);
  return result;
}

/**
 * N-series — match a GOG game by GOG's product id. IGDB external_games
 * GOG rows have URLs under gog.com.
 */
export async function getGameByGogAppId(gogAppId: number): Promise<IgdbSearchResult | null> {
  const key = `gog_${gogAppId}`;
  const cached = gogAppCache.get(key);
  if (cached !== undefined) return cached;
  let result: IgdbSearchResult | null;
  try {
    result = await getGameByExternalUid('gog.com', String(gogAppId));
  } catch {
    return null;
  }
  gogAppCache.set(key, result);
  return result;
}

/**
 * M1 — match an itch.io game by itch's per-product id. IGDB
 * external_games itch.io rows have URLs under itch.io (the path
 * itself varies — `creator.itch.io/game-slug` or `itch.io/jam/…`).
 * Most itch.io games AREN'T in IGDB at all (jam entries, hobby
 * releases) — this lookup misses for ~all of them. The title-search
 * fallback in syncRunner is the realistic resolution path.
 */
export async function getGameByItchGameId(itchGameId: number): Promise<IgdbSearchResult | null> {
  const key = `itch_${itchGameId}`;
  const cached = itchGameCache.get(key);
  if (cached !== undefined) return cached;
  let result: IgdbSearchResult | null;
  try {
    result = await getGameByExternalUid('itch.io', String(itchGameId));
  } catch {
    return null;
  }
  itchGameCache.set(key, result);
  return result;
}

/**
 * M2 — match an Epic Games Store game by Epic's catalog item id.
 * IGDB external_games Epic rows have URLs under store.epicgames.com.
 * Catalog item IDs are opaque hex strings (32 chars). Unlike the
 * numeric platform IDs, the cache key is the string itself.
 */
export async function getGameByEpicCatalogItemId(catalogItemId: string): Promise<IgdbSearchResult | null> {
  const key = `epic_${catalogItemId}`;
  const cached = epicCatalogCache.get(key);
  if (cached !== undefined) return cached;
  let result: IgdbSearchResult | null;
  try {
    result = await getGameByExternalUid('store.epicgames.com', catalogItemId);
  } catch {
    return null;
  }
  epicCatalogCache.set(key, result);
  return result;
}

/**
 * M3 — match a Nintendo Switch game by the Switch application id.
 * IGDB external_games Nintendo rows have URLs under nintendo.com.
 * Application IDs are 16-char hex strings. IGDB's coverage of Switch
 * games is decent for first-party titles but spotty for indies — the
 * title-search + L-series localization fallback in syncRunner picks
 * up the misses.
 */
export async function getGameByNintendoTitleId(nintendoTitleId: string): Promise<IgdbSearchResult | null> {
  const key = `nintendo_${nintendoTitleId}`;
  const cached = nintendoTitleCache.get(key);
  if (cached !== undefined) return cached;
  let result: IgdbSearchResult | null;
  try {
    result = await getGameByExternalUid('nintendo.com', nintendoTitleId);
  } catch {
    return null;
  }
  nintendoTitleCache.set(key, result);
  return result;
}

const releaseDetailsCache = makeCache<IgdbUpcomingRelease | null>(ONE_DAY);

// Fetch a single game by igdbId in the rich upcoming-release shape — needed
// by the wishlist-toggle endpoint so persisted rows aren't impoverished
// (releaseDate / platforms / synopsis / hype / category / releaseDateCategory
// were all dropped by the previous getGame()-based code path).
export async function getReleaseDetails(igdbId: number): Promise<IgdbUpcomingRelease | null> {
  const key = String(igdbId);
  const cached = releaseDetailsCache.get(key);
  if (cached !== undefined) return cached;

  const results = await igdbPost(
    'games',
    `fields id, name, first_release_date, cover.url, genres.name, platforms.id, platforms.name, involved_companies.company.name, involved_companies.developer, summary, hypes, category;
where id = ${igdbId};
limit 1;`,
  );
  const raw = results[0];
  if (!raw) {
    releaseDetailsCache.set(key, null);
    return null;
  }
  const mapped: IgdbUpcomingRelease = {
    igdbId: raw.id,
    title: raw.name,
    developer: getDeveloper(raw.involved_companies),
    releaseDate: raw.first_release_date ? new Date(raw.first_release_date * 1000).toISOString() : null,
    releaseDateCategory: categoriseRelease(raw.first_release_date),
    platforms: raw.platforms?.map((p) => p.name) ?? [],
    genres: raw.genres?.map((g) => g.name) ?? [],
    coverUrl: normalizeCover(raw.cover?.url),
    synopsis: raw.summary ?? null,
    wishlisted: false,  // caller fills this in
    category: raw.category ?? 0,
    hype: raw.hypes ?? null,
    userGameId: null,   // caller fills this in
  };
  releaseDetailsCache.set(key, mapped);
  return mapped;
}

const timeToBeatCache = makeCache<IgdbTimeToBeat | null>(ONE_DAY);

// IGDB exposes time-to-beat at the dedicated /game_time_to_beats endpoint
// (NOT as a sub-field on /games). Keyed by game_id; returns at most one row
// per game. Values are in seconds — caller converts to minutes.
export async function getTimeToBeat(igdbId: number): Promise<IgdbTimeToBeat | null> {
  const key = String(igdbId);
  const cached = timeToBeatCache.get(key);
  if (cached !== undefined) return cached;

  const token = await getToken();
  const clientId = process.env['TWITCH_CLIENT_ID'] ?? '';
  const res = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: `fields hastily, normally, completely; where game_id = ${igdbId}; limit 1;`,
  });
  if (!res.ok) {
    timeToBeatCache.set(key, null);
    return null;
  }
  const data = await res.json() as IgdbRawGameTimeToBeat[];
  const raw = data[0];
  const result = raw ? {
    hastily: raw.hastily ?? null,
    normally: raw.normally ?? null,
    completely: raw.completely ?? null,
  } : null;
  timeToBeatCache.set(key, result);
  return result;
}

export function clearCaches(): void {
  cachedToken = null;
  tokenExpiry = 0;
  searchCache.clear();
  gameCache.clear();
  steamCache.clear();
  upcomingCache.clear();
  timeToBeatCache.clear();
  releaseDetailsCache.clear();
}
