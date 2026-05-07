import { prisma } from '@hoard/db';
import { applyAutoCompleteRule } from '../../lib/achievements';

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
 * UI policy (T-D7): the GameDetail receipt-block hides the achievements
 * line when `achievementsTotal === null`. PlatformDetail's scope tab
 * carries a Steam-only note pointing users at "Settings → Privacy →
 * Game details" so the silent failure mode is discoverable. Both shipped
 * in T5.
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
 * - Writes the four `achievements*` columns + applies the T-D2 auto-complete
 *   rule via the shared helper.
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
  //   2. The user has Steam playtime on this row (otherwise the game came
  //      from a different platform — the achievements aren't this user's
  //      Steam progress for it, even if the Game has a steamAppId).
  const candidates = userGames.filter((ug) => {
    if (ug.game.steamAppId === null) return false;
    const ptbp = (ug.playtimeByPlatform ?? {}) as Record<string, number>;
    return ptbp['ST'] !== undefined;
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
        const percent = ach.total > 0 ? Math.round((ach.earned / ach.total) * 100) : null;
        const newStatus = applyAutoCompleteRule(ug.status, percent);
        await prisma.userGame.update({
          where: { id: ug.id },
          data: {
            achievementsEarned: ach.earned,
            achievementsTotal: ach.total,
            achievementsPercent: percent,
            achievementsUpdatedAt: new Date(),
            ...(newStatus ? { status: newStatus } : {}),
          },
        });
        fetched++;
        if (newStatus) autoCompleted++;
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
