// Epic Games Store library sync via the official Epic Online Services
// account/library APIs. M2 of the sync-expansion workstream
// (docs/SYNC_EXPANSION_PLAN.md).
//
// Auth pattern: Epic doesn't issue OAuth credentials to third-party
// library aggregators, but the "Fortnite Android" public client
// credentials are widely reused by community tools (Heroic, Legendary,
// egs-api-rs) — they're published in those repos and across the EOS
// reverse-engineering community. We use them the same way GOG uses
// Galaxy's public client creds.
//
// Env-vars-only, no hardcoded defaults — matches the GOG pattern:
//
//   EPIC_CLIENT_ID      = "<Fortnite Android client_id>"
//   EPIC_CLIENT_SECRET  = "<Fortnite Android client_secret>"
//
// in `apps/api/.env` (local dev) AND on Railway → API service → Variables
// (production). The values are publicly documented (search for
// "fortniteAndroidGameClient" + any of the community tool repos).
//
// User-facing flow is paste-code (same shape as PSN's NPSSO + GOG):
// the user opens Epic's login page in a new tab, signs in, gets
// redirected to a page that shows the `authorizationCode` in a JSON
// blob, copies the code, pastes it back into Hoard.
//
// Access tokens expire in 7950s (~2h). Refresh tokens last 28 days.
// Refresh rotates BOTH tokens — callers MUST persist the new
// refreshToken, NOT keep using the old one.

import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

/** Epic's account-public-service base URL. */
const EPIC_OAUTH_BASE = 'https://account-public-service-prod03.ol.epicgames.com';
/** Epic's library-service for the /items endpoint. */
const EPIC_LIBRARY_BASE = 'https://library-service.live.use1a.on.epicgames.com';
/** The public-client-id "Fortnite Android" login redirect target. The
 *  redirect URL displays the `authorizationCode` in a JSON response;
 *  user copies the code from there. */
export const EPIC_LOGIN_URL =
  'https://www.epicgames.com/id/login?redirectUrl=' +
  encodeURIComponent('https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code');

/** Polite delay between paginated library requests. */
const PAGE_DELAY_MS = 200;
/** Hard cap on pagination so a buggy cursor response can't infinite-loop. */
const MAX_PAGES = 50;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Epic OAuth: ${name} env var is required but missing. See epic.ts header for setup instructions.`);
  }
  return v;
}

function basicAuthHeader(): string {
  const clientId = requireEnv('EPIC_CLIENT_ID');
  const clientSecret = requireEnv('EPIC_CLIENT_SECRET');
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export interface EpicCredentials {
  accessToken: string;
  refreshToken: string;
  /** Epic's per-user identifier (32-char hex). Captured from token
   *  exchange response; needed for username + library calls. */
  accountId: string;
  /** ISO 8601 timestamp when the access token expires. */
  expiresAt: string;
}

export interface EpicOAuthResult {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  /** Seconds-from-now when the access token expires (per Epic's response). */
  expiresIn: number;
}

interface EpicOAuthRawResponse {
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
  expires_in?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Exchange an authorization `code` (from the post-login redirect URL)
 * for an access + refresh token pair. Called once per connect from
 * POST /api/platforms/epic/connect.
 */
export async function exchangeEpicAuthCode(code: string): Promise<EpicOAuthResult> {
  const res = await fetch(`${EPIC_OAUTH_BASE}/account/api/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Epic token exchange failed: ${res.status} ${text.slice(0, 300)}`);
  }
  let data: EpicOAuthRawResponse;
  try {
    data = JSON.parse(text) as EpicOAuthRawResponse;
  } catch {
    throw new Error('Epic token exchange returned malformed JSON');
  }
  if (!data.access_token || !data.refresh_token || !data.account_id || typeof data.expires_in !== 'number') {
    throw new Error(`Epic token exchange returned an incomplete payload: ${data.errorCode ?? '(no errorCode)'}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId: data.account_id,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh an expired/expiring access token using the stored refresh
 * token. Epic returns a new refresh token on every refresh — callers
 * MUST persist the new one.
 */
export async function refreshEpicToken(refreshToken: string): Promise<EpicOAuthResult> {
  const res = await fetch(`${EPIC_OAUTH_BASE}/account/api/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Epic token refresh failed: ${res.status} ${text.slice(0, 300)}`);
  }
  let data: EpicOAuthRawResponse;
  try {
    data = JSON.parse(text) as EpicOAuthRawResponse;
  } catch {
    throw new Error('Epic token refresh returned malformed JSON');
  }
  if (!data.access_token || !data.refresh_token || !data.account_id || typeof data.expires_in !== 'number') {
    throw new Error('Epic token refresh returned an incomplete payload');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId: data.account_id,
    expiresIn: data.expires_in,
  };
}

/**
 * Compute an ISO 8601 expiry timestamp from `expiresIn` (seconds from
 * now). Subtracts a 60-second safety margin so callers refresh before
 * the token actually expires. Identical helper to GOG's `computeExpiresAt`
 * but local so this file stays self-contained.
 */
export function computeExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
}

/**
 * If the stored access token is at or past its expiry, refresh it.
 * Returns either the same `creds` (no refresh needed) or a NEW
 * credentials object (caller must persist). Identity-equality pattern
 * from GOG — caller checks `fresh === creds` to decide whether to write.
 */
export async function ensureFreshEpicCredentials(creds: EpicCredentials): Promise<EpicCredentials> {
  if (Date.now() < new Date(creds.expiresAt).getTime()) return creds;
  const fresh = await refreshEpicToken(creds.refreshToken);
  return {
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken,
    accountId: fresh.accountId,
    expiresAt: computeExpiresAt(fresh.expiresIn),
  };
}

/**
 * Fetch the user's Epic display name via the public account endpoint.
 * Fail-silent per M-D13 — decorative metadata that must never block
 * connect or sync.
 *
 * `displayName` is the public name shown in the Epic launcher; `country`
 * + `email` also appear in the response but we don't store them.
 */
export async function getEpicUsername(
  accessToken: string,
  accountId: string,
): Promise<string | null> {
  if (!accessToken || !accountId) return null;
  try {
    const res = await fetch(
      `${EPIC_OAUTH_BASE}/account/api/public/account/${encodeURIComponent(accountId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res?.ok) return null;
    const data = await res.json() as { displayName?: string };
    return data.displayName && data.displayName.length > 0 ? data.displayName : null;
  } catch {
    return null;
  }
}

interface EpicLibraryRecord {
  appName?: string;
  catalogItemId?: string;
  /** Per-publisher namespace (e.g. "fn" for Fortnite). Combined with the
   *  catalog item ID it forms the stable identity Epic uses internally. */
  namespace?: string;
  /** Marketplace product identifier — often the storefront URL slug. */
  productId?: string;
  sandboxName?: string;
  /** Catalog endpoint title; not always present. */
  title?: string;
  /** "Live" / "Demo" / "Trial". We only sync "Live". */
  releaseDate?: string | null;
}

interface EpicLibraryResponse {
  records?: EpicLibraryRecord[];
  responseMetadata?: {
    nextCursor?: string;
  };
  errorCode?: string;
  errorMessage?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchEpicLibraryPage(
  accessToken: string,
  cursor: string | undefined,
): Promise<EpicLibraryResponse> {
  const params = new URLSearchParams({
    platform: 'Windows',
    excludeNs: 'ue', // Unreal Engine asset namespace — not games
  });
  if (cursor) params.set('cursor', cursor);
  const url = `${EPIC_LIBRARY_BASE}/library/api/public/items?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw new Error(`Epic network error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (res.status === 401) {
    throw new Error('Epic API: 401 — access token expired or invalid (caller should refresh + retry)');
  }
  if (!res.ok) {
    throw new Error(`Epic library API error: ${res.status}`);
  }
  try {
    return await res.json() as EpicLibraryResponse;
  } catch {
    throw new Error('Epic library API returned malformed JSON');
  }
}

/**
 * Resolve a marketplace title for an Epic catalog item. Epic's library
 * endpoint returns `appName` (an internal opaque slug) and `productId`
 * (the storefront slug), but NOT the human-readable title. We hit the
 * catalog API per-item to fetch the title.
 *
 * This is the slow path — one IGDB call per library item. To keep
 * sync time reasonable we batch via the bulk catalog endpoint.
 */
async function resolveEpicCatalogTitles(
  accessToken: string,
  records: EpicLibraryRecord[],
): Promise<Map<string, string>> {
  const titlesByCatalogId = new Map<string, string>();
  if (records.length === 0) return titlesByCatalogId;

  // Epic's catalog bulk endpoint accepts up to 50 ids per call. Group
  // requests by namespace because the endpoint is namespaced.
  const BATCH = 50;
  const byNamespace = new Map<string, string[]>();
  for (const r of records) {
    if (!r.namespace || !r.catalogItemId) continue;
    const ids = byNamespace.get(r.namespace) ?? [];
    ids.push(r.catalogItemId);
    byNamespace.set(r.namespace, ids);
  }

  for (const [namespace, allIds] of byNamespace) {
    for (let i = 0; i < allIds.length; i += BATCH) {
      const batchIds = allIds.slice(i, i + BATCH);
      const params = new URLSearchParams({
        id: batchIds.join(','),
        includeMainGameDetails: 'false',
      });
      const url = `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items?${params.toString()}`;
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });
        if (!res.ok) continue; // skip the batch on error — those titles will fall back to appName
        const data = await res.json() as Record<string, { title?: string }>;
        for (const [catalogItemId, item] of Object.entries(data)) {
          if (item.title && item.title.length > 0) {
            titlesByCatalogId.set(catalogItemId, item.title);
          }
        }
      } catch {
        // Network error — skip this batch, fall back to appName for these titles.
      }
      if (i + BATCH < allIds.length) await sleep(PAGE_DELAY_MS);
    }
  }

  return titlesByCatalogId;
}

/**
 * Fetch the user's full Epic library via cursor-paginated calls to
 * library-service. Each page returns up to ~100 records; for each one
 * we then fetch the human-readable title via the catalog bulk endpoint.
 *
 * No playtime data — Epic doesn't expose per-title minutes via any
 * public API. `playtimeMinutes` is set to 0 and `hasBeenPlayed` is
 * unset; games land in Backlog because there's no engagement signal.
 *
 * Throws on 401 (caller's responsibility to refresh via
 * ensureFreshEpicCredentials BEFORE calling).
 */
export async function syncEpicLibrary(credentials: EpicCredentials): Promise<SyncedGame[]> {
  const accessToken = credentials.accessToken;
  if (!accessToken) throw new Error('Epic access token missing');

  const records: EpicLibraryRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    const data = await fetchEpicLibraryPage(accessToken, cursor);
    const pageRecords = data.records ?? [];
    records.push(...pageRecords);
    cursor = data.responseMetadata?.nextCursor;
    if (!cursor || pageRecords.length === 0) break;
  }

  // Fetch human-readable titles for every catalog item we found.
  const titles = await resolveEpicCatalogTitles(accessToken, records);

  return records
    // Defensive: drop records without a catalogItemId (can't IGDB-resolve).
    // Also drop records whose title is unresolvable AND whose appName
    // looks like an internal placeholder (we won't IGDB-match e.g. "fn").
    .filter((r): r is EpicLibraryRecord & { catalogItemId: string } =>
      typeof r.catalogItemId === 'string' && r.catalogItemId.length > 0,
    )
    .map((r) => {
      // Title priority: catalog API title (best) → record.title (rare) →
      // appName (worst fallback; usually opaque). IGDB resolution via
      // epicCatalogItemId works even when title is bad — title-search is
      // last-resort.
      const title = titles.get(r.catalogItemId) ?? r.title ?? r.appName ?? '';
      const out: SyncedGame = {
        igdbSearchTitle: title,
        epicCatalogItemId: r.catalogItemId,
        platformCode: 'EP' as PlatformCode,
        playtimeMinutes: 0,
        lastPlayedAt: null,
      };
      return out;
    })
    // Drop entries that ended up with an empty title — we can't IGDB-match
    // a row with no name AND no catalog title. The epicCatalogItemId path
    // could still work, but we'd surface the row as "" in the activity log
    // which is misleading.
    .filter((sg) => sg.igdbSearchTitle.length > 0);
}
