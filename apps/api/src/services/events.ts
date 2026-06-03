// EV-PR1 — IGDB showcase / industry-event sync (docs/EVENTS_PLAN.md).
//
// NOT to be confused with the telemetry `UserEvent` service (no separate
// file — telemetry writes go through `apps/api/src/lib/logEvent.ts`). This
// file owns ingestion of IGDB's `events` endpoint into the new `Event` +
// `EventGame` tables. Nightly cron + admin manual refresh per EV-D1.
//
// Patterns mirrored from `apps/api/src/services/igdb.ts`:
//   - Twitch token cache (we reuse the same env vars + auth flow via
//     `igdb.ts`'s exported helpers; this file makes direct fetch calls to
//     the events endpoint).
//   - 24h in-memory result cache.
//   - Per-event error handling — one bad event doesn't fail the whole sync.
//
// Concretely owns:
//   - `getEventsBatch(opts?)` — paginated IGDB query
//   - `getEventBySlug(slug)`  — single-event on-demand lookup (EV-D16 404 fallback)
//   - `getEventState(event, now?)` — upcoming / live / past classification (EV-D12)
//   - `syncAllEvents(prisma)` — full orchestrator (cron + manual button)
//   - `syncSingleEventBySlug(prisma, slug)` — single-event variant

import type { PrismaClient } from '@hoard/db';
import type { IgdbEvent, EventState, EventsSyncSummary } from '@hoard/types';
import { getGame } from './igdb';

/* ── Token + post helpers (mirror of igdb.ts) ─────────────────────────── */

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
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

async function igdbPost<T>(endpoint: string, query: string): Promise<T> {
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
  return await res.json() as T;
}

/* ── 24h cache ────────────────────────────────────────────────────────── */

interface CacheEntry<T> { data: T; expiresAt: number }
function makeCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry || Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
      return entry.data;
    },
    set(key: string, data: T): void { store.set(key, { data, expiresAt: Date.now() + ttlMs }); },
    clear(): void { store.clear(); },
  };
}
const ONE_DAY = 24 * 60 * 60 * 1000;
const batchCache = makeCache<IgdbEvent[]>(ONE_DAY);
const slugCache = makeCache<IgdbEvent | null>(ONE_DAY);

/* ── IGDB raw shape ───────────────────────────────────────────────────── */

interface IgdbRawEvent {
  id: number;
  slug?: string;
  name?: string;
  description?: string;
  start_time?: number;
  end_time?: number;
  live_stream_url?: string;
  time_zone?: string;
  event_logo?: { image_id?: string };
  event_networks?: Array<{
    network_type?: { name?: string };
    url?: string;
  }>;
  videos?: Array<{
    video_id?: string;
    name?: string;
  }>;
  games?: number[];
}

const EVENTS_FIELDS = `name, slug, description, start_time, end_time, live_stream_url,
       time_zone, event_logo.image_id,
       event_networks.network_type.name, event_networks.url,
       videos.video_id, videos.name,
       games`;

function deriveLogoUrl(imageId: string | null | undefined): string | null {
  if (!imageId) return null;
  return `https://images.igdb.com/igdb/image/upload/t_logo_med/${imageId}.jpg`;
}

function mapToIgdbEvent(raw: IgdbRawEvent): IgdbEvent | null {
  // Events without a start_time are surfaced as TBA-only entries in IGDB
  // and are useless for the time-axis UX. Skip at the mapper.
  if (!raw.start_time || !raw.slug || !raw.name) return null;
  const networks = (raw.event_networks ?? [])
    .map((n) => ({
      name: n.network_type?.name ?? 'Unknown',
      type: n.network_type?.name ?? 'Unknown',
      url: n.url ?? null,
    }));
  const videos = (raw.videos ?? [])
    .filter((v) => !!v.video_id)
    .map((v) => ({
      youtubeId: v.video_id as string,
      name: v.name ?? null,
    }));
  return {
    igdbId: raw.id,
    slug: raw.slug,
    name: raw.name,
    description: raw.description ?? null,
    startTime: new Date(raw.start_time * 1000).toISOString(),
    endTime: raw.end_time ? new Date(raw.end_time * 1000).toISOString() : null,
    liveStreamUrl: raw.live_stream_url ?? null,
    timeZone: raw.time_zone ?? null,
    logoUrl: deriveLogoUrl(raw.event_logo?.image_id ?? null),
    networks,
    videos,
    gameIgdbIds: Array.isArray(raw.games) ? raw.games : [],
  };
}

/* ── Public read API ──────────────────────────────────────────────────── */

export interface GetEventsBatchOpts {
  /** Max rows to fetch from IGDB. Hard ceiling at IGDB-side 500; values
   *  above are clamped. Defaults to 500. */
  limit?: number;
  offset?: number;
}

/**
 * Fetch a batch of events from IGDB. Sort: start_time desc (most recent
 * first — past events appear before upcoming in the raw response; the route
 * layer re-sections them by state). Per EV-D8.
 */
export async function getEventsBatch(opts: GetEventsBatchOpts = {}): Promise<IgdbEvent[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 500), 500);
  const offset = Math.max(0, opts.offset ?? 0);
  const key = `batch:${limit}:${offset}`;
  const cached = batchCache.get(key);
  if (cached) return cached;

  const raws = await igdbPost<IgdbRawEvent[]>(
    'events',
    `fields ${EVENTS_FIELDS};
where start_time != null;
sort start_time desc;
limit ${limit};
offset ${offset};`,
  );

  const mapped = raws
    .map(mapToIgdbEvent)
    .filter((e): e is IgdbEvent => e !== null);
  batchCache.set(key, mapped);
  return mapped;
}

/**
 * Single-event on-demand lookup by slug. Powers the EV-D16 404 fallback —
 * when `/api/events/:slug` doesn't find a row in the DB, we attempt one
 * IGDB lookup before responding 404. Returns null when IGDB has no event
 * with that slug.
 *
 * `opts.skipCache` bypasses the 24h slugCache — used by `resolveEventGames`
 * so explicit user-triggered refreshes never serve a stale empty payload
 * (community curation often adds games hours after the event airs;
 * yesterday's cached empty result must not survive the user's retry).
 */
export async function getEventBySlug(
  slug: string,
  opts: { skipCache?: boolean } = {},
): Promise<IgdbEvent | null> {
  const key = `slug:${slug}`;
  if (!opts.skipCache) {
    const cached = slugCache.get(key);
    if (cached !== undefined) return cached;
  }

  // IGDB accepts string-equality in `where` via double-quoted strings.
  const safe = slug.replace(/"/g, '\\"');
  let raws: IgdbRawEvent[];
  try {
    raws = await igdbPost<IgdbRawEvent[]>(
      'events',
      `fields ${EVENTS_FIELDS};
where slug = "${safe}";
limit 1;`,
    );
  } catch {
    slugCache.set(key, null);
    return null;
  }
  const result = raws[0] ? mapToIgdbEvent(raws[0]) : null;
  slugCache.set(key, result);
  return result;
}

/**
 * Three-state classification per EV-D12.
 *
 *   - `upcoming` — startTime > now
 *   - `live`     — startTime ≤ now AND endTime hasn't passed.
 *     When endTime is null, fall back to a 4h window from startTime
 *     (covers all known showcase formats — SGF ~3h, TGA ~3h, Directs ~1h).
 *   - `past`     — anything not upcoming or live.
 *
 * `now` is parameterised for testability.
 */
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export function getEventState(
  event: { startTime: string; endTime: string | null },
  now: Date = new Date(),
): EventState {
  const start = new Date(event.startTime).getTime();
  const nowMs = now.getTime();
  if (start > nowMs) return 'upcoming';
  const end = event.endTime ? new Date(event.endTime).getTime() : start + FOUR_HOURS_MS;
  if (end >= nowMs) return 'live';
  return 'past';
}

/* ── Sync orchestrator ────────────────────────────────────────────────── */

const RESOLVE_BATCH_SIZE = 50;

/**
 * Resolve a list of IGDB game ids to Hoard `Game.id` strings, upserting
 * missing rows from IGDB metadata along the way. Batched by 50 (the IGDB
 * batch query ceiling). Returns a Map keyed by IGDB id (for ids that
 * resolved); failed-to-resolve ids are silently omitted (caller skips
 * those EventGame links).
 *
 * Reuses the existing `getGame(igdbId)` helper from igdb.ts — that fetcher
 * already does a cached one-by-one lookup. For better throughput at scale
 * we batch lookups via the IGDB `where id = (X, Y, ...)` pattern below.
 */
async function resolveGameIdsToHoard(
  prisma: PrismaClient,
  igdbIds: number[],
): Promise<{ resolved: Map<number, string>; upserted: number }> {
  const resolved = new Map<number, string>();
  let upserted = 0;
  if (igdbIds.length === 0) return { resolved, upserted };

  const dedup = Array.from(new Set(igdbIds));

  // Step 1 — look up existing Game rows by igdbId in chunks.
  const CHUNK = 200;
  for (let i = 0; i < dedup.length; i += CHUNK) {
    const slice = dedup.slice(i, i + CHUNK);
    const rows = await prisma.game.findMany({
      where: { igdbId: { in: slice } },
      select: { id: true, igdbId: true },
    });
    for (const r of rows) resolved.set(r.igdbId, r.id);
  }

  // Step 2 — for ids that didn't resolve, batch-fetch from IGDB + upsert.
  const missing = dedup.filter((id) => !resolved.has(id));
  for (let i = 0; i < missing.length; i += RESOLVE_BATCH_SIZE) {
    const slice = missing.slice(i, i + RESOLVE_BATCH_SIZE);
    for (const igdbId of slice) {
      try {
        const sg = await getGame(igdbId);
        if (!sg) continue;
        const game = await prisma.game.upsert({
          where: { igdbId: sg.igdbId },
          update: {
            title: sg.title,
            developer: sg.developer,
            releaseYear: sg.releaseYear,
            genres: sg.genres,
            themes: sg.themes,
            playerPerspectives: sg.playerPerspectives,
            coverUrl: sg.coverUrl,
            heroImageUrl: sg.heroImageUrl,
          },
          create: {
            igdbId: sg.igdbId,
            title: sg.title,
            developer: sg.developer,
            releaseYear: sg.releaseYear,
            genres: sg.genres,
            themes: sg.themes,
            playerPerspectives: sg.playerPerspectives,
            coverUrl: sg.coverUrl,
            heroImageUrl: sg.heroImageUrl,
          },
        });
        resolved.set(igdbId, game.id);
        upserted += 1;
      } catch {
        // Skip — per-game IGDB failures don't kill the sync. The user
        // sees the event with a smaller game grid; community-curated data
        // backfills next sync.
        continue;
      }
    }
  }

  return { resolved, upserted };
}

/**
 * Write one IGDB event + its EventGame join rows. Replace-all strategy
 * per EV-D9: delete the existing join rows for this event, then create
 * the new set. Wrapped in a transaction so a sync interruption never
 * leaves an event with a partial join set.
 */
async function writeEvent(
  prisma: PrismaClient,
  raw: IgdbEvent,
  gameIdResolutions: Map<number, string>,
): Promise<{ eventId: string; linksWritten: number }> {
  const startTime = new Date(raw.startTime);
  const endTime = raw.endTime ? new Date(raw.endTime) : null;

  const event = await prisma.event.upsert({
    where: { igdbId: raw.igdbId },
    update: {
      slug: raw.slug,
      name: raw.name,
      description: raw.description,
      startTime,
      endTime,
      liveStreamUrl: raw.liveStreamUrl,
      timeZone: raw.timeZone,
      logoUrl: raw.logoUrl,
      networks: raw.networks,
      videos: raw.videos,
    },
    create: {
      igdbId: raw.igdbId,
      slug: raw.slug,
      name: raw.name,
      description: raw.description,
      startTime,
      endTime,
      liveStreamUrl: raw.liveStreamUrl,
      timeZone: raw.timeZone,
      logoUrl: raw.logoUrl,
      networks: raw.networks,
      videos: raw.videos,
    },
    select: { id: true },
  });

  const joinRows = raw.gameIgdbIds
    .map((igdbId) => gameIdResolutions.get(igdbId))
    .filter((id): id is string => typeof id === 'string')
    .map((gameId) => ({ eventId: event.id, gameId }));

  // Dedup defensively — IGDB occasionally returns the same game id twice
  // for the same event (e.g. when a game has multiple announcement-type
  // associations); the unique constraint on (eventId, gameId) would 500
  // the whole write otherwise.
  const dedupedJoins = Array.from(
    new Map(joinRows.map((j) => [`${j.eventId}::${j.gameId}`, j])).values(),
  );

  await prisma.$transaction([
    prisma.eventGame.deleteMany({ where: { eventId: event.id } }),
    ...(dedupedJoins.length > 0
      ? [prisma.eventGame.createMany({ data: dedupedJoins, skipDuplicates: true })]
      : []),
  ]);

  return { eventId: event.id, linksWritten: dedupedJoins.length };
}

/**
 * Full sync — fetch IGDB events batch + upsert event rows only. Game-id
 * resolution is intentionally skipped (Andrea 2026-06-02): pre-resolving
 * thousands of games across 500 events takes 30+ min on cold IGDB cache
 * and blocks every event from appearing in the list. Instead, events are
 * written with `gamesResolvedAt: null` and game lists are filled in
 * lazily via `resolveEventGames(slug)` triggered by the detail view's
 * `[load games]` button.
 *
 * Per-event failures don't fail the whole sync.
 */
export async function syncAllEvents(prisma: PrismaClient): Promise<EventsSyncSummary> {
  const events = await getEventsBatch({ limit: 500 });

  let eventsUpserted = 0;
  for (const evt of events) {
    try {
      await writeEventRowOnly(prisma, evt);
      eventsUpserted += 1;
    } catch {
      continue;
    }
  }

  return {
    scanned: events.length,
    eventsUpserted,
    gamesUpserted: 0,         // lazy now — see resolveEventGames
    gameLinksUpserted: 0,
  };
}

/**
 * Single-event sync — used by the EV-D16 404 fallback path. Fetches the
 * event from IGDB by slug, upserts the Event row (games left unresolved
 * for the same reason as syncAllEvents), returns the new Event row's id
 * (or null when IGDB has no event with that slug).
 */
export async function syncSingleEventBySlug(
  prisma: PrismaClient,
  slug: string,
): Promise<string | null> {
  const igdbEvent = await getEventBySlug(slug);
  if (!igdbEvent) return null;
  const event = await writeEventRowOnly(prisma, igdbEvent);
  return event.id;
}

/**
 * Write/refresh a single Event row WITHOUT touching its EventGame join.
 * Mirrors writeEvent but skips the game-link replacement transaction.
 */
async function writeEventRowOnly(
  prisma: PrismaClient,
  raw: IgdbEvent,
): Promise<{ id: string }> {
  const startTime = new Date(raw.startTime);
  const endTime = raw.endTime ? new Date(raw.endTime) : null;
  return prisma.event.upsert({
    where: { igdbId: raw.igdbId },
    update: {
      slug: raw.slug, name: raw.name, description: raw.description,
      startTime, endTime,
      liveStreamUrl: raw.liveStreamUrl, timeZone: raw.timeZone,
      logoUrl: raw.logoUrl, networks: raw.networks, videos: raw.videos,
    },
    create: {
      igdbId: raw.igdbId, slug: raw.slug, name: raw.name, description: raw.description,
      startTime, endTime,
      liveStreamUrl: raw.liveStreamUrl, timeZone: raw.timeZone,
      logoUrl: raw.logoUrl, networks: raw.networks, videos: raw.videos,
    },
    select: { id: true },
  });
}

/**
 * Per-event lazy game resolution. Fetches the event from IGDB by slug
 * (to get the current `games` array — IGDB's community curation can add
 * games at any time), resolves each IGDB game id to a Hoard `Game` row
 * (upserting missing rows), replaces the EventGame join, and stamps
 * `gamesResolvedAt = NOW()`.
 *
 * Returns the resolved count + the updated Event id. Caller refetches the
 * detail payload to render the grid. Throws if the event slug isn't in
 * IGDB (caller should 404).
 */
export async function resolveEventGames(
  prisma: PrismaClient,
  slug: string,
): Promise<{ eventId: string; linksWritten: number; gamesUpserted: number }> {
  // Bypass the 24h slugCache: this path is invoked by the user clicking
  // [load games] / [check again], so the intent is always fresh data.
  // Caching here would silently surface yesterday's empty payload after
  // IGDB community curation has caught up.
  const igdbEvent = await getEventBySlug(slug, { skipCache: true });
  if (!igdbEvent) throw new Error(`Event ${slug} not found on IGDB`);

  const { resolved, upserted } = await resolveGameIdsToHoard(prisma, igdbEvent.gameIgdbIds);

  // writeEvent already replaces-all the join rows transactionally; reuse it
  // and then stamp gamesResolvedAt as a separate update.
  const { eventId, linksWritten } = await writeEvent(prisma, igdbEvent, resolved);
  await prisma.event.update({
    where: { id: eventId },
    data: { gamesResolvedAt: new Date() },
  });
  return { eventId, linksWritten, gamesUpserted: upserted };
}

/* ── Test hooks ───────────────────────────────────────────────────────── */

export function clearEventsCaches(): void {
  batchCache.clear();
  slugCache.clear();
}
