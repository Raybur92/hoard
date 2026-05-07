import { describe, it, expect } from 'vitest';
import type { IgdbUpcomingRelease } from '@hoard/types';
import {
  visibleMonths,
  visibleQuarters,
  defaultBucketKey,
  bucketKeyFor,
  buildBuckets,
  nextNonEmptyBucket,
  quarterCaption,
  nextStarredGlobally,
} from '../bucketing';

const TODAY = new Date('2026-05-15T12:00:00Z');

function makeRelease(overrides: Partial<IgdbUpcomingRelease> = {}): IgdbUpcomingRelease {
  return {
    igdbId: 1,
    title: 'Game',
    developer: null,
    releaseDate: '2026-05-20T00:00:00.000Z',
    releaseDateCategory: 'Q2',
    platforms: [],
    genres: [],
    coverUrl: null,
    synopsis: null,
    wishlisted: false,
    category: 0,
    hype: 50,
    ...overrides,
  };
}

describe('visibleMonths', () => {
  it('returns 6 buckets starting at the month containing today', () => {
    const months = visibleMonths(TODAY);
    expect(months).toHaveLength(6);
    expect(months[0]?.label).toBe('MAY');
    expect(months[0]?.meta).toBe('2026');
    expect(months[5]?.label).toBe('OCT');
    expect(months[5]?.meta).toBe('2026');
  });

  it('rolls into the next year correctly', () => {
    // Nov 2026: visible months are NOV 2026 → APR 2027
    const months = visibleMonths(new Date('2026-11-15T12:00:00Z'));
    expect(months[0]?.key).toBe('NOV 2026');
    expect(months[5]?.key).toBe('APR 2027');
  });

  it('produces half-open [startMs, endMs) intervals that cover each month exactly', () => {
    const may = visibleMonths(TODAY)[0]!;
    // May 2026 spans 31 days × 86400000 ms
    const span = may.endMs - may.startMs;
    expect(span).toBe(31 * 86400000);
  });
});

describe('visibleQuarters', () => {
  it('returns 3 dated quarters + TBA, starting from the current quarter', () => {
    const quarters = visibleQuarters(TODAY);
    expect(quarters).toHaveLength(4);
    // May 2026 → Q2; visible should be Q2 2026, Q3 2026, Q4 2026, TBA
    expect(quarters[0]).toMatchObject({ key: 'Q2 2026', label: 'Q2', year: 2026, quarter: 2 });
    expect(quarters[1]).toMatchObject({ key: 'Q3 2026', label: 'Q3', year: 2026, quarter: 3 });
    expect(quarters[2]).toMatchObject({ key: 'Q4 2026', label: 'Q4', year: 2026, quarter: 4 });
    expect(quarters[3]).toMatchObject({ key: 'TBA', label: 'TBA', year: null, quarter: null });
  });

  it('rolls Q4 → Q1 of next year', () => {
    // November 2026 is Q4 2026 → visible: Q4 2026, Q1 2027, Q2 2027, TBA
    const quarters = visibleQuarters(new Date('2026-11-15T12:00:00Z'));
    expect(quarters.map((q) => q.key)).toEqual(['Q4 2026', 'Q1 2027', 'Q2 2027', 'TBA']);
  });
});

describe('defaultBucketKey', () => {
  it('months default = current month', () => {
    expect(defaultBucketKey('months', TODAY)).toBe('MAY 2026');
  });
  it('quarters default = current quarter', () => {
    expect(defaultBucketKey('quarters', TODAY)).toBe('Q2 2026');
  });
});

describe('bucketKeyFor', () => {
  it('months: lands a release in its calendar month', () => {
    const r = makeRelease({ releaseDate: '2026-07-04T00:00:00.000Z' });
    expect(bucketKeyFor(r, 'months', TODAY)).toBe('JUL 2026');
  });

  it('months: returns null for a release outside the visible 6-month window', () => {
    // Beyond OCT 2026 — DEC 2026 is invisible in months zoom
    const r = makeRelease({ releaseDate: '2026-12-15T00:00:00.000Z' });
    expect(bucketKeyFor(r, 'months', TODAY)).toBeNull();
  });

  it('months: returns null for a dateless release (TBA never lands in a month)', () => {
    expect(bucketKeyFor(makeRelease({ releaseDate: null }), 'months', TODAY)).toBeNull();
  });

  it('months: returns null for past-dated releases (D4 invisible-past rule)', () => {
    // 7 days ago
    const past = new Date(TODAY.getTime() - 7 * 86400000).toISOString();
    expect(bucketKeyFor(makeRelease({ releaseDate: past }), 'months', TODAY)).toBeNull();
  });

  it('quarters: lands a release in its (year, quarter) bucket when visible', () => {
    const r = makeRelease({ releaseDate: '2026-08-12T00:00:00.000Z' });
    expect(bucketKeyFor(r, 'quarters', TODAY)).toBe('Q3 2026');
  });

  it('quarters: catch-all = TBA for far-future quarters', () => {
    const r = makeRelease({ releaseDate: '2027-08-01T00:00:00.000Z' });
    // Q3 2027 is beyond the visible window (Q2/Q3/Q4 2026)
    expect(bucketKeyFor(r, 'quarters', TODAY)).toBe('TBA');
  });

  it('quarters: catch-all = TBA for truly dateless releases', () => {
    expect(bucketKeyFor(makeRelease({ releaseDate: null }), 'quarters', TODAY)).toBe('TBA');
  });

  it('quarters: returns null for past-dated releases (invisible everywhere)', () => {
    const past = new Date(TODAY.getTime() - 30 * 86400000).toISOString();
    expect(bucketKeyFor(makeRelease({ releaseDate: past }), 'quarters', TODAY)).toBeNull();
  });
});

describe('buildBuckets', () => {
  it('groups releases under the right bucket and counts them', () => {
    const releases = [
      makeRelease({ igdbId: 1, releaseDate: '2026-05-20T00:00:00.000Z' }),
      makeRelease({ igdbId: 2, releaseDate: '2026-05-25T00:00:00.000Z' }),
      makeRelease({ igdbId: 3, releaseDate: '2026-07-01T00:00:00.000Z' }),
    ];
    const { buckets, itemsByBucket } = buildBuckets(releases, 'months', TODAY);
    const may = buckets.find((b) => b.key === 'MAY 2026')!;
    const jul = buckets.find((b) => b.key === 'JUL 2026')!;
    expect(may.count).toBe(2);
    expect(jul.count).toBe(1);
    expect(itemsByBucket['MAY 2026']).toHaveLength(2);
    expect(itemsByBucket['JUL 2026']?.[0]?.igdbId).toBe(3);
  });

  it('drops past-dated releases (D4)', () => {
    const past = new Date(TODAY.getTime() - 30 * 86400000).toISOString();
    const releases = [
      makeRelease({ igdbId: 1, releaseDate: past }),
      makeRelease({ igdbId: 2, releaseDate: '2026-07-01T00:00:00.000Z' }),
    ];
    const { buckets } = buildBuckets(releases, 'months', TODAY);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1); // only the future one survives
  });

  it('quarters TBA bucket sorts by hype descending', () => {
    const releases = [
      makeRelease({ igdbId: 1, releaseDate: null, hype: 5, title: 'low' }),
      makeRelease({ igdbId: 2, releaseDate: null, hype: 200, title: 'highest' }),
      makeRelease({ igdbId: 3, releaseDate: null, hype: 50, title: 'middle' }),
    ];
    const { itemsByBucket } = buildBuckets(releases, 'quarters', TODAY);
    const tba = itemsByBucket['TBA'] ?? [];
    expect(tba.map((r) => r.title)).toEqual(['highest', 'middle', 'low']);
  });

  it('marks the TBA bucket with isTBA=true and dated buckets with isTBA=false', () => {
    const { buckets } = buildBuckets([], 'quarters', TODAY);
    expect(buckets.find((b) => b.key === 'TBA')?.isTBA).toBe(true);
    expect(buckets.find((b) => b.key === 'Q2 2026')?.isTBA).toBe(false);
  });
});

describe('nextNonEmptyBucket', () => {
  it('returns the next bucket with count > 0 after the current key', () => {
    const buckets = [
      { key: 'A', label: 'A', count: 0 },
      { key: 'B', label: 'B', count: 0 },
      { key: 'C', label: 'C', count: 3 },
      { key: 'D', label: 'D', count: 0 },
    ];
    expect(nextNonEmptyBucket(buckets, 'A')?.key).toBe('C');
    expect(nextNonEmptyBucket(buckets, 'B')?.key).toBe('C');
    expect(nextNonEmptyBucket(buckets, 'C')).toBeNull(); // no later non-empty
  });

  it('returns null when there is no later non-empty bucket', () => {
    const buckets = [
      { key: 'A', label: 'A', count: 5 },
      { key: 'B', label: 'B', count: 0 },
    ];
    expect(nextNonEmptyBucket(buckets, 'A')).toBeNull();
  });
});

describe('quarterCaption', () => {
  it('TBA → "sorted by hype"', () => {
    expect(quarterCaption('TBA')).toBe('sorted by hype');
  });
  it('Q3 2026 → "jul → sep"', () => {
    expect(quarterCaption('Q3 2026')).toBe('jul → sep');
  });
  it('Q4 2026 → "oct → dec"', () => {
    expect(quarterCaption('Q4 2026')).toBe('oct → dec');
  });
  it('Q1 2027 → "jan → mar"', () => {
    expect(quarterCaption('Q1 2027')).toBe('jan → mar');
  });
  it('returns null for malformed keys', () => {
    expect(quarterCaption('garbage')).toBeNull();
  });
});

describe('nextStarredGlobally', () => {
  it('returns the closest future starred release', () => {
    const wishlist = [
      makeRelease({ igdbId: 1, releaseDate: '2026-08-01T00:00:00.000Z' }),
      makeRelease({ igdbId: 2, releaseDate: '2026-06-15T00:00:00.000Z' }),
      makeRelease({ igdbId: 3, releaseDate: '2026-12-01T00:00:00.000Z' }),
    ];
    const next = nextStarredGlobally(wishlist);
    expect(next?.igdbId).toBe(2);
  });

  it('skips past-dated releases', () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const wishlist = [
      makeRelease({ igdbId: 1, releaseDate: past }),
      makeRelease({ igdbId: 2, releaseDate: future }),
    ];
    expect(nextStarredGlobally(wishlist)?.igdbId).toBe(2);
  });

  it('returns null when no future starred exists (D5 hide-hero rule)', () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    const wishlist = [makeRelease({ igdbId: 1, releaseDate: past })];
    expect(nextStarredGlobally(wishlist)).toBeNull();
  });

  it('skips dateless releases', () => {
    const wishlist = [makeRelease({ igdbId: 1, releaseDate: null })];
    expect(nextStarredGlobally(wishlist)).toBeNull();
  });

  it('returns null for an empty wishlist', () => {
    expect(nextStarredGlobally([])).toBeNull();
  });
});
