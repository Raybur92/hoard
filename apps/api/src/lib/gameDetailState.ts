/**
 * GD-PR1 — GameDetail v2 state classification (docs/PAGES_PLAN.md §3.1).
 *
 * Computes which of the four GameDetail v2 states applies for a given
 * (UserGame status, release date) pair. The four states drive entirely
 * different page renders:
 *   - S1 released, not owned — `[+ add to library]` dominant + price offers
 *   - S2 upcoming, not owned — giant countdown + `[+ wishlist]` dominant
 *   - S3 owned, in-progress  — status picker + PROGRESS receipt + notes
 *   - S4 owned, completed    — archivist relic + rating + score
 *
 * Detection rules locked per OQ-GD-12:
 *   - No UserGame for this user × Game:
 *       releaseDate ≤ now or null → S1
 *       releaseDate > now           → S2
 *   - UserGame exists, status=Wishlist:
 *       releaseDate > now           → S2 (anticipation framing)
 *       releaseDate ≤ now or null → S3 (library-citizen — per-platform
 *                                       wishlist on an unowned platform of
 *                                       a released game still gets library
 *                                       treatments)
 *   - UserGame exists, status ∈ {Playing, Backlog, OnHold, Dropped} → S3
 *   - UserGame exists, status=Completed → S4
 *
 * The `now` arg is injectable so tests can pin time without monkey-patching
 * `Date.now`. Production callers pass `new Date()`.
 */

import type { GameDetailState } from '@hoard/types';

/**
 * Status string as it appears in the API surface. Mirrors `GameStatus`
 * from @hoard/types — kept local-aliased here to avoid the
 * @hoard/db enum (PrismaGameStatus uses 'OnHold' without the space).
 */
type ApiStatus = 'Playing' | 'Backlog' | 'Completed' | 'On Hold' | 'Dropped' | 'Wishlist';

export function detectGameDetailState(
  userGameStatus: ApiStatus | null,
  releaseDate: Date | null,
  now: Date,
): GameDetailState {
  const isFutureRelease = releaseDate !== null && releaseDate.getTime() > now.getTime();

  if (userGameStatus === null) {
    return isFutureRelease ? 'S2' : 'S1';
  }

  if (userGameStatus === 'Completed') return 'S4';

  if (userGameStatus === 'Wishlist') {
    return isFutureRelease ? 'S2' : 'S3';
  }

  // Playing / Backlog / On Hold / Dropped — always S3.
  return 'S3';
}
