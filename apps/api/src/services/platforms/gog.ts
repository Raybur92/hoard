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

export async function syncGogLibrary(_credentials: GogCredentials): Promise<SyncedGame[]> {
  // Sub-unit #5.2 wires this up against
  //   GET https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=N
  // Auto-refreshes on 401 using refreshGogToken.
  return [] as SyncedGame[];
}

export { SyncedGame };
