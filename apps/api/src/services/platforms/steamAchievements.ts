import { prisma } from '@hoard/db';
import type { Prisma } from '@prisma/client';
import { applyAutoCompleteRule, promoteWishlistOnEngagement } from '../../lib/achievements';
import type { AchievementsByPlatform } from '@hoard/types';

/**
 * T3 of the trophies workstream (`docs/TROPHIES_PLAN.md`).
 *
 * Steam Web API exposes per-game achievement data via
 * `ISteamUserStats/GetPlayerAchievements`. Unlike PSN's `getUserTitles`
 * (one call for the whole library), Steam requires one call per game —
 * so this fetches each game on a throttled background queue rather than
 * blocking the sync API response. Same pattern as HLTB.
 *
 * The fetcher returns `null` on three "no data, skip silently" cases:
 *   - private profile (`success: false` with "Profile is not public")
 *   - game has no achievement support (`success: false` with "Requested
 *     app has no stats")
 *   - HTTP / network error
 *
 * UI policy (T-D7, updated for M0): the GameDetail receipt-block hides
 * the achievements line when `achievementsByPlatform.ST` is absent.
 * PlatformDetail's scope tab carries a Steam-only note pointing users at
 * "Settings → Privacy → Game details" so the silent failure mode is
 * discoverable. Both shipped in T5.
 */

interface SteamPlayerStatsAchievement {
  apiname: string;
  achieved: 0 | 1;
  unlocktime?: number;
}

interface SteamPlayerStatsResponse {
  playerstats?: {
    success?: boolean;
    error?: string;
    achievements?: SteamPlayerStatsAchievement[];
  };
}

export interface SteamAchievementAggregate {
  earned: number;
  total: number;
}

/**
 * Fetch achievement progress for one Steam game. Returns the raw counts —
 * the percent + auto-complete handling lives in the orchestrator below
 * (and in the shared `applyAutoCompleteRule` helper).
 */
export async function getSteamAchievementsForGame(
  steamId: string,
  appid: number,
): Promise<SteamAchievementAggregate | null> {
  const apiKey = process.env['STEAM_API_KEY'];
  if (!apiKey) throw new Error('STEAM_API_KEY not configured');

  const url =
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/` +
    `?key=${apiKey}&steamid=${steamId}&appid=${appid}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  // Steam returns 400 / 403 on private profile or unsupported game on some
  // appids, alongside the structured `success: false` response on others.
  // Treat any non-2xx as "no data" and move on — sync should never crash
  // on a single noisy app.
  if (!res.ok) return null;

  let data: SteamPlayerStatsResponse;
  try {
    data = await res.json() as SteamPlayerStatsResponse;
  } catch {
    return null;
  }

  const stats = data.playerstats;
  if (!stats || stats.success === false) return null;

  const achievements = stats.achievements ?? [];
  // Empty array = game has achievement support but Steam returned none
  // for this user. Treat as "no data" — don't write a 0/0 row that would
  // render "0/0 · NaN%" if anything ever does total/earned math without
  // a guard.
  if (achievements.length === 0) return null;

  const earned = achievements.reduce<number>((n, a) => n + (a.achieved === 1 ? 1 : 0), 0);
  const total = achievements.length;

  return { earned, total };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface TriggerSteamAchievementsResult {
  candidates: number;
  fetched: number;
  skipped: number;
  autoCompleted: number;
  errors: number;
}

/**
 * Background pass over every Steam-platformed UserGame for one user.
 *
 * - Fetches achievement aggregates per game (one Steam Web API call each).
 * - Throttled at ~3 req/s — Steam's per-key cap is 100k/day so this leaves
 *   plenty of headroom even at 1000 games per sync.
 * - Merges into `achievementsByPlatform.ST` (per M-D7), preserving any
 *   existing `.PS` entry from the PSN trophy aggregator. Applies the T-D2
 *   auto-complete rule and CM13 wishlist promotion via the shared helpers.
 * - Per-game failures don't kill the loop. We log and continue.
 *
 * Caller is expected to fire-and-forget this — `runSync` returns
 * immediately and the achievements trickle into the database over the
 * next few minutes. Same flow as HLTB.
 */
export async function triggerSteamAchievementsBackground(
  userId: string,
  steamId: string,
): Promise<TriggerSteamAchievementsResult> {
  const userGames = await prisma.userGame.findMany({
    where: { userId },
    include: { game: true },
  });

  // Filter to UserGames where:
  //   1. The Game has a steamAppId (sync-able + we can look it up).
  //   2. Either the user has Steam playtime on this row (sync surfaced the
  //      game already, achievements are this user's Steam progress), OR
  //      the row is a Wishlist (Steam wishlist import set steamAppId; we
  //      want achievements to drive CM13 promotion when Steam playtime
  //      lags behind achievement evidence — same gap as PSN trophies vs
  //      getUserPlayedGames). Achievements still wouldn't fire for a
  //      Wishlist on a different platform's game (no steamAppId → filtered
  //      out above).
  const candidates = userGames.filter((ug) => {
    if (ug.game.steamAppId === null) return false;
    const ptbp = (ug.playtimeByPlatform ?? {}) as Record<string, number>;
    return ptbp['ST'] !== undefined || ug.status === 'Wishlist';
  });

  let fetched = 0;
  let skipped = 0;
  let autoCompleted = 0;
  let errors = 0;

  for (const ug of candidates) {
    try {
      const ach = await getSteamAchievementsForGame(steamId, ug.game.steamAppId!);
      if (ach === null) {
        skipped++;
      } else {
        const percent = ach.total > 0 ? Math.round((ach.earned / ach.total) * 100) : 0;
        // M0: merge .ST into achievementsByPlatform, preserving any
        // existing .PS entry from the PSN trophy aggregator. Per M-D7
        // Steam achievements and PSN trophies are distinct sets.
        const existingAbp = (ug.achievementsByPlatform ?? {}) as AchievementsByPlatform;
        const newAbp: AchievementsByPlatform = {
          ...existingAbp,
          ST: {
            earned: ach.earned,
            total: ach.total,
            percent,
            updatedAt: new Date().toISOString(),
          },
        };
        // P-series + M-D8: Wishlist promotion via any-platform engagement
        // signal. Falls back to per-platform auto-complete (T-D2) for
        // non-Wishlist statuses — passes the Steam percent specifically
        // since this is the platform the current write is about.
        const newStatus =
          promoteWishlistOnEngagement(ug.status, newAbp) ??
          applyAutoCompleteRule(ug.status, percent);
        // P-FIX-2: writing achievement data is hard evidence the user
        // owns the game on Steam. Backfill `playtimeByPlatform.ST = 0`
        // when absent so the Library platform filter + cover tag work.
        // Preserves existing ST playtime if syncSteamLibrary wrote it.
        const existingPtbp = (ug.playtimeByPlatform ?? {}) as Record<string, number>;
        const ptbpWithSt = existingPtbp['ST'] === undefined
          ? { ...existingPtbp, ST: 0 }
          : null;
        await prisma.userGame.update({
          where: { id: ug.id },
          data: {
            achievementsByPlatform: newAbp as Prisma.InputJsonValue,
            ...(newStatus ? { status: newStatus } : {}),
            ...(ptbpWithSt ? { playtimeByPlatform: ptbpWithSt } : {}),
          },
        });
        fetched++;
        if (newStatus === 'Completed') autoCompleted++;
      }
    } catch (err) {
      errors++;
      console.error(`[steam achievements] ${ug.game.title}:`, err instanceof Error ? err.message : err);
    }
    // Throttle even on a skip — Steam treats failed-stats lookups as real
    // calls against the per-key cap.
    await delay(330);
  }

  return { candidates: candidates.length, fetched, skipped, autoCompleted, errors };
}
