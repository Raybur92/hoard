import type { PlatformCode } from '@hoard/types';

export interface SyncedGame {
  igdbSearchTitle: string;
  steamAppId?: number;
  // Xbox's OpenXBL per-title identifier (Xbox sub-unit #4.2). Captured
  // by syncXboxLibrary; persisted into Game.xboxTitleId by syncRunner
  // so the playtime side-pass (POST /v2/player/stats) can bind each
  // returned MinutesPlayed value back to the correct Game.
  xboxTitleId?: number;
  platformCode: PlatformCode;
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
  // Engagement signal for platforms (Xbox via OpenXBL) that don't expose
  // per-title minutes but DO expose a "last played" timestamp. When true,
  // syncRunner treats the entry as engagement-positive (→ OnHold on
  // first import / CM13 auto-promote on Wishlist→library) even if
  // playtimeMinutes === 0. Steam + PSN don't set this — they have real
  // minutes via playtimeMinutes.
  hasBeenPlayed?: boolean;
}

export interface SteamCredentials {
  steamId: string;
}

/**
 * One row per Steam wishlist item. `priority` is the user's drag-rank in
 * Steam (lower = more wanted; 0 = top of list). `addedAt` is when they
 * added it to the wishlist.
 */
export interface SteamWishlistItem {
  appid: number;
  priority: number;
  addedAt: Date;
}

export async function syncSteamLibrary(credentials: SteamCredentials): Promise<SyncedGame[]> {
  const apiKey = process.env['STEAM_API_KEY'];
  if (!apiKey) throw new Error('STEAM_API_KEY not configured');

  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${apiKey}&steamid=${credentials.steamId}&include_appinfo=true&include_played_free_games=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API error: ${res.status}`);

  const data = await res.json() as {
    response: {
      games?: {
        appid: number;
        name: string;
        playtime_forever: number;
        rtime_last_played: number;
      }[];
    };
  };

  const games = data.response.games ?? [];
  return games.map((g) => ({
    igdbSearchTitle: g.name,
    steamAppId: g.appid,
    platformCode: 'ST' as PlatformCode,
    playtimeMinutes: g.playtime_forever,
    lastPlayedAt: g.rtime_last_played > 0 ? new Date(g.rtime_last_played * 1000) : null,
  }));
}

/**
 * Fetch the user's Steam wishlist via the public `IWishlistService/GetWishlist`
 * endpoint. Same public-profile caveat as `GetPlayerAchievements` (T-D7) —
 * if the user's Steam wishlist visibility is private, the response is
 * empty and we silently return `[]`. The PlatformDetail scope-tab note
 * about public-profile-required (T5) covers both achievements + wishlist.
 *
 * Returns `[]` (never throws) on any error / non-2xx / private profile so
 * the calling sync flow can move on. Errors are logged for diagnostics.
 */
export async function getSteamWishlist(steamId: string): Promise<SteamWishlistItem[]> {
  const apiKey = process.env['STEAM_API_KEY'];
  if (!apiKey) throw new Error('STEAM_API_KEY not configured');

  const url =
    `https://api.steampowered.com/IWishlistService/GetWishlist/v1/` +
    `?key=${apiKey}&steamid=${steamId}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: { response?: { items?: { appid: number; priority?: number; date_added?: number }[] } };
  try {
    data = await res.json() as { response?: { items?: { appid: number; priority?: number; date_added?: number }[] } };
  } catch {
    return [];
  }

  const items = data.response?.items ?? [];
  return items.map((it) => ({
    appid: it.appid,
    priority: it.priority ?? 0,
    addedAt: it.date_added ? new Date(it.date_added * 1000) : new Date(),
  }));
}
