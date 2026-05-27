import type { GameStatus as PrismaGameStatus } from '@hoard/db';

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
 * P-series CM13-on-trophy-evidence rule.
 *
 * Sister of `promoteWishlistOnOwnership` (apps/api/src/lib/promoteWishlist.ts),
 * but uses trophy/achievement evidence as the engagement signal instead of
 * playtime minutes. Sony's `getUserTitles` (trophy API) surfaces new-release
 * engagement near-instantly, while `getUserPlayedGames` (playtime API)
 * lags by 24–72h. The playtime-driven CM13 path in syncRunner therefore
 * misses Wishlist promotions on freshly-launched games even when trophies
 * have already popped.
 *
 * This helper fires for the trophy/achievement aggregator paths:
 * - applyPsnTrophyAggregates (PSN trophies)
 * - triggerSteamAchievementsBackground (Steam achievements)
 *
 * Behaviour:
 * - existing status ≠ Wishlist → undefined (preserves the user's library state)
 * - earned ≤ 0 → undefined (no evidence — game is in the trophy list but
 *   user hasn't popped a trophy yet, which can happen for games tracked
 *   without play. Conservative: don't promote without an earned trophy.)
 * - earned > 0 + percent === 100 → 'Completed' (folds in T-D2 auto-complete
 *   so a Wishlist game the user already 100%'d doesn't transit via OnHold)
 * - earned > 0 + percent < 100 → 'OnHold' (standard CM13 promotion)
 *
 * Used in companion to applyAutoCompleteRule — callers prefer this result
 * when it fires (Wishlist case), fall back to applyAutoCompleteRule for
 * non-Wishlist statuses (Backlog/OnHold/Playing → Completed at 100%).
 */
export function promoteWishlistOnEngagement(
  currentStatus: PrismaGameStatus,
  earned: number,
  percent: number | null,
): PrismaGameStatus | null {
  if (currentStatus !== 'Wishlist') return null;
  if (earned <= 0) return null;
  return percent === 100 ? 'Completed' : 'OnHold';
}
