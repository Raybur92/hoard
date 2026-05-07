// Bucketing logic for the Releases page time-strip and zoom levels.
// Implements decision D4 in docs/RELEASES_PLAN.md §1.
//
// Months zoom:  6 buckets — current month + next 5. No wrap-around.
// Quarters zoom: 4 buckets — 3 dated (current + next 2) + TBA (catch-all).
//
// Past-release rule: any release with a confirmed releaseDate < today is
// invisible everywhere on the Releases page (excluding /releases/recent,
// which has its own 14-day window). Applied here in `bucketRelease()` so
// callers don't have to remember.

import type { IgdbUpcomingRelease } from '@hoard/types';
import type { TimeBucket } from './TimeNav';

/* ────────────────────────────────────────────────────────────────────────
 * Visible buckets — driven by today's date
 * ──────────────────────────────────────────────────────────────────────── */

export interface MonthBucket {
  /** Stable key, e.g. 'MAY 2026'. Used as URL state and in bucket lookups. */
  key: string;
  /** Display label, e.g. 'MAY'. */
  label: string;
  /** Year string for the meta slot, e.g. '2026'. */
  meta: string;
  /** UNIX ms — first millisecond of this month. */
  startMs: number;
  /** UNIX ms — first millisecond of the *next* month. Half-open interval [startMs, endMs). */
  endMs: number;
}

export interface QuarterBucket {
  /** Stable key, e.g. 'Q3 2026' or 'TBA'. */
  key: string;
  label: string;
  meta: string;
  /** Calendar year of the quarter, or null for TBA. */
  year: number | null;
  /** 1-4 quarter index, or null for TBA. */
  quarter: 1 | 2 | 3 | 4 | null;
}

const MONTH_LABELS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'] as const;

/** 6 visible month buckets starting at the month containing `today`. */
export function visibleMonths(today: Date = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const baseYear = today.getFullYear();
  const baseMonth = today.getMonth(); // 0-indexed

  for (let i = 0; i < 6; i++) {
    const m = baseMonth + i;
    const year = baseYear + Math.floor(m / 12);
    const monthIdx = ((m % 12) + 12) % 12; // safe for negative-zero edge cases
    const label = MONTH_LABELS[monthIdx]!;
    const startMs = new Date(year, monthIdx, 1).getTime();
    const endMs = new Date(year, monthIdx + 1, 1).getTime();
    buckets.push({
      key: `${label} ${year}`,
      label,
      meta: String(year),
      startMs,
      endMs,
    });
  }
  return buckets;
}

/** 4 visible quarter buckets — current + next 2 dated, plus TBA catch-all. */
export function visibleQuarters(today: Date = new Date()): QuarterBucket[] {
  const baseYear = today.getFullYear();
  const baseQuarter = (Math.floor(today.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;

  const buckets: QuarterBucket[] = [];
  for (let i = 0; i < 3; i++) {
    const q = baseQuarter + i;
    const year = baseYear + Math.floor((q - 1) / 4);
    const qIdx = (((q - 1) % 4) + 4) % 4 + 1 as 1 | 2 | 3 | 4;
    buckets.push({
      key: `Q${qIdx} ${year}`,
      label: `Q${qIdx}`,
      meta: String(year),
      year,
      quarter: qIdx,
    });
  }
  buckets.push({ key: 'TBA', label: 'TBA', meta: '—', year: null, quarter: null });
  return buckets;
}

/** Default active bucket key given today's date and the active zoom. */
export function defaultBucketKey(zoom: 'months' | 'quarters', today: Date = new Date()): string {
  if (zoom === 'months') return visibleMonths(today)[0]!.key;
  return visibleQuarters(today)[0]!.key;
}

/* ────────────────────────────────────────────────────────────────────────
 * Per-release bucket assignment
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Returns the bucket key for a release at the given zoom, or `null` if the
 * release is past-dated (and therefore invisible on the Releases page per D4).
 *
 * Quarters zoom catch-all rule: anything that doesn't land on one of the 3
 * dated quarter buckets goes to TBA. This includes truly-dateless releases
 * (`releaseDateCategory === 'TBA'`), far-future quarters, and year-only
 * dates beyond the visible window. Per D4.
 */
export function bucketKeyFor(
  release: IgdbUpcomingRelease,
  zoom: 'months' | 'quarters',
  today: Date = new Date(),
): string | null {
  // Past-release rule (everywhere except /releases/recent).
  if (release.releaseDate) {
    const ms = new Date(release.releaseDate).getTime();
    if (ms < today.getTime() - 86_400_000) return null;
    // Clock leeway: treat anything within the past 24h as "today" for
    // bucketing purposes — avoids dropping a release that just dropped this
    // morning before today's month bucket would naturally absorb it.
  }

  if (zoom === 'months') {
    if (!release.releaseDate) return null; // dateless never lands in a dated month
    const ms = new Date(release.releaseDate).getTime();
    const months = visibleMonths(today);
    for (const b of months) {
      if (ms >= b.startMs && ms < b.endMs) return b.key;
    }
    return null; // beyond the visible 6-month window
  }

  // quarters
  const quarters = visibleQuarters(today);
  if (!release.releaseDate) return 'TBA';
  const d = new Date(release.releaseDate);
  const year = d.getFullYear();
  const qIdx = (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  for (const b of quarters) {
    if (b.year === year && b.quarter === qIdx) return b.key;
  }
  return 'TBA';
}

/**
 * Group releases into buckets at the given zoom and produce the TimeBucket[]
 * shape consumed by `<TimeNav>`. Past-dated releases are dropped (D4).
 *
 * Returned in the deterministic order of `visibleMonths` / `visibleQuarters`.
 */
export function buildBuckets(
  releases: IgdbUpcomingRelease[],
  zoom: 'months' | 'quarters',
  today: Date = new Date(),
): { buckets: TimeBucket[]; itemsByBucket: Record<string, IgdbUpcomingRelease[]> } {
  const visible = zoom === 'months' ? visibleMonths(today) : visibleQuarters(today);
  const itemsByBucket: Record<string, IgdbUpcomingRelease[]> = Object.fromEntries(
    visible.map((b) => [b.key, []]),
  );

  for (const r of releases) {
    const key = bucketKeyFor(r, zoom, today);
    if (key && itemsByBucket[key]) itemsByBucket[key].push(r);
  }

  // TBA bucket (in quarters zoom) sorts by hype desc per handoff §12 punch-list 8.
  if (zoom === 'quarters') {
    itemsByBucket['TBA']?.sort((a, b) => (b.hype ?? 0) - (a.hype ?? 0));
  }

  const buckets: TimeBucket[] = visible.map((b) => ({
    key: b.key,
    label: b.label,
    meta: b.meta,
    count: itemsByBucket[b.key]?.length ?? 0,
    isTBA: 'year' in b && b.year === null,
  }));

  return { buckets, itemsByBucket };
}

/**
 * Find the next non-empty bucket after `currentKey` in the bucket list.
 * Used by the empty-state "[skip ahead →]" CTA per handoff §11. Returns
 * `null` if there are no later non-empty buckets.
 */
export function nextNonEmptyBucket(
  buckets: TimeBucket[],
  currentKey: string,
): TimeBucket | null {
  const i = buckets.findIndex((b) => b.key === currentKey);
  if (i < 0) return null;
  for (let j = i + 1; j < buckets.length; j++) {
    if (buckets[j]!.count > 0) return buckets[j]!;
  }
  return null;
}

/**
 * The "context caption" shown alongside the Marker on quarters views per
 * handoff §12 punch-list 8.
 *   Q3 2026 → 'jul → sep'
 *   Q4 2026 → 'oct → dec'
 *   Q1 2027 → 'jan → mar'
 *   TBA     → 'sorted by hype'
 */
export function quarterCaption(bucketKey: string): string | null {
  if (bucketKey === 'TBA') return 'sorted by hype';
  const m = bucketKey.match(/^Q([1-4])\s/);
  if (!m) return null;
  const q = Number(m[1]);
  const start = (q - 1) * 3;
  const startLabel = MONTH_LABELS[start]!.toLowerCase();
  const endLabel = MONTH_LABELS[start + 2]!.toLowerCase();
  return `${startLabel} → ${endLabel}`;
}

/** Pick the next-starred-globally release for the wishlist hero (decision D5). */
export function nextStarredGlobally(wishlist: IgdbUpcomingRelease[]): IgdbUpcomingRelease | null {
  const todayMs = Date.now();
  const future = wishlist.filter((r) => {
    if (!r.releaseDate) return false;
    return new Date(r.releaseDate).getTime() >= todayMs - 86_400_000;
  });
  if (future.length === 0) return null;
  // Sort by ascending releaseDate
  future.sort((a, b) => new Date(a.releaseDate!).getTime() - new Date(b.releaseDate!).getTime());
  return future[0] ?? null;
}
