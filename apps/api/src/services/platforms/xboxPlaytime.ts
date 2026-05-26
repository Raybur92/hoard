// Xbox playtime side-pass via OpenXBL POST /v2/player/stats.
//
// Library sync (syncXboxLibrary) gets us titles + lastPlayed timestamps
// but no minutes. This service fills in the minutes per title via a
// single batched POST. Verified shape from the round-6 live diagnostic
// (2026-05-26):
//
//   POST https://xbl.io/api/v2/player/stats
//   Headers: X-Authorization: {apiKey}, Content-Type: application/json,
//            Accept: application/json, Accept-Language: en-US,en;q=0.9
//   Body: {
//     "xuids": ["<xuid>"],
//     "stats": [
//       {"name": "MinutesPlayed", "titleId": "<titleId-1>"},
//       {"name": "MinutesPlayed", "titleId": "<titleId-2>"},
//       ...
//     ]
//   }
//   Response: {
//     "content": {
//       "statlistscollection": [{
//         "arrangebyfield": "xuid",
//         "arrangebyfieldid": "<xuid>",
//         "stats": [{
//           "xuid": "<xuid>",
//           "scid": "<service-config-id>",
//           "titleid": "<titleId>",
//           "name": "MinutesPlayed",
//           "type": "Integer",
//           "value": "10219"          // ← integer-as-string, parse to int
//         }, ...]
//       }]
//     },
//     "code": 200
//   }
//
// Designed for one batched call per sync (covers all titles for the
// user in a single POST — stays well under the OpenXBL 150 req/hr free
// tier). Stats for titles that haven't defined the MinutesPlayed schema
// simply don't appear in the response — handled by absent-from-Map
// semantics so the caller can decide between "leave existing playtime
// alone" and "default to 0".

import { prisma } from '@hoard/db';
import type { XboxCredentials } from './xbox';

const OPENXBL_BASE = 'https://xbl.io/api/v2';

interface OpenXblStatEntry {
  xuid?: string;
  scid?: string;
  titleid?: string;
  name?: string;
  type?: string;
  value?: string;
}

interface OpenXblStatList {
  arrangebyfield?: string;
  arrangebyfieldid?: string;
  stats?: OpenXblStatEntry[];
}

interface OpenXblStatsContent {
  groups?: unknown[];
  statlistscollection?: OpenXblStatList[];
}

interface OpenXblStatsResponse {
  content?: OpenXblStatsContent | string;
  code?: number;
}

/**
 * Fetch MinutesPlayed for a batch of Xbox titleIds in one POST.
 *
 * @returns Map keyed by titleId (Int) → minutes (Int). Titles that
 * didn't return a MinutesPlayed stat are absent from the Map; the
 * caller decides whether absence means "no data" or "stat is 0."
 */
export async function getXboxPlaytimes(
  credentials: Pick<XboxCredentials, 'apiKey'>,
  xuid: string,
  titleIds: number[],
): Promise<Map<number, number>> {
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error('Xbox API key missing');
  if (!xuid) throw new Error('Xbox xuid missing');

  // Empty input → don't waste the request. Returns an empty Map so the
  // caller's loop is a no-op.
  if (titleIds.length === 0) return new Map();

  const body = {
    xuids: [xuid],
    stats: titleIds.map((id) => ({ name: 'MinutesPlayed', titleId: String(id) })),
  };

  let res: Response;
  try {
    res = await fetch(`${OPENXBL_BASE}/player/stats`, {
      method: 'POST',
      headers: {
        'X-Authorization': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Without this header Node/undici injects `Accept-Language: *`
        // which OpenXBL rejects at the app layer. Same fix as
        // syncXboxLibrary.
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`OpenXBL network error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  if (!res.ok) {
    throw new Error(`OpenXBL API error: ${res.status}`);
  }

  let data: OpenXblStatsResponse;
  try {
    data = await res.json() as OpenXblStatsResponse;
  } catch {
    throw new Error('OpenXBL API returned malformed JSON');
  }

  // App-level error envelope: {code: <non-200>, content: <string>}.
  if (typeof data.code === 'number' && data.code !== 200) {
    const contentStr = typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? '(none)');
    throw new Error(`OpenXBL app-level error code=${data.code} content=${contentStr}`);
  }

  // Success envelope: content is the object. Defensive guard against
  // unexpected string-typed content without a code field.
  const content = data.content;
  if (content === undefined || typeof content === 'string') {
    throw new Error('OpenXBL API: unexpected response shape (content missing or not an object)');
  }

  const out = new Map<number, number>();
  const statLists = content.statlistscollection ?? [];
  for (const list of statLists) {
    const stats = list.stats ?? [];
    for (const stat of stats) {
      if (stat.name !== 'MinutesPlayed' || stat.titleid === undefined || stat.value === undefined) {
        continue;
      }
      const titleIdNum = Number(stat.titleid);
      const valueNum = Number(stat.value);
      // Drop rows that don't parse cleanly — defensive against future
      // API drift returning weird types.
      if (!Number.isInteger(titleIdNum) || !Number.isInteger(valueNum) || titleIdNum <= 0 || valueNum < 0) {
        continue;
      }
      out.set(titleIdNum, valueNum);
    }
  }
  return out;
}

/**
 * Discover the user's xuid from their OpenXBL API key via GET /account.
 * Returns null on any failure — the caller treats that as "skip the
 * playtime side-pass," same way Steam achievements skip when an API
 * call fails.
 */
async function discoverXuid(apiKey: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${OPENXBL_BASE}/account`, {
      headers: {
        'X-Authorization': apiKey,
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: { content?: { profileUsers?: Array<{ id?: string }> } };
  try {
    data = await res.json() as typeof data;
  } catch {
    return null;
  }
  return data.content?.profileUsers?.[0]?.id ?? null;
}

export interface XboxPlaytimeResult {
  /** Number of UserGames updated with a real MinutesPlayed value. */
  updated: number;
  /** UserGames with an xboxTitleId that OpenXBL didn't return a stat for. */
  missing: number;
}

/**
 * Background pass: discovers xuid, fetches MinutesPlayed for every
 * UserGame in the user's library whose Game has an xboxTitleId, and
 * writes the minutes into playtimeByPlatform.XB.
 *
 * Fire-and-forget design (caller doesn't await it for the main sync
 * response). All failures degrade gracefully — the library sync's
 * "owned + 0h playtime" state is the natural fallback.
 *
 * Other platform keys in playtimeByPlatform (ST, PS) are preserved
 * via the spread — only the XB slot is touched.
 */
export async function applyXboxPlaytimeBackground(
  userId: string,
  credentials: Pick<XboxCredentials, 'apiKey'>,
): Promise<XboxPlaytimeResult> {
  const apiKey = credentials.apiKey;
  if (!apiKey) throw new Error('Xbox API key missing');

  const xuid = await discoverXuid(apiKey);
  if (!xuid) {
    throw new Error('Xbox playtime: could not discover xuid from /account');
  }

  // Pull every UserGame whose Game has an Xbox titleId. After
  // sub-unit #4.2's threading lands, this is the entire Xbox library
  // for the user.
  const userGames = await prisma.userGame.findMany({
    where: { userId, game: { xboxTitleId: { not: null } } },
    select: {
      id: true,
      playtimeByPlatform: true,
      game: { select: { xboxTitleId: true } },
    },
  });

  if (userGames.length === 0) {
    return { updated: 0, missing: 0 };
  }

  // titleId → UserGame lookup
  const byTitleId = new Map<number, typeof userGames[number]>();
  for (const ug of userGames) {
    if (ug.game.xboxTitleId !== null) {
      byTitleId.set(ug.game.xboxTitleId, ug);
    }
  }

  const playtimes = await getXboxPlaytimes(
    { apiKey },
    xuid,
    [...byTitleId.keys()],
  );

  let updated = 0;
  for (const [titleId, minutes] of playtimes.entries()) {
    const ug = byTitleId.get(titleId);
    if (!ug) continue;
    const existing = (ug.playtimeByPlatform ?? {}) as Record<string, number>;
    // Only touch the XB slot. Other platforms (a multi-platform game
    // owned on both Xbox AND Steam, for example) keep their playtimes.
    await prisma.userGame.update({
      where: { id: ug.id },
      data: { playtimeByPlatform: { ...existing, XB: minutes } },
    });
    updated += 1;
  }

  const missing = byTitleId.size - updated;
  return { updated, missing };
}
