/**
 * Read-only probe of Nintendo's Parental Controls "Moon" API.
 * §5 Q1 of docs/SYNC_EXPANSION_PLAN.md — verify the Moon endpoints
 * behave as kinnay's wiki documents before committing to M3.
 *
 * What this proves / disproves before we sink 1-2 weeks of work:
 *   - Auth chain works: session_token_code → session_token → access_token.
 *   - GET /moon/v1/devices returns at least one paired Switch.
 *   - monthly_summaries / daily_summaries return per-title playtime
 *     in the documented shape.
 *   - Whether responses include Nintendo store URLs (drives the
 *     IGDB URL-pattern resolution decision — if NO store URLs in
 *     the Moon response, M3 resolution drops to title-search +
 *     localization without the external_games shortcut).
 *
 * Usage:
 *
 *   npx tsx scripts/probe-nintendo-moon.ts
 *
 * The script:
 *   1. Generates a PKCE verifier + challenge.
 *   2. Prints the Nintendo auth URL + a QR code (scan from phone if
 *      you'd rather sign in there).
 *   3. Waits for you to paste the post-login redirect URL (starts
 *      with `npf54789befb391a838://`) — your browser will fail to
 *      load it but the URL stays visible in the address bar.
 *   4. Exchanges the code in memory; never persists anything to disk
 *      or git.
 *   5. Prints anonymized responses from every Moon endpoint we plan
 *      to call from M3's syncNintendoLibrary.
 *
 * Prereq: the Nintendo Account you sign in with must be the parent
 * of a Switch console with Parental Controls enabled. If the
 * /moon/v1/devices response is empty, that's the signal you need to
 * set up Parental Controls first (this is exactly the "skip-ahead vs
 * full setup" branching M3 will need to surface in the guided flow).
 *
 * Throwaway script — delete after M3 ships or keep around for future
 * diagnostics (same pattern as scripts/probe-igdb-external-games.ts).
 */
import { createInterface } from 'node:readline/promises';
import { randomBytes, createHash } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require('qrcode-terminal');

const PARENTAL_CONTROLS_CLIENT_ID = '54789befb391a838';
const REDIRECT_URI = `npf${PARENTAL_CONTROLS_CLIENT_ID}://auth`;

// Scope list — controllable via CLI for incremental bisection during
// the 2026-05-28 M3 probe spike. Nintendo rejects some scopes with
// "invalid request" at the auth step; we narrow which scopes are
// still grantable by trying named sets.
//
// Usage:
//   --minimal                           openid + user + the 2 summary scopes
//   --plus moonUser:administration,X    minimal + the listed scopes
//   (no flag)                           the full 13-scope set (the legacy default)
//
// Recommended bisection order if minimal works but auth rejects full:
//   1. --plus moonUser:administration   (most likely the unlock for /users/{naId})
//   2. --plus moonUser:administration,user.mii
//   3. --plus moonUser:administration,user.mii,moonParentalControlSetting
//   …each iteration adds one scope group; whichever round breaks auth
//   identifies the rejected scope.
const FULL_SCOPES = [
  'openid', 'user', 'user.mii',
  'moonUser:administration',
  'moonDevice:create',
  'moonOwnedSmartDevice:administration',
  'moonParentalControlSetting',
  'moonParentalControlSetting:update',
  'moonParentalControlSettingState',
  'moonPairingState',
  'moonSmartDevice:administration',
  'moonDailySummary',
  'moonMonthlySummary',
];
const MINIMAL_SCOPES = ['openid', 'user', 'moonDailySummary', 'moonMonthlySummary'];

function resolveScopes(): string[] {
  if (process.argv.includes('--minimal')) return MINIMAL_SCOPES;
  const plusIdx = process.argv.indexOf('--plus');
  if (plusIdx !== -1 && plusIdx + 1 < process.argv.length) {
    const extras = (process.argv[plusIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return [...MINIMAL_SCOPES, ...extras];
  }
  return FULL_SCOPES;
}

const SCOPES = resolveScopes().join(' ');

const ACCOUNTS_BASE = 'https://accounts.nintendo.com';
const MOON_BASE = 'https://api-lp1.pctl.srv.nintendo.net';

// Headers the Moon API requires. Nintendo gates the API on (OS,version)
// pairs via the X-Moon-* headers + User-Agent. Mirroring nxapi's
// current header set exactly — they use ANDROID 1.17.0 build 261,
// which Nintendo accepts. iOS pairs we tried (e.g. 2.3.0/320) get
// errorCode=update_required. Header keys use PascalCase to match
// nxapi (HTTP headers are case-insensitive per spec but some servers
// do strict matching — safer to match the known-good shape).
// Version + build mirrored from pynintendoparental's const.py — the
// actively-maintained Python library that powers Home Assistant's Switch
// Parental Controls integration. They bumped to v2.4.0 / build 660 on
// 2026-03-25 in response to Nintendo's quarterly version-floor bump
// (https://github.com/pantherale0/pynintendoparental/pull/104). nxapi's
// own remote config service was serving stale values (1.20.0/282) at
// the time of this probe.
//
// MAINTENANCE NOTE: Nintendo bumps this floor every ~2-3 months. Check
// pynintendoparental's const.py whenever Moon sync starts returning
// errorCode=update_required:
//   https://github.com/pantherale0/pynintendoparental/blob/main/pynintendoparental/const.py
const ZNMA_VERSION = '2.4.0';
const ZNMA_BUILD = '660';
const ANDROID_OS_VERSION = '34'; // Android 14 — pynintendoparental's current OS_VERSION
const MOON_HEADERS_BASE = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Moon-App-Id': 'com.nintendo.znma',
  'X-Moon-Os': 'ANDROID',
  'X-Moon-Os-Version': ANDROID_OS_VERSION,
  'X-Moon-Model': '',
  'X-Moon-TimeZone': 'Europe/Vienna',
  'X-Moon-Os-Language': 'en-GB',
  'X-Moon-App-Language': 'en-GB',
  'X-Moon-App-Display-Version': ZNMA_VERSION,
  'X-Moon-App-Internal-Version': ZNMA_BUILD,
  'User-Agent': `moon_ANDROID/${ZNMA_VERSION} (com.nintendo.znma; build:${ZNMA_BUILD}; ANDROID ${ANDROID_OS_VERSION})`,
} as const;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthUrl(challenge: string, state: string): string {
  // Note: `theme=login_form` was historically used by the Parental
  // Controls app to render a slimmer login UI. Dropped in this probe
  // variant because some sources suggest Nintendo no longer honors
  // unknown theme values and might be the trigger for "invalid request".
  const params = new URLSearchParams({
    state,
    redirect_uri: REDIRECT_URI,
    client_id: PARENTAL_CONTROLS_CLIENT_ID,
    scope: SCOPES,
    response_type: 'session_token_code',
    session_token_code_challenge: challenge,
    session_token_code_challenge_method: 'S256',
  });
  return `${ACCOUNTS_BASE}/connect/1.0.0/authorize?${params.toString()}`;
}

function extractSessionTokenCode(input: string): string | null {
  // Redirect URL fragment: npf54789...://auth#session_token_code=XXX&state=YYY
  // Or the user might paste just the code itself.
  // NOTE: the session_token_code is a JWT (header.payload.signature),
  // so the value includes `.` characters. Earlier regex stopped at the
  // first dot and truncated the JWT to just the header.
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fragMatch = trimmed.match(/[#?&]session_token_code=([A-Za-z0-9._-]+)/);
  if (fragMatch?.[1]) return fragMatch[1];
  // If they pasted just the code (JWT shape), return it as-is.
  if (/^[A-Za-z0-9._-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function exchangeSessionTokenCode(code: string, verifier: string): Promise<string> {
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
    throw new Error(`session_token exchange failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as { session_token?: string };
  if (!data.session_token) throw new Error(`session_token missing in response: ${text}`);
  return data.session_token;
}

async function exchangeAccessToken(sessionToken: string): Promise<{ accessToken: string; idToken: string; expiresIn: number }> {
  // nxapi uses Dalvik UA on this exchange (NOT the moon UA). Nintendo
  // appears to inspect the UA at this step and rejects requests that
  // look like they're for the wrong client/OS context.
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
    throw new Error(`access_token exchange failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as { access_token?: string; id_token?: string; expires_in?: number };
  if (!data.access_token || !data.id_token || typeof data.expires_in !== 'number') {
    throw new Error(`access_token response incomplete: ${text}`);
  }
  return { accessToken: data.access_token, idToken: data.id_token, expiresIn: data.expires_in };
}

// Nintendo Account user info — needed because Moon API URLs use the
// user's actual Nintendo Account ID, NOT the literal string "me".
// Without this step, /moon/v1/users/me returns update_required (which
// is Nintendo's confusing way of saying "no such path").
async function getNintendoAccountUser(accessToken: string): Promise<{ id: string; nickname?: string; country?: string }> {
  const res = await fetch('https://api.accounts.nintendo.com/2.0.0/users/me', {
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
    throw new Error(`getNintendoAccountUser failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as { id: string; nickname?: string; country?: string };
}

async function moonGet(path: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${MOON_BASE}${path}`, {
    headers: {
      ...MOON_HEADERS_BASE,
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Moon ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

function anonymize<T>(obj: T): T {
  // Recursively redact obvious token-shaped strings + IDs we don't
  // need to share. Keeps response SHAPES intact for inspection while
  // dropping the actual values.
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Bearer-token-ish or long opaque ids → truncate to first/last 4 chars
    if (obj.length > 24 && /^[A-Za-z0-9_.-]+$/.test(obj)) {
      return `${obj.slice(0, 4)}…${obj.slice(-4)}` as unknown as T;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => anonymize(v)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // Strong-hide for fields that are obviously sensitive
      if (['sessionToken', 'session_token', 'accessToken', 'access_token', 'idToken', 'id_token', 'refreshToken', 'refresh_token'].includes(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = anonymize(v);
      }
    }
    return out as T;
  }
  return obj;
}

function divider(label: string): void {
  const bar = '─'.repeat(Math.max(0, 70 - label.length - 2));
  console.log(`\n── ${label} ${bar}`);
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  divider('STEP 1 — open the auth URL');
  const state = b64url(randomBytes(16));
  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthUrl(challenge, state);
  const resolvedScopes = SCOPES.split(' ');
  console.log(`\nScope set (${resolvedScopes.length} scopes):`);
  for (const s of resolvedScopes) console.log(`  - ${s}`);
  console.log('\nSign in to the Nintendo Account that\'s paired with your Switch (as parent in Parental Controls).');
  console.log('\nAuth URL:\n');
  console.log(`  ${authUrl}\n`);
  console.log('Or scan this QR with your phone:\n');
  qrcode.generate(authUrl, { small: true });
  console.log('\nAfter sign-in your browser will fail to load a URL starting with `npf…://auth`.');
  console.log('That\'s expected — the redirect is meant to launch the Parental Controls app.');
  console.log('Copy the FULL failed URL from your browser address bar.');

  divider('STEP 2 — paste the redirect URL');
  const pasted = await rl.question('\nPaste here (or just the session_token_code value):\n> ');
  rl.close();

  const code = extractSessionTokenCode(pasted);
  if (!code) {
    console.error('\nCould not find session_token_code in the input. Expected format:');
    console.error(`  npf${PARENTAL_CONTROLS_CLIENT_ID}://auth#session_token_code=XXXX&state=YYYY`);
    process.exit(1);
  }
  console.log(`\nExtracted session_token_code: ${code.slice(0, 4)}…${code.slice(-4)} (${code.length} chars)`);

  divider('STEP 3 — exchange session_token_code → session_token');
  const sessionToken = await exchangeSessionTokenCode(code, verifier);
  console.log(`Got session_token (${sessionToken.length} chars). [REDACTED]`);

  divider('STEP 4 — exchange session_token → access_token');
  const { accessToken, expiresIn } = await exchangeAccessToken(sessionToken);
  console.log(`Got access_token (expires in ${expiresIn}s). [REDACTED]`);

  divider('STEP 5 — GET nintendo account /users/me (to find naId)');
  let naId: string;
  try {
    const naUser = await getNintendoAccountUser(accessToken);
    naId = naUser.id;
    console.log(JSON.stringify(anonymize(naUser), null, 2));
    console.log(`Nintendo Account ID: ${naId.slice(0, 4)}…${naId.slice(-4)}`);
  } catch (err) {
    console.error(`Nintendo Account /users/me failed: ${err instanceof Error ? err.message : err}`);
    return;
  }

  divider(`STEP 6 — GET /moon/v1/users/${naId.slice(0, 4)}… (moon user)`);
  try {
    const me = await moonGet(`/moon/v1/users/${encodeURIComponent(naId)}`, accessToken);
    console.log(JSON.stringify(anonymize(me), null, 2));
  } catch (err) {
    console.error(`moon /users/{naId} failed: ${err instanceof Error ? err.message : err}`);
  }

  divider(`STEP 7 — GET /moon/v1/users/${naId.slice(0, 4)}…/devices`);
  let deviceIds: string[] = [];
  let devicesCallSucceeded = false;
  try {
    const devicesResp = await moonGet(`/moon/v1/users/${encodeURIComponent(naId)}/devices`, accessToken);
    devicesCallSucceeded = true;
    console.log(JSON.stringify(anonymize(devicesResp), null, 2));
    if (devicesResp && typeof devicesResp === 'object' && 'items' in devicesResp) {
      const items = (devicesResp as { items?: Array<{ deviceId?: string; id?: string }> }).items ?? [];
      deviceIds = items.map((d) => d.deviceId ?? d.id ?? '').filter((id) => id.length > 0);
    }
  } catch (err) {
    console.error(`/devices failed: ${err instanceof Error ? err.message : err}`);
  }

  if (!devicesCallSucceeded) {
    divider('DEVICES CALL FAILED');
    console.log('The /devices endpoint itself failed. Common cause: outdated app-version');
    console.log('headers (errorCode=update_required) — bump x-moon-app-display-version +');
    console.log('x-moon-app-internal-version in MOON_HEADERS_BASE to match the current');
    console.log('Parental Controls app version. Other possible causes: account doesn\'t');
    console.log('have the right scopes; access_token wasn\'t exchanged correctly.');
    return;
  }

  if (deviceIds.length === 0) {
    divider('NO DEVICES PAIRED');
    console.log('The /devices endpoint succeeded but returned zero paired Switches.');
    console.log('Either Parental Controls isn\'t paired with any console yet, or the');
    console.log('account that signed in isn\'t the parent. M3 will need to detect this');
    console.log('and surface the setup walkthrough.');
    return;
  }

  const firstDevice = deviceIds[0]!;
  divider(`STEP 7 — GET /moon/v1/devices/${firstDevice.slice(0, 6)}…/monthly_summaries`);
  let monthlyMonth: string | null = null;
  try {
    const monthly = await moonGet(`/moon/v1/devices/${encodeURIComponent(firstDevice)}/monthly_summaries`, accessToken);
    console.log(JSON.stringify(anonymize(monthly), null, 2));
    // Capture the most recent month string for the daily-summary probe.
    if (monthly && typeof monthly === 'object' && 'items' in monthly) {
      const items = (monthly as { items?: Array<{ month?: string }> }).items ?? [];
      if (items.length > 0 && items[0]?.month) monthlyMonth = items[0].month;
    }
  } catch (err) {
    console.error(`/monthly_summaries failed: ${err instanceof Error ? err.message : err}`);
  }

  if (monthlyMonth) {
    divider(`STEP 8 — GET monthly_summaries/${monthlyMonth} (drill-down)`);
    try {
      const monthDetail = await moonGet(
        `/moon/v1/devices/${encodeURIComponent(firstDevice)}/monthly_summaries/${encodeURIComponent(monthlyMonth)}`,
        accessToken,
      );
      console.log(JSON.stringify(anonymize(monthDetail), null, 2));
    } catch (err) {
      console.error(`monthly_summaries/${monthlyMonth} failed: ${err instanceof Error ? err.message : err}`);
    }

    divider(`STEP 9 — GET monthly_summaries/${monthlyMonth}/daily_summaries`);
    try {
      const daily = await moonGet(
        `/moon/v1/devices/${encodeURIComponent(firstDevice)}/monthly_summaries/${encodeURIComponent(monthlyMonth)}/daily_summaries`,
        accessToken,
      );
      console.log(JSON.stringify(anonymize(daily), null, 2));
    } catch (err) {
      console.error(`daily_summaries failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  divider('DONE');
  console.log('\nKey questions for M3 design:');
  console.log('  Q1: Did the monthly_summaries include Nintendo store URLs per title?');
  console.log('  Q2: What identifies titles uniquely? (title_id hex? application_id?)');
  console.log('  Q3: Does the playtime field expose minutes or seconds?');
  console.log('  Q4: Is firstPlayedAt / lastPlayedAt populated per title?');
  console.log('\nNone of the responses above have been persisted. session_token + access_token');
  console.log('lived only in memory and are now gone with the process.');
}

main().catch((err) => {
  console.error('\nProbe failed:', err);
  process.exit(1);
});
