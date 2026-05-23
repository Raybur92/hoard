// CM13 wishlist auto-promotion policy (docs/CONCEPTUAL_MODEL.md §3.4.2).
//
// When a UserGame that was previously status='Wishlist' acquires ownership
// evidence (sync detects playtime, manual-add applies an owned status,
// etc.), the wishlist's job is done — the user owns the game now. Flip
// the status to OnHold (when there's any playtime to suggest active
// engagement) or Backlog (when ownership is established but no playtime
// yet — e.g. a newly purchased game or a sync row with playtime=0).
//
// Any non-Wishlist existing status is preserved verbatim — the user's
// manual library state survives auto-promotion because the trigger
// doesn't fire. Returning `undefined` from this helper signals "no
// status change required"; callers spread it conditionally into the
// Prisma update payload:
//
//   const promoteToStatus = promoteWishlistOnOwnership(existing?.status, totalPlaytime);
//   await prisma.userGame.update({
//     where: { ... },
//     data: { ...(promoteToStatus ? { status: promoteToStatus } : {}), ... },
//   });
//
// Locked properties — change here, NOT inline at call sites:
// - Trigger condition is SPECIFICALLY `existing === 'Wishlist'`. Any
//   other existing status (Backlog / OnHold / Playing / Completed /
//   Dropped) preserves itself by returning undefined.
// - Companion `WishlistRelease` rows are NOT touched here — per Andrea
//   2026-05-22: "two separate logics." WishlistRelease lifecycle is
//   release-date driven, independent of ownership.
// - `null` / `undefined` existing status (e.g. brand-new UserGame on
//   the create path) returns undefined — callers handle initial status
//   selection themselves.
//
// Used by both syncRunner (when sync brings in playtime on a previously
// wishlisted game) and addManualGame (F1-PR5 manual-add of an owned
// status on a previously wishlisted game). Shared policy = no drift
// between the two ownership-detection paths.

import type { GameStatus as PrismaGameStatus } from '@hoard/db';

export function promoteWishlistOnOwnership(
  existingStatus: PrismaGameStatus | null | undefined,
  totalPlaytimeMinutes: number,
): 'OnHold' | 'Backlog' | undefined {
  if (existingStatus !== 'Wishlist') return undefined;
  return totalPlaytimeMinutes > 0 ? 'OnHold' : 'Backlog';
}
