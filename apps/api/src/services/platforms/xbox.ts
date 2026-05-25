// Xbox library sync via OpenXBL (https://xbl.io/) — third-party proxy
// to the official Xbox Live API. Free tier: 150 req/hour, well within
// Hoard's per-user sync cadence. The user pastes their API key via
// POST /api/platforms/xbox/connect; it gets persisted on
// Platform.credentials as `{ apiKey }`.
//
// API shape (per OpenXBL docs as of 2026-05-25):
//   GET https://xbl.io/api/v2/player/titleHistory
//   Header: X-Authorization: {apiKey}
//   Response: { titles: [{ titleId, name, displayImage, lastTimePlayed,
//                         achievement?: { ... } }] }
//
// OpenXBL does NOT surface per-title playtime minutes in titleHistory
// (or in any reliably-documented endpoint). To preserve the engagement
// signal without faking a minutes value, we set `hasBeenPlayed: true`
// on every row that has a non-null `lastTimePlayed`. syncRunner uses
// that signal to choose OnHold (engagement positive) vs Backlog (never
// touched), matching the Steam/PSN behaviour without claiming a minutes
// number Hoard doesn't actually have.
//
// Achievements / gamerscore: documented as available in the same
// response under `achievement.{currentAchievements,totalAchievements,
// currentGamerscore,totalGamerscore}`. Library sync (this PR) ignores
// those fields — a future side-pass will mirror the steamAchievements
// pattern and write them into the same UserGame.achievements* columns
// PSN trophies + Steam achievements already populate.
//
// Smoke test note (2026-05-25): implementation was not exercised against
// a real OpenXBL key during development — verify response shape +
// endpoint paths post-deploy. If `/player/titleHistory` requires xuid
// in the path instead of the "me" form, switch to the 2-step pattern
// (call /account first to discover xuid, then /{xuid}/title-history).

import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

export interface XboxCredentials {
  apiKey: string;
  // Optional cached xuid. Not populated today; reserved for a future
  // optimization where we discover the xuid once and cache it back into
  // Platform.credentials to skip the /account round-trip on subsequent
  // syncs.
  xuid?: string;
}

const OPENXBL_BASE = 'https://xbl.io/api/v2';

interface OpenXblTitle {
  titleId?: string;
  name?: string;
  displayImage?: string;
  lastTimePlayed?: string | null;
}

interface OpenXblTitleHistoryResponse {
  titles?: OpenXblTitle[];
}

export async function syncXboxLibrary(credentials: XboxCredentials): Promise<SyncedGame[]> {
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error('Xbox API key missing');

  let res: Response;
  try {
    res = await fetch(`${OPENXBL_BASE}/player/titleHistory`, {
      headers: {
        'X-Authorization': apiKey,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw new Error(`OpenXBL network error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (!res.ok) {
    throw new Error(`OpenXBL API error: ${res.status}`);
  }

  let data: OpenXblTitleHistoryResponse;
  try {
    data = await res.json() as OpenXblTitleHistoryResponse;
  } catch {
    throw new Error('OpenXBL API returned malformed JSON');
  }

  const titles = data.titles ?? [];
  return titles
    // Defensive: drop rows missing the title name — without it we can't
    // even attempt an IGDB match, and an empty-name SyncedGame would
    // spam logPlatform with "library: 0 imported, N skipped" noise.
    .filter((t): t is OpenXblTitle & { name: string } => typeof t.name === 'string' && t.name.length > 0)
    .map((t) => ({
      igdbSearchTitle: t.name,
      platformCode: 'XB' as PlatformCode,
      // OpenXBL doesn't surface per-title playtime minutes — see file
      // header comment. hasBeenPlayed carries the engagement signal.
      playtimeMinutes: 0,
      lastPlayedAt: t.lastTimePlayed ? new Date(t.lastTimePlayed) : null,
      hasBeenPlayed: !!t.lastTimePlayed,
    }));
}

export { SyncedGame };
