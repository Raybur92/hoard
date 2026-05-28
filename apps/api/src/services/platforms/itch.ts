// itch.io library sync via the official server-side API
// (https://itch.io/docs/api/serverside). M1 of the sync-expansion
// workstream (docs/SYNC_EXPANSION_PLAN.md).
//
// itch.io is the only platform in M-series with a fully sanctioned
// public API — no OAuth dance, no reverse-engineering. The user
// generates a per-account API key from
// https://itch.io/user/settings/api-keys and pastes it into Hoard.
// The key goes in the URL path (not a Bearer header), e.g.
// `https://itch.io/api/1/<key>/me`.
//
// Library is fetched via `/my-owned-keys?page=N` (paginated, 50 per
// page). Each owned_key wraps a `game` subdoc with `id`, `title`, and
// `url`. We don't get playtime — itch.io doesn't track it — so games
// land in Backlog by default (same as GOG).
//
// Match rate against IGDB is expected to be low. Most itch.io games
// are jam entries / hobby releases that aren't catalogued in IGDB at
// all. Skipped titles surface in the activity log via the existing
// N-series diagnostic instrumentation; the user can fall back to
// manual-add for anything sync misses.

import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

const ITCH_BASE = 'https://itch.io/api/1';
/** Polite delay between paginated requests. itch.io doesn't publish a
 *  hard rate limit; 200ms matches the GOG flow. */
const PAGE_DELAY_MS = 200;
/** Hard cap so a buggy response can't infinite-loop us. 50 pages × 50
 *  games = 2500 owned keys, well past any realistic itch.io library. */
const MAX_PAGES = 50;

export interface ItchCredentials {
  apiKey: string;
}

interface ItchUserResponse {
  user?: {
    id?: number;
    username?: string;
    display_name?: string;
    url?: string;
    cover_url?: string;
  };
  /** Present on auth failures: `{ errors: ["invalid key"] }`. */
  errors?: string[];
}

interface ItchOwnedKey {
  id?: number;
  game?: {
    id?: number;
    title?: string;
    url?: string;
    short_text?: string;
    cover_url?: string;
    classification?: string; // "game" | "tool" | "asset_pack" | etc.
    type?: string;
  };
}

interface ItchOwnedKeysResponse {
  owned_keys?: ItchOwnedKey[];
  errors?: string[];
}

/**
 * Validate an itch.io API key by calling `/me`. Returns true on 200
 * with a `user` field, false otherwise. Used by the connect endpoint
 * to reject malformed/expired keys before we persist them.
 */
export async function validateItchApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.length < 10) return false;
  try {
    const res = await fetch(`${ITCH_BASE}/${apiKey}/me`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json() as ItchUserResponse;
    return !!data.user && (data.errors === undefined || data.errors.length === 0);
  } catch {
    return false;
  }
}

/**
 * Fetch the user's itch.io username (or display_name) via the `/me`
 * endpoint. Fail-silent per M-D13 — decorative metadata that must
 * never block connect or sync.
 *
 * Prefers `display_name` (what the user actually picked as their
 * public name) over `username` (the URL slug) when both are set,
 * since the display name is the more recognisable identity.
 */
export async function getItchUsername(apiKey: string): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${ITCH_BASE}/${apiKey}/me`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as ItchUserResponse;
    const name = data.user?.display_name || data.user?.username;
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchItchOwnedKeysPage(apiKey: string, page: number): Promise<ItchOwnedKeysResponse> {
  const url = `${ITCH_BASE}/${apiKey}/my-owned-keys?page=${page}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(`itch.io network error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('itch.io API: 401/403 — API key expired or revoked');
  }
  if (!res.ok) {
    throw new Error(`itch.io API error: ${res.status}`);
  }
  let data: ItchOwnedKeysResponse;
  try {
    data = await res.json() as ItchOwnedKeysResponse;
  } catch {
    throw new Error('itch.io API returned malformed JSON');
  }
  if (data.errors && data.errors.length > 0) {
    throw new Error(`itch.io API: ${data.errors.join(', ')}`);
  }
  return data;
}

/**
 * Fetch the user's full itch.io library by paginating through
 * `/my-owned-keys`. Each page returns up to 50 owned_keys; a typical
 * Hoard user library is 1–5 pages. Sequential fetches with a 200ms
 * polite delay.
 *
 * No playtime data — itch.io doesn't track it. Games land in Backlog
 * because `hasBeenPlayed` is unset.
 *
 * Filters defensively:
 *   - drops keys without a `game` subdoc (rare but real for assets/tools).
 *   - drops keys whose game has no `title` (can't IGDB-match anything).
 *   - keeps classifications other than "game" too — itch.io's
 *     `classification` field is unreliable (many actual games are tagged
 *     `tool` etc.). The IGDB title-search will naturally filter
 *     non-games via missing matches.
 */
export async function syncItchLibrary(credentials: ItchCredentials): Promise<SyncedGame[]> {
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error('itch.io API key missing');

  const keys: ItchOwnedKey[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const data = await fetchItchOwnedKeysPage(apiKey, page);
    const pageKeys = data.owned_keys ?? [];
    if (pageKeys.length === 0) break;
    keys.push(...pageKeys);
  }

  return keys
    .filter((k): k is ItchOwnedKey & { game: { id: number; title: string; url?: string } } =>
      !!k.game &&
      typeof k.game.id === 'number' && k.game.id > 0 &&
      typeof k.game.title === 'string' && k.game.title.length > 0,
    )
    .map((k) => {
      const out: SyncedGame = {
        igdbSearchTitle: k.game.title,
        itchGameId: k.game.id,
        platformCode: 'IT' as PlatformCode,
        playtimeMinutes: 0,
        lastPlayedAt: null,
      };
      if (k.game.url) out.itchUrl = k.game.url;
      return out;
    });
}
