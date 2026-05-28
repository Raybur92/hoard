// Nintendo Switch library sync via the Parental Controls "Moon" API.
// M3 of the sync-expansion workstream (docs/SYNC_EXPANSION_PLAN.md).
//
// Auth pattern (Nintendo Account OAuth + PKCE):
//   1. Generate PKCE verifier + challenge.
//   2. User opens authorize URL → signs in → Nintendo redirects to
//      `npf<client_id>://auth#session_token_code=...&state=...`.
//      The redirect uses Nintendo's custom URL scheme, which browsers
//      can't navigate to. User copies the failed URL from address bar.
//   3. Exchange session_token_code → session_token (long-lived, months).
//   4. On each sync: exchange session_token → access_token (15-min TTL).
//   5. Use access_token for Moon API calls.
//
// API versioning gate: Nintendo gates the Moon API on a server-side
// allowlist of (X-Moon-Os, version, build) tuples. The accepted values
// shift every ~2-3 months when Nintendo ships a new Parental Controls
// app update. We mirror pynintendoparental's constants (the actively-
// maintained Python lib that powers Home Assistant's Switch integration)
// — they bumped to v2.4.0 / build 660 on 2026-03-25 in response to
// Nintendo's most recent floor bump. When Hoard's sync starts returning
// errorCode=update_required, check pynintendoparental's const.py for
// their current values and bump these constants accordingly.
//
//   Source of truth:
//   https://github.com/pantherale0/pynintendoparental/blob/main/pynintendoparental/const.py
//
// We hand-roll all HTTP per M-D2 (no nxapi/pynintendoparental as runtime
// dependencies to avoid AGPL/license contagion). The patterns mirror
// pynintendoparental's API surface; we don't copy code.
//
// What we get from this API:
//   - Library (whitelistedApplicationList): app IDs + titles + icons
//   - Per-title playtime via monthly summaries (in MINUTES)
//   - First-played dates per app (from playing_days aggregates)
// What we DON'T get: achievements (Nintendo doesn't expose them).
//
// Required Nintendo account state: the signed-in account must be the
// PARENT of a Switch in Parental Controls. M3's guided flow walks the
// user through the parental-controls pairing prereq.

import { randomBytes, createHash } from 'node:crypto';
import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

/** Parental Controls public client ID. Same across all community tools
 *  (nxapi, pynintendoparental, MoonControl, etc.) — Nintendo has not
 *  rotated this since at least 2019. */
const PARENTAL_CONTROLS_CLIENT_ID = '54789befb391a838';

/** Hardcoded redirect URI — `npf<client_id>://auth`. Nintendo
 *  registered the Parental Controls app with this exact URI; we
 *  cannot change it (third-party redirects would be rejected). */
const REDIRECT_URI = `npf${PARENTAL_CONTROLS_CLIENT_ID}://auth`;

/** Minimal scope set — confirmed grantable + sufficient for Moon
 *  library/playtime reads per the 2026-05-28 probe spike. The full
 *  13-scope list nxapi uses has scopes Nintendo no longer grants on
 *  fresh authorizations; this 5-scope subset works. */
const ZNMA_SCOPES = [
  'openid',
  'user',
  'moonDailySummary',
  'moonMonthlySummary',
  'moonUser:administration',
].join(' ');

/** Moon API version constants mirrored from pynintendoparental.
 *  Update both when Nintendo bumps the floor (errorCode=update_required). */
const ZNMA_VERSION = '2.4.0';
const ZNMA_BUILD = '660';
const ANDROID_OS_VERSION = '34';
const DEVICE_MODEL = 'Pixel 4 XL';
const USER_AGENT = `moon_ANDROID/${ZNMA_VERSION} (com.nintendo.znma; build:${ZNMA_BUILD}; ANDROID ${ANDROID_OS_VERSION})`;

const ACCOUNTS_BASE = 'https://accounts.nintendo.com';
/** Nintendo Account API (NOT the Moon API) — used for user-info lookups. */
const NA_API_BASE = 'https://api.accounts.nintendo.com';
/** Moon v2 API base — pynintendoparental's endpoint. The older
 *  api-lp1.pctl.srv.nintendo.net domain appears to be deprecated for
 *  newly-paired accounts as of 2026. */
const MOON_BASE = 'https://app.lp1.znma.srv.nintendo.net';

function moonHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Moon-App-Id': 'com.nintendo.znma',
    'X-Moon-Os': 'ANDROID',
    'X-Moon-Os-Version': ANDROID_OS_VERSION,
    'X-Moon-Model': DEVICE_MODEL,
    'X-Moon-TimeZone': 'Europe/London',
    'X-Moon-Os-Language': 'en-GB',
    'X-Moon-App-Language': 'en-GB',
    'X-Moon-App-Display-Version': ZNMA_VERSION,
    'X-Moon-App-Internal-Version': ZNMA_BUILD,
    'User-Agent': USER_AGENT,
  };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a PKCE verifier + challenge pair. Verifier is 32 bytes
 *  of randomness URL-safe base64-encoded; challenge is its SHA-256
 *  hash, same encoding. */
export function generateNintendoPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/** Build the Nintendo Account auth URL. The frontend opens this in a
 *  new tab/window; user signs in; Nintendo redirects to
 *  `npf...://auth#session_token_code=...&state=...`. */
export function getNintendoAuthUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    state,
    redirect_uri: REDIRECT_URI,
    client_id: PARENTAL_CONTROLS_CLIENT_ID,
    scope: ZNMA_SCOPES,
    response_type: 'session_token_code',
    session_token_code_challenge: challenge,
    session_token_code_challenge_method: 'S256',
  });
  return `${ACCOUNTS_BASE}/connect/1.0.0/authorize?${params.toString()}`;
}

/** Extract session_token_code from the pasted redirect URL. The code
 *  is a JWT with dots, so the value regex must include `.` — the
 *  initial M3 probe truncation bug came from a too-strict character
 *  class here. */
export function extractSessionTokenCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fragMatch = trimmed.match(/[#?&]session_token_code=([A-Za-z0-9._-]+)/);
  if (fragMatch?.[1]) return fragMatch[1];
  // Bare-paste mode — user pasted just the code value.
  if (/^[A-Za-z0-9._-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export interface NintendoCredentials {
  /** Long-lived (months) refresh-token equivalent. Persisted on
   *  Platform.credentials.sessionToken. */
  sessionToken: string;
  /** Short-lived (~15 min) bearer token used for Moon calls. */
  accessToken: string;
  /** Nintendo Account ID (16-char hex). Derived once at connect time
   *  from the Nintendo Account /users/me response; doesn't change. */
  naId: string;
  /** ISO 8601 timestamp when accessToken expires. */
  expiresAt: string;
}

/** Exchange the one-shot `session_token_code` (from the post-login
 *  redirect URL) for a long-lived `session_token`. Called once per
 *  connect — the session_token then drives all future access_token
 *  refreshes. */
export async function exchangeNintendoSessionTokenCode(
  code: string,
  verifier: string,
): Promise<string> {
  const res = await fetch(`${ACCOUNTS_BASE}/connect/1.0.0/api/session_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: PARENTAL_CONTROLS_CLIENT_ID,
      session_token_code: code,
      session_token_code_verifier: verifier,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nintendo session_token exchange failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as { session_token?: string };
  if (!data.session_token) {
    throw new Error('Nintendo session_token missing in response');
  }
  return data.session_token;
}

/** Exchange a long-lived session_token for a short-lived access_token.
 *  Uses the Dalvik (Android-shaped) User-Agent — Nintendo inspects the
 *  UA at this endpoint and rejects requests that look like they're for
 *  the wrong client. */
export async function exchangeNintendoAccessToken(sessionToken: string): Promise<{ accessToken: string; idToken: string; expiresIn: number }> {
  const res = await fetch(`${ACCOUNTS_BASE}/connect/1.0.0/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 8.0.0)',
    },
    body: JSON.stringify({
      client_id: PARENTAL_CONTROLS_CLIENT_ID,
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nintendo access_token exchange failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as { access_token?: string; id_token?: string; expires_in?: number };
  if (!data.access_token || !data.id_token || typeof data.expires_in !== 'number') {
    throw new Error('Nintendo access_token response incomplete');
  }
  return { accessToken: data.access_token, idToken: data.id_token, expiresIn: data.expires_in };
}

/** Compute ISO 8601 expiry timestamp with a 60-second safety margin. */
export function computeExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
}

/** Identity-equality refresh (GOG pattern). Returns same object when
 *  the access token is still valid, NEW object when refreshed —
 *  caller checks `fresh === creds` to decide whether to persist. */
export async function ensureFreshNintendoCredentials(creds: NintendoCredentials): Promise<NintendoCredentials> {
  if (Date.now() < new Date(creds.expiresAt).getTime()) return creds;
  const fresh = await exchangeNintendoAccessToken(creds.sessionToken);
  return {
    sessionToken: creds.sessionToken,
    accessToken: fresh.accessToken,
    naId: creds.naId,
    expiresAt: computeExpiresAt(fresh.expiresIn),
  };
}

/** Fetch the user's Nintendo Account profile (NOT the Moon /users
 *  endpoint — different host, different User-Agent). We use this once
 *  at connect time to discover the user's Nintendo Account ID (naId)
 *  and nickname, then persist naId on Platform.credentials so we don't
 *  re-fetch on every sync. */
export async function getNintendoAccountUser(accessToken: string): Promise<{ id: string; nickname?: string; country?: string }> {
  const res = await fetch(`${NA_API_BASE}/2.0.0/users/me`, {
    headers: {
      'Accept-Language': 'en-GB',
      'User-Agent': 'NASDKAPI; Android',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nintendo Account /users/me failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as { id: string; nickname?: string; country?: string };
}

/** Fetch the user's Nintendo Account nickname. Fail-silent per M-D13
 *  — decorative metadata that must never block connect or sync. */
export async function getNintendoUsername(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const user = await getNintendoAccountUser(accessToken);
    return user.nickname && user.nickname.length > 0 ? user.nickname : null;
  } catch {
    return null;
  }
}

interface MoonDeviceItem {
  deviceId?: string;
  device?: {
    id?: string;
    timeZone?: string;
    region?: string;
    serialNumber?: string;
    platformGeneration?: string; // P00 = Switch 1, P01 = Switch 2
    firmwareVersion?: { displayedVersion?: string; internalVersion?: number };
    activated?: boolean;
  };
  nintendoAccountId?: string;
  label?: string;
}

interface MoonDevicesResponse {
  count?: number;
  items?: MoonDeviceItem[];
}

/** List the paired Switch consoles for the authenticated account. */
export async function getNintendoDevices(accessToken: string): Promise<MoonDeviceItem[]> {
  const res = await fetch(`${MOON_BASE}/v2/actions/user/fetchOwnedDevices`, {
    headers: moonHeaders(accessToken),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nintendo Moon /fetchOwnedDevices failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as MoonDevicesResponse;
  return data.items ?? [];
}

interface MoonPlayedGame {
  meta?: {
    applicationId?: string;
    title?: string;
    imageUri?: string;
    shopUri?: string;
  };
  playingTime?: number;
  firstPlayDate?: string;
  lastPlayDate?: string;
  playingDays?: number;
}

interface MoonPlayerSummary {
  playerId?: string;
  playedGames?: MoonPlayedGame[];
  playingTime?: number;
}

interface MoonMonthlySummary {
  month?: string;
  playingTime?: number;
  players?: MoonPlayerSummary[];
  playedApps?: MoonPlayedGame[];
}

/** Get the latest monthly summary for a device. Contains per-app
 *  playtime + last-played dates over the current calendar month.
 *  Returns null when the device has no playtime data yet (newly paired
 *  consoles take 24h+ to generate the first daily summary). */
export async function getNintendoLatestMonthlySummary(
  accessToken: string,
  deviceId: string,
): Promise<MoonMonthlySummary | null> {
  const res = await fetch(
    `${MOON_BASE}/v2/actions/playSummary/fetchLatestMonthlySummary?deviceId=${encodeURIComponent(deviceId)}`,
    { headers: moonHeaders(accessToken) },
  );
  const text = await res.text();
  if (res.status === 404) return null; // No summary yet
  if (!res.ok) {
    throw new Error(`Nintendo Moon /fetchLatestMonthlySummary failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as MoonMonthlySummary;
}

/** Extract the "library" of titles the user has on their console.
 *  Aggregated from per-player playedGames + playedApps. Returns one
 *  SyncedGame per unique applicationId.
 *
 *  Per-title playtime is the sum across all players (a parent + child
 *  who both played the same game on the same console show up as a
 *  single SyncedGame with combined playtime).
 *
 *  lastPlayedAt is derived from lastPlayDate when present, falling
 *  back to the monthly summary period. */
function aggregateNintendoTitles(summary: MoonMonthlySummary): Map<string, SyncedGame & { itemTitle?: string; itemShopUri?: string }> {
  const byAppId = new Map<string, SyncedGame & { itemTitle?: string; itemShopUri?: string }>();

  // Collect from per-player playedGames first (richer detail per player).
  for (const playerSummary of summary.players ?? []) {
    for (const game of playerSummary.playedGames ?? []) {
      const appId = game.meta?.applicationId;
      if (!appId) continue;
      const title = game.meta?.title ?? '';
      if (!title) continue;
      const existing = byAppId.get(appId);
      const minutes = (game.playingTime ?? 0);
      const lastPlayed = game.lastPlayDate ? new Date(game.lastPlayDate) : null;
      if (existing) {
        // Sum playtime across players, take max lastPlayedAt.
        existing.playtimeMinutes = (existing.playtimeMinutes ?? 0) + minutes;
        if (lastPlayed && (!existing.lastPlayedAt || lastPlayed > existing.lastPlayedAt)) {
          existing.lastPlayedAt = lastPlayed;
        }
      } else {
        byAppId.set(appId, {
          igdbSearchTitle: title,
          nintendoTitleId: appId,
          platformCode: 'NT' as PlatformCode,
          playtimeMinutes: minutes,
          lastPlayedAt: lastPlayed,
          itemTitle: title,
          ...(game.meta?.shopUri ? { itemShopUri: game.meta.shopUri } : {}),
        });
      }
    }
  }

  // Also collect from playedApps (when the response uses the flat form).
  for (const game of summary.playedApps ?? []) {
    const appId = game.meta?.applicationId;
    if (!appId) continue;
    const title = game.meta?.title ?? '';
    if (!title) continue;
    if (byAppId.has(appId)) continue; // Already collected from per-player view
    const minutes = (game.playingTime ?? 0);
    const lastPlayed = game.lastPlayDate ? new Date(game.lastPlayDate) : null;
    byAppId.set(appId, {
      igdbSearchTitle: title,
      nintendoTitleId: appId,
      platformCode: 'NT' as PlatformCode,
      playtimeMinutes: minutes,
      lastPlayedAt: lastPlayed,
      itemTitle: title,
      ...(game.meta?.shopUri ? { itemShopUri: game.meta.shopUri } : {}),
    });
  }

  return byAppId;
}

/** Sync the Nintendo library + playtime for all paired Switches.
 *
 *  Per the M3 probe, the response shape includes per-title playtime
 *  in minutes, last-played dates, and shop URIs. For newly-paired
 *  consoles (< 24h since pairing) the monthly summary may be null;
 *  we return an empty list in that case rather than throwing.
 *
 *  Throws on auth failures (401 → caller should refresh via
 *  ensureFreshNintendoCredentials and retry). */
export async function syncNintendoLibrary(creds: NintendoCredentials): Promise<SyncedGame[]> {
  if (!creds.accessToken) throw new Error('Nintendo access token missing');

  const devices = await getNintendoDevices(creds.accessToken);
  if (devices.length === 0) {
    // No devices paired — user needs to complete Parental Controls
    // setup before sync produces anything. M3's guided flow walks
    // this prereq; we silently return an empty list rather than
    // erroring (the activity log will show `library: 0 imported`).
    return [];
  }

  const aggregate = new Map<string, SyncedGame>();

  for (const deviceItem of devices) {
    const deviceId = deviceItem.deviceId ?? deviceItem.device?.id;
    if (!deviceId) continue;
    try {
      const summary = await getNintendoLatestMonthlySummary(creds.accessToken, deviceId);
      if (!summary) continue; // No playtime data yet for this device
      for (const [appId, sg] of aggregateNintendoTitles(summary)) {
        const existing = aggregate.get(appId);
        if (existing) {
          // Multi-device user — same game on Switch 1 + Switch 2.
          // Combine playtime; take max lastPlayedAt.
          existing.playtimeMinutes = (existing.playtimeMinutes ?? 0) + (sg.playtimeMinutes ?? 0);
          if (sg.lastPlayedAt && (!existing.lastPlayedAt || sg.lastPlayedAt > existing.lastPlayedAt)) {
            existing.lastPlayedAt = sg.lastPlayedAt;
          }
        } else {
          aggregate.set(appId, sg);
        }
      }
    } catch (err) {
      // Per-device failures don't fail the whole sync. Logged at the
      // route layer via the activity-log diagnostic block.
      console.error(`[nintendo] device ${deviceId} sync failed:`, err instanceof Error ? err.message : err);
    }
  }

  return Array.from(aggregate.values());
}
