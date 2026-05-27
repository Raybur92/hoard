// GOG library sync via the GOG Galaxy OAuth flow + embed.gog.com
// community API endpoints.
//
// OAuth pattern: GOG doesn't issue third-party OAuth credentials —
// every community tool (Heroic, Lutris, Minigalaxy, etc.) uses the
// publicly-known GOG Galaxy desktop-client credentials. Andrea picked
// the "env vars, no hardcoded defaults, fail-loud if missing" approach
// (2026-05-27) so the credentials live in deployment env config, not
// committed source. Set:
//
//   GOG_CLIENT_ID      = "<Galaxy client_id>"
//   GOG_CLIENT_SECRET  = "<Galaxy client_secret>"
//
// in `apps/api/.env` (local dev) AND on Railway → API service →
// Variables (production). The values are publicly documented; see
// gogapidocs.netlify.app or any of the community-tool repos.
//
// Galaxy's OAuth redirect URI is hardcoded to
//   https://embed.gog.com/on_login_success?origin=client
// and cannot be changed (Galaxy is registered with that exact URI on
// GOG's auth server). The user-facing flow is therefore "paste-code":
// the user signs into GOG in a new tab, gets redirected to Galaxy's
// success page, copies the `code=` value from the URL, pastes it back
// into Hoard. Same shape as PSN's NPSSO flow.
//
// Access tokens expire in 1 hour. Refresh tokens are long-lived
// (~30 days). Sub-unit #5.2 will wrap library sync calls in
// auto-refresh-on-401 logic; this file just provides the building
// blocks.

import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

/** Hardcoded — Galaxy's OAuth redirect URI cannot be changed. */
export const GOG_GALAXY_REDIRECT_URI = 'https://embed.gog.com/on_login_success?origin=client';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`GOG OAuth: ${name} env var is required but missing. See gog.ts header for setup instructions.`);
  }
  return v;
}

export interface GogCredentials {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 timestamp when the access token expires. */
  expiresAt: string;
}

export interface GogOAuthResult {
  accessToken: string;
  refreshToken: string;
  /** Seconds-from-now when the access token expires (per GOG's response). */
  expiresIn: number;
}

/**
 * Build the GOG auth URL the user clicks to start the OAuth dance.
 * Always uses Galaxy's hardcoded redirect URI; the caller doesn't pass
 * one because changing it would break the OAuth handshake.
 */
export function getGogAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOG_CLIENT_ID'),
    redirect_uri: GOG_GALAXY_REDIRECT_URI,
    response_type: 'code',
    layout: 'client2',
  });
  return `https://auth.gog.com/auth?${params.toString()}`;
}

/**
 * Exchange an OAuth `code` (from the post-login redirect URL) for an
 * access + refresh token pair. Called once per connect from the
 * POST /api/platforms/gog/connect endpoint.
 */
export async function exchangeGogCode(code: string): Promise<GogOAuthResult> {
  const res = await fetch('https://auth.gog.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireEnv('GOG_CLIENT_ID'),
      client_secret: requireEnv('GOG_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: GOG_GALAXY_REDIRECT_URI,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`GOG token exchange failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

/**
 * Refresh an expired/expiring access token using a stored refresh token.
 * GOG returns a new refresh token on every refresh — callers MUST
 * persist the new one, NOT keep using the old one.
 */
export async function refreshGogToken(refreshToken: string): Promise<GogOAuthResult> {
  const res = await fetch('https://auth.gog.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requireEnv('GOG_CLIENT_ID'),
      client_secret: requireEnv('GOG_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`GOG token refresh failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

/**
 * Compute an ISO 8601 expiry timestamp from `expiresIn` (seconds from
 * now). Subtracts a 60-second safety margin so callers refresh before
 * the token actually expires.
 */
export function computeExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
}

/**
 * If the stored access token is at or past its expiry, refresh it.
 * Returns either the same `creds` (no refresh needed) or a NEW
 * credentials object (caller must persist).
 *
 * Caller checks identity equality (`fresh === creds`) to decide whether
 * to write to the DB.
 */
export async function ensureFreshGogCredentials(creds: GogCredentials): Promise<GogCredentials> {
  if (Date.now() < new Date(creds.expiresAt).getTime()) return creds;
  const fresh = await refreshGogToken(creds.refreshToken);
  return {
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken,
    expiresAt: computeExpiresAt(fresh.expiresIn),
  };
}

const EMBED_BASE = 'https://embed.gog.com';
/** Polite delay between paginated requests so we don't spam GOG. */
const PAGE_DELAY_MS = 200;
/** Hard cap on pagination so a buggy `totalPages` response can't infinite-loop. */
const MAX_PAGES = 50;

interface GogProduct {
  id?: number;
  title?: string;
  image?: string;
  slug?: string;
  /** "game" | "dlc" | "pack" | "movie" — we keep only games. */
  gameType?: string;
  isHidden?: boolean;
  releaseTimestamp?: number | null;
  rating?: number;
}

interface GogProductsPageResponse {
  products?: GogProduct[];
  totalProducts?: number;
  totalPages?: number;
  page?: number;
  sortBy?: string;
  movies?: unknown[];
}

async function fetchGogProductsPage(accessToken: string, page: number): Promise<GogProductsPageResponse> {
  const url = `${EMBED_BASE}/account/getFilteredProducts?mediaType=1&page=${page}&hiddenFlag=0&sortBy=title`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw new Error(`GOG network error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (res.status === 401) {
    throw new Error('GOG API: 401 — access token expired or invalid (caller should refresh + retry)');
  }
  if (!res.ok) {
    throw new Error(`GOG API error: ${res.status}`);
  }
  try {
    return await res.json() as GogProductsPageResponse;
  } catch {
    throw new Error('GOG API returned malformed JSON');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the user's full GOG library by paginating through
 * /account/getFilteredProducts. Each page returns up to ~48 products;
 * a typical Hoard user library is 1–5 pages. Sequential fetches with
 * a 200ms polite delay — GOG has no documented rate limit on embed.gog
 * endpoints but we don't want to be the test case.
 *
 * Throws on 401 (caller's responsibility to refresh via
 * ensureFreshGogCredentials BEFORE calling, since proactive refresh
 * keeps the persistence concerns out of this function).
 *
 * No playtime data — GOG community API doesn't expose per-title minutes.
 * `playtimeMinutes` is set to 0 and `hasBeenPlayed` to false; the
 * imported games land in Backlog status (no engagement signal).
 */
export async function syncGogLibrary(credentials: GogCredentials): Promise<SyncedGame[]> {
  const accessToken = credentials.accessToken;
  if (!accessToken) throw new Error('GOG access token missing');

  const products: GogProduct[] = [];

  // Page 1 — also tells us totalPages so we can decide how many more
  // to fetch. GOG returns `totalPages` 1-based.
  const first = await fetchGogProductsPage(accessToken, 1);
  products.push(...(first.products ?? []));

  const totalPages = Math.min(first.totalPages ?? 1, MAX_PAGES);
  for (let p = 2; p <= totalPages; p++) {
    await sleep(PAGE_DELAY_MS);
    const page = await fetchGogProductsPage(accessToken, p);
    products.push(...(page.products ?? []));
  }

  return products
    // Defensive filters: drop nameless / non-Game / hidden products.
    // - `gameType === undefined` is kept (some responses omit the field).
    // - `isHidden === true` is dropped (user explicitly hid from library;
    //    hiddenFlag=0 in the query param should already filter these but
    //    the response field is the source of truth).
    .filter((p): p is GogProduct & { id: number; title: string } =>
      typeof p.id === 'number' && p.id > 0 &&
      typeof p.title === 'string' && p.title.length > 0 &&
      (p.gameType === undefined || p.gameType === 'game') &&
      p.isHidden !== true,
    )
    .map((p) => ({
      igdbSearchTitle: p.title,
      gogAppId: p.id,
      platformCode: 'GG' as PlatformCode,
      // No playtime data from the community API. Games land in Backlog
      // because hasBeenPlayed is unset (falsy → no engagement signal).
      playtimeMinutes: 0,
      lastPlayedAt: null,
    }));
}

export { SyncedGame };
