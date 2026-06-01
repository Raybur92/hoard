/**
 * GD-PR3 — sub-status validity guard per OQ-GD-2 (docs/PAGES_PLAN.md §3.5).
 *
 * The DB stores `UserGame.subStatus` as a free-form String column; valid
 * variants are enumerated here and enforced at write-time so we never
 * end up with e.g. `status: Playing + subStatus: '100%'`.
 *
 * Locked variants per GD-PR3 plan:
 *   Playing   → 'infinite' | 'paused'
 *   Completed → 'main' | '+side' | '100%'   (UI ships in GD-PR4; column ready)
 *   Backlog / On Hold / Dropped / Wishlist → no variants (subStatus stays null)
 *
 * The "null" value is always valid — clearing a sub-status is allowed
 * from any status, including when transitioning between statuses (which
 * would otherwise carry a stale sub-status forward).
 */

import type { GameStatus } from '@hoard/types';

export const SUB_STATUS_VARIANTS: Record<GameStatus, readonly string[]> = {
  Playing:   ['infinite', 'paused'] as const,
  Completed: ['main', '+side', '100%'] as const,
  Backlog:   [] as const,
  'On Hold': [] as const,
  Dropped:   [] as const,
  Wishlist:  [] as const,
};

/**
 * Returns true when `subStatus` is a legal value for the given `status`.
 * `null` / `undefined` are always legal (means "no sub-status set").
 */
export function isValidSubStatus(status: GameStatus, subStatus: string | null | undefined): boolean {
  if (subStatus === null || subStatus === undefined) return true;
  const variants = SUB_STATUS_VARIANTS[status];
  return variants.includes(subStatus);
}
