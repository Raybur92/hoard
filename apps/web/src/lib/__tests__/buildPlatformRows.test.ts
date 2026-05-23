import { describe, it, expect } from 'vitest';
import { buildPlatformRows } from '../utils';

describe('buildPlatformRows (CM12 GameDetail row builder)', () => {
  it('returns owned-only rows sorted by playtime desc when there are no wishlist platforms', () => {
    const rows = buildPlatformRows({ ST: 100, PS: 800, XB: 300 }, []);
    expect(rows).toEqual([
      { code: 'PS', kind: 'owned', minutes: 800 },
      { code: 'XB', kind: 'owned', minutes: 300 },
      { code: 'ST', kind: 'owned', minutes: 100 },
    ]);
  });

  it('appends wishlist-only rows alphabetically after owned rows', () => {
    const rows = buildPlatformRows({ PS: 500 }, ['XB', 'ST']);
    expect(rows).toEqual([
      { code: 'PS', kind: 'owned', minutes: 500 },
      { code: 'ST', kind: 'wishlisted' },
      { code: 'XB', kind: 'wishlisted' },
    ]);
  });

  it('drops a code from the wishlist list when it is also owned (ownership wins)', () => {
    // GTA on PS5 owned + on PC wishlisted; user accidentally added PS to wishlistedPlatforms
    // → wishlist intent is satisfied by ownership; dedupe in favor of owned.
    const rows = buildPlatformRows({ PS: 200 }, ['PS', 'ST']);
    expect(rows).toEqual([
      { code: 'PS', kind: 'owned', minutes: 200 },
      { code: 'ST', kind: 'wishlisted' },
    ]);
  });

  it('treats playtime: 0 as owned (a synced platform with no time is still owned)', () => {
    const rows = buildPlatformRows({ ST: 0, PS: 100 }, []);
    expect(rows).toEqual([
      { code: 'PS', kind: 'owned', minutes: 100 },
      { code: 'ST', kind: 'owned', minutes: 0 },
    ]);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(buildPlatformRows({}, [])).toEqual([]);
  });

  it('returns wishlist-only rows when nothing is owned (pure-wishlist UserGame)', () => {
    const rows = buildPlatformRows({}, ['PS', 'ST']);
    expect(rows).toEqual([
      { code: 'PS', kind: 'wishlisted' },
      { code: 'ST', kind: 'wishlisted' },
    ]);
  });
});
