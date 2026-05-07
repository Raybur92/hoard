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
