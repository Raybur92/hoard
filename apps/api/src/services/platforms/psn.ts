import {
  exchangeNpssoForCode,
  exchangeCodeForAccessToken,
  getUserPlayedGames,
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

export { SyncedGame };
export type { PlatformCode };
