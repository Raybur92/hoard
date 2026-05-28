import type { GameStatus as PrismaGameStatus } from '@hoard/db';
import type { AchievementsByPlatform } from '@hoard/types';

/**
 * T-D2 in docs/TROPHIES_PLAN.md.
 *
 * When trophy / achievement sync brings `percent === 100`, flip the user's
 * status to `Completed` if and only if the current status is one of:
 *
 *   - Backlog (default sync state)
 *   - OnHold  (in-progress label)
 *   - Playing (in-progress label)
 *
 * Preserve **Dropped** (explicit "I gave up"), **Wishlist** (explicit
 * "I haven't bought it"), and **Completed** (already done — no-op).
 *
 * Returns the new Prisma status when the rule fires, or `null` when no
 * change is needed. Caller decides how to apply the result (typically
 * `data: { ...(newStatus ? { status: newStatus } : {}) }` on a
 * `userGame.update`).
 *
 * Used by both the PSN trophy aggregator (T2) and the Steam achievement
 * aggregator (T3) — single source of truth for the auto-complete rule.
 */
export function applyAutoCompleteRule(
  currentStatus: PrismaGameStatus,
  percent: number | null,
): PrismaGameStatus | null {
  if (percent !== 100) return null;
  if (currentStatus === 'Backlog' || currentStatus === 'OnHold' || currentStatus === 'Playing') {
    return 'Completed';
  }
  return null;
}

/**
 * P-series CM13-on-trophy-evidence rule, generalised across platforms in M0
 * (docs/SYNC_EXPANSION_PLAN.md M-D7 + M-D8).
 *
 * Sister of `promoteWishlistOnOwnership` (apps/api/src/lib/promoteWishlist.ts),
 * but uses trophy/achievement evidence as the engagement signal instead of
 * playtime minutes. Sony's `getUserTitles` (trophy API) surfaces new-release
 * engagement near-instantly, while `getUserPlayedGames` (playtime API)
 * lags by 24–72h. The playtime-driven CM13 path in syncRunner therefore
 * misses Wishlist promotions on freshly-launched games even when trophies
 * have already popped.
 *
 * Reads ANY entry in `achievementsByPlatform`. No platform precedence —
 * engagement signal is engagement signal regardless of source. If a future
 * platform pipeline writes to `.XB` or `.NT`, the same rule fires for free.
 *
 * Called for the trophy/achievement aggregator paths:
 * - applyPsnTrophyAggregates (PSN trophies → `.PS` entry)
 * - triggerSteamAchievementsBackground (Steam achievements → `.ST` entry)
 *
 * Behaviour:
 * - existing status ≠ Wishlist → null (preserves the user's library state)
 * - empty map or all entries with earned ≤ 0 → null (no evidence)
 * - any entry with percent === 100 → 'Completed' (folds in T-D2 auto-complete
 *   so a Wishlist game the user already 100%'d doesn't transit via OnHold)
 * - else (any entry with earned > 0 but no 100%) → 'OnHold' (standard CM13)
 *
 * Used in companion to applyAutoCompleteRule — callers prefer this result
 * when it fires (Wishlist case), fall back to applyAutoCompleteRule for
 * non-Wishlist statuses (Backlog/OnHold/Playing → Completed at 100%).
 */
export function promoteWishlistOnEngagement(
  currentStatus: PrismaGameStatus,
  achievementsByPlatform: AchievementsByPlatform,
): PrismaGameStatus | null {
  if (currentStatus !== 'Wishlist') return null;
  const entries = Object.values(achievementsByPlatform).filter(
    (e): e is NonNullable<typeof e> => e !== undefined && e !== null,
  );
  if (entries.length === 0) return null;
  let anyEarned = false;
  for (const e of entries) {
    if (e.percent === 100 && e.earned > 0) return 'Completed';
    if (e.earned > 0) anyEarned = true;
  }
  return anyEarned ? 'OnHold' : null;
}
