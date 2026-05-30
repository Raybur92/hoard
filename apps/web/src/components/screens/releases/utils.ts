// Shared helpers for the Releases page primitives (R2 of RELEASES_PLAN.md).
// Local to this directory by design — keeps the rework's surface contained
// while it iterates. If something here proves generally useful (e.g. a future
// platform-name-to-code lookup), promote to apps/web/src/lib/utils.ts.

import type { IgdbUpcomingRelease } from '@hoard/types';

/**
 * IGDB platform name (e.g. "PlayStation 5") → Hoard's 2-letter code ("PS").
 * Same logic still inlined in DashboardDesktop / DashboardMobile (the
 * Releases page copies are gone after R5). Promote to `apps/web/src/lib/utils.ts`
 * when the Dashboard copies are folded into a shared helper.
 */
export function toPlatCode(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('steam')) return 'ST';
  if (n.includes('ps') || n.includes('playstation')) return 'PS';
  if (n.includes('xbox')) return 'XB';
  if (n.includes('gog')) return 'GG';
  if (n.includes('nintendo')) return 'NT';
  if (n.includes('epic')) return 'EP';
  return n.slice(0, 2).toUpperCase();
}

/**
 * IGDB `hypes` field is an unbounded count of users who clicked "interested"
 * (~0–500+, sometimes higher for tentpole releases). The HypeBars primitive
 * renders a 5-segment gauge. Map raw hype counts to the 1–5 scale via
 * roughly-perceptual buckets — these break points come from eyeballing the
 * distribution across IGDB's upcoming feed:
 *
 *   0           → 0 bars (nothing to indicate)
 *   1 – 10      → 1 bar
 *   11 – 25     → 2 bars
 *   26 – 60     → 3 bars
 *   61 – 150    → 4 bars
 *   151+        → 5 bars
 *
 * The thresholds are deliberately wider at the top — the difference between
 * 200-hype and 500-hype isn't meaningful to the user, both feel "very high."
 */
export function hypeToBars(hype: number | null | undefined): number {
  if (!hype || hype <= 0) return 0;
  if (hype <= 10) return 1;
  if (hype <= 25) return 2;
  if (hype <= 60) return 3;
  if (hype <= 150) return 4;
  return 5;
}

/**
 * Given a release, return the date-column trio used by ReleaseCard:
 *   - month abbreviation ("MAY", or "TBA" for dateless)
 *   - day-of-month string ("17", or "—" for dateless)
 *   - day-of-week ("THU", or "—" for dateless)
 *
 * `release.releaseDate` is an ISO string OR null. Callers typically combine
 * this with `daysUntil` from lib/utils.ts to compute the T-N countdown.
 */
export function releaseDateColumn(release: IgdbUpcomingRelease): { month: string; day: string; dow: string } {
  if (!release.releaseDate) return { month: 'TBA', day: '—', dow: '—' };
  const d = new Date(release.releaseDate);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()).padStart(2, '0'),
    dow: d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

/**
 * Resolve the category label for the DLC / REMAKE pill on a card.
 * Returns null for ordinary main-game releases (no pill rendered).
 */
export function categoryLabel(category: number | null | undefined): 'DLC' | 'REMAKE' | null {
  if (category === 2) return 'DLC';
  if (category === 8) return 'REMAKE';
  return null;
}

/**
 * REL-PR1 — decide what platform list to render on a Releases card.
 *
 * Per PAGES_PLAN §5.4 + OQ-REL-3: when the user has wishlisted a release
 * on a STRICT SUBSET of the IGDB platforms array, surface that subset as
 * "wishlisted: PS5 · Switch" instead of the generic platform array. When
 * `wishlistedPlatforms` is empty (no per-platform wishlist binding) OR
 * equals/exceeds the full IGDB platform set, fall back to the generic
 * rendering.
 *
 * Returned shape:
 *   - `mode: 'generic'`  → render `platforms` as-is (today's behaviour)
 *   - `mode: 'wishlist'` → render `platforms` (the wishlistedPlatforms
 *                          subset) with the `// wishlisted:` prefix
 *
 * The `platforms` array on the result is always the array to render —
 * callers don't need to inspect `mode` to know which array to map over;
 * `mode` only changes the prefix label and visual treatment.
 *
 * Edge cases:
 *   - `wishlistedPlatforms = []`        → generic (today's behaviour)
 *   - `wishlistedPlatforms = ['PS5']`, `platforms = ['PS5']`             → generic (full set; no narrowing to surface)
 *   - `wishlistedPlatforms = ['PS5']`, `platforms = ['PS5','Switch']`    → wishlist (strict subset)
 *   - `wishlistedPlatforms` contains a platform not in `platforms` (data
 *     drift from CM12 — user wishlisted on a platform IGDB doesn't list):
 *     wishlist mode, render `wishlistedPlatforms` directly. OQ-REL-3 v1
 *     recommendation explicitly accepts this; the "wishlisted on platform
 *     you don't own" UX is a Library / GameDetail concern.
 */
export function pickWishlistedPlatformChips(release: IgdbUpcomingRelease): {
  mode: 'generic' | 'wishlist';
  platforms: string[];
} {
  const { platforms, wishlistedPlatforms } = release;
  if (!wishlistedPlatforms || wishlistedPlatforms.length === 0) {
    return { mode: 'generic', platforms };
  }
  // Compare against the full IGDB platform set. If wishlistedPlatforms
  // matches or exceeds it, there's nothing to narrow — fall back to
  // generic so the visual treatment stays consistent across cards.
  const igdbSet = new Set(platforms);
  const wishSet = new Set(wishlistedPlatforms);
  const isStrictSubset =
    wishlistedPlatforms.length < platforms.length
    && wishlistedPlatforms.every((p) => igdbSet.has(p));
  // Also surface the "wishlist mode" when wishlistedPlatforms contains
  // platforms NOT in the IGDB array (data drift) — the user's intent
  // (wishlisted on these) wins, even if IGDB doesn't list them.
  const hasDriftEntry = wishlistedPlatforms.some((p) => !igdbSet.has(p));
  // Equal sets fall through to generic — no narrowing happening.
  const setsEqual =
    wishSet.size === igdbSet.size && [...wishSet].every((p) => igdbSet.has(p));
  if (setsEqual) return { mode: 'generic', platforms };
  if (isStrictSubset || hasDriftEntry) return { mode: 'wishlist', platforms: wishlistedPlatforms };
  return { mode: 'generic', platforms };
}
