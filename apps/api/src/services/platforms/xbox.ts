// Xbox library sync via OpenXBL (https://xbl.io/) — third-party proxy
// to the official Xbox Live API. Free tier: 150 req/hour, well within
// Hoard's per-user sync cadence. The user pastes their API key via
// POST /api/platforms/xbox/connect; it gets persisted on
// Platform.credentials as `{ apiKey }`.
//
// API shape (verified via live diagnostic 2026-05-26):
//   GET https://xbl.io/api/v2/player/titleHistory
//   Headers: X-Authorization: {apiKey}, Accept-Language: en-US,en;q=0.9
//   Success response: { content: { xuid: string, titles: [{
//     titleId, name, type ("Game" / "App"), displayImage,
//     titleHistory: { lastTimePlayed, visible, canHide },
//     achievement: { currentAchievements, totalAchievements,
//                    currentGamerscore, totalGamerscore, ... },
//     ...
//   }] } }
//   Error response:   { content: "<string>", code: <non-200> }
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
// Smoke-tested against Andrea's real OpenXBL key 2026-05-26:
//   round 1 — sync.debug captured {code: 400, content: "...invalid
//             locale value: *"} → fixed by setting Accept-Language.
//   round 2 — Accept-Language landed, sync went from 1s → 3s confirming
//             the real network call now succeeds. But syncedGames came
//             back empty because my assumed flat shape was wrong.
//   round 3 — diagnostic surfaced the actual wrapped shape:
//             {content: {xuid, titles: [{name, type, titleHistory:
//             {lastTimePlayed}, ...}]}}. Parser updated to match.

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
  // `type` is "Game" for actual games and other values like "App" for
  // non-game things in title history (rare but real — defensive filter).
  type?: string;
  displayImage?: string;
  // Per the live response (2026-05-26): lastTimePlayed is nested under
  // titleHistory, NOT at the title root. The earlier guess was wrong;
  // ground truth from the OpenXBL diagnostic confirmed the shape.
  titleHistory?: {
    lastTimePlayed?: string | null;
    visible?: boolean;
    canHide?: boolean;
  };
}

interface OpenXblTitleHistoryContent {
  xuid?: string;
  titles?: OpenXblTitle[];
}

interface OpenXblTitleHistoryResponse {
  // OpenXBL wraps all responses in `content`:
  //   - Success envelope: content is an object ({xuid, titles}).
  //   - Error envelope:   content is a string description + code is set.
  // The `code` check below handles the error case; success path digs
  // into content.titles.
  content?: OpenXblTitleHistoryContent | string;
  code?: number;
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
        // Node/undici injects `Accept-Language: *` by default, which
        // OpenXBL rejects at the application layer (returns HTTP 200
        // with body `{code: 400, content: "...invalid locale value: *"}`).
        // Explicit valid value overrides the default. Verified via the
        // diagnostic capture 2026-05-25.
        'Accept-Language': 'en-US,en;q=0.9',
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

  // OpenXBL surfaces app-level errors as HTTP 200 with body
  // {code: <non-200>, content: <string>}. Treat as an explicit failure
  // so the orchestrator logs `sync.error` instead of silently mapping
  // to zero titles.
  if (typeof data.code === 'number' && data.code !== 200) {
    const contentStr = typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? '(none)');
    throw new Error(`OpenXBL app-level error code=${data.code} content=${contentStr}`);
  }

  // Success envelope: content is the wrapping object with titles. If
  // OpenXBL ever returns a string content WITHOUT a code field, treat
  // it as malformed (rather than crash) — caller's outer try/catch
  // logs sync.error.
  const content = data.content;
  if (content === undefined || typeof content === 'string') {
    throw new Error('OpenXBL API: unexpected response shape (content missing or not an object)');
  }

  const titles = content.titles ?? [];
  return titles
    // Defensive: drop rows missing `name` (can't IGDB-match without it),
    // AND drop non-Game `type` values (Xbox title history occasionally
    // includes apps — Netflix, browser, etc. — that would IGDB-fail
    // and just inflate the skipped count).
    .filter((t): t is OpenXblTitle & { name: string } =>
      typeof t.name === 'string' && t.name.length > 0 && (t.type === undefined || t.type === 'Game'),
    )
    .map((t) => {
      // lastTimePlayed lives under titleHistory in the OpenXBL response.
      const lastTimePlayed = t.titleHistory?.lastTimePlayed ?? null;
      return {
        igdbSearchTitle: t.name,
        platformCode: 'XB' as PlatformCode,
        // OpenXBL doesn't surface per-title playtime minutes — see file
        // header comment. hasBeenPlayed carries the engagement signal.
        playtimeMinutes: 0,
        lastPlayedAt: lastTimePlayed ? new Date(lastTimePlayed) : null,
        hasBeenPlayed: !!lastTimePlayed,
      };
    });
}

export { SyncedGame };
