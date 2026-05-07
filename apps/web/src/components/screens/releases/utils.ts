// Shared helpers for the Releases page primitives (R2 of RELEASES_PLAN.md).
// Local to this directory by design — keeps the rework's surface contained
// while it iterates. If something here proves generally useful (e.g. a future
// platform-name-to-code lookup), promote to apps/web/src/lib/utils.ts.

import type { IgdbUpcomingRelease } from '@hoard/types';

/**
 * IGDB platform name (e.g. "PlayStation 5") → Hoard's 2-letter code ("PS").
 * Same logic as the inline duplicates in UpcomingMobile / DashboardDesktop /
 * DashboardMobile — those will fold into this when their containing screens
 * get reworked (R5 replaces UpcomingMobile; the Dashboard copies are a
 * separate cleanup). Kept local here to avoid a cross-screen refactor while
 * R2–R6 are still in flight.
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
