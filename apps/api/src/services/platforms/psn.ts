import {
  exchangeNpssoForCode,
  exchangeCodeForAccessToken,
  getUserPlayedGames,
  getUserTitles,
} from 'psn-api';
import type { PlatformCode } from '@hoard/types';
import type { SyncedGame } from './steam';

export interface PsnCredentials {
  npssoToken: string;
}

// Strip ® / ™ and trailing Sony platform suffixes before passing to IGDB search
function cleanPsnTitle(raw: string): string {
  return raw
    .replace(/([A-Za-z0-9])[®™]([A-Za-z0-9])/g, '$1 $2') // ® between words → space (e.g. FAR CRY®6)
    .replace(/[®™]/g, '')                                   // strip remaining ® ™
    .replace(/\s+[[(（]?PS[45][^\]）)]*[\]）)]*\s*$/i, '') // strip trailing PS4/PS5 annotations
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIso8601Duration(duration: string): number {
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] ?? '0', 10);
  const min = parseInt(m[2] ?? '0', 10);
  const sec = parseInt(m[3] ?? '0', 10);
  return h * 60 + min + Math.round(sec / 60);
}

export async function syncPsnLibrary(credentials: PsnCredentials): Promise<SyncedGame[]> {
  const accessCode = await exchangeNpssoForCode(credentials.npssoToken);
  const { accessToken } = await exchangeCodeForAccessToken(accessCode);
  const auth = { accessToken };

  const games: SyncedGame[] = [];
  const PAGE = 200;
  let offset = 0;

  while (true) {
    const res = await getUserPlayedGames(auth, 'me', {
      categories: 'ps4_game,ps5_native_game',
      limit: PAGE,
      offset,
    });

    for (const t of res.titles) {
      games.push({
        igdbSearchTitle: cleanPsnTitle(t.name),
        platformCode: 'PS' as PlatformCode,
        playtimeMinutes: t.playDuration ? parseIso8601Duration(t.playDuration) : 0,
        lastPlayedAt: t.lastPlayedDateTime ? new Date(t.lastPlayedDateTime) : null,
      });
    }

    if (!res.nextOffset || res.nextOffset <= offset || games.length >= res.totalItemCount) break;
    offset = res.nextOffset;
  }

  return games;
}

export function validateNpssoFormat(token: string): boolean {
  return /^[A-Za-z0-9]{64}$/.test(token);
}

/**
 * One row per game the authenticated PSN account has trophy progress on.
 * `getUserTitles` is keyed by `npCommunicationId`, which is *different*
 * from the `titleId` returned by the library sync — see T-D5 in
 * `docs/TROPHIES_PLAN.md` for the matching strategy.
 *
 * `cleanedTitle` is the same `cleanPsnTitle()` form used by the library
 * sync, so the title-fallback match in `applyPsnTrophyAggregates` can
 * compare apples-to-apples against `Game.title`.
 */
export interface PsnTrophyTitle {
  npCommunicationId: string;
  cleanedTitle: string;
  defined: { bronze: number; silver: number; gold: number; platinum: number };
  earned:  { bronze: number; silver: number; gold: number; platinum: number };
  /** PSN's own weighted progress (0–100). Used as a fallback only — we
   *  compute display percent from earned/total counts to keep the
   *  receipt-block math consistent. */
  progress: number;
  lastUpdatedAt: Date | null;
}

/**
 * T2 of the trophies workstream (`docs/TROPHIES_PLAN.md`).
 *
 * Pulls every trophy title for the authenticated user with one paginated
 * call to `getUserTitles`. Returns the cleaned + simplified shape we use
 * in `applyPsnTrophyAggregates`.
 *
 * Decision T-D4: this is inline with the PSN sync flow (one API call for
 * the whole library). Not background-queued like Steam (T3).
 */
export async function getPsnTrophyTitles(npssoToken: string): Promise<PsnTrophyTitle[]> {
  const accessCode = await exchangeNpssoForCode(npssoToken);
  const { accessToken } = await exchangeCodeForAccessToken(accessCode);
  const auth = { accessToken };

  const titles: PsnTrophyTitle[] = [];
  const PAGE = 800; // psn-api hard cap — see getUserTitles JSDoc
  let offset = 0;

  while (true) {
    const res = await getUserTitles(auth, 'me', { limit: PAGE, offset });
    for (const t of res.trophyTitles) {
      titles.push({
        npCommunicationId: t.npCommunicationId,
        cleanedTitle: cleanPsnTitle(t.trophyTitleName),
        defined: t.definedTrophies,
        earned: t.earnedTrophies,
        progress: t.progress,
        lastUpdatedAt: t.lastUpdatedDateTime ? new Date(t.lastUpdatedDateTime) : null,
      });
    }
    if (!res.nextOffset || res.nextOffset <= offset || titles.length >= res.totalItemCount) break;
    offset = res.nextOffset;
  }

  return titles;
}

export { SyncedGame };
export type { PlatformCode };
