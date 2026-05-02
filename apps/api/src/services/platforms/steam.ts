import type { PlatformCode } from '@hoard/types';

export interface SyncedGame {
  igdbSearchTitle: string;
  steamAppId?: number;
  platformCode: PlatformCode;
  playtimeMinutes: number;
  lastPlayedAt: Date | null;
}

export interface SteamCredentials {
  steamId: string;
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
