import { applyAutoCompleteRule, promoteWishlistOnEngagement } from './achievements';
import type { AchievementsByPlatform } from '@hoard/types';

// Helpers for terser test bodies.
const ent = (earned: number, total: number, percent: number) => ({
  earned,
  total,
  percent,
  updatedAt: '2026-05-27T00:00:00.000Z',
});

describe('applyAutoCompleteRule (T-D2)', () => {
  describe('returns null when percent !== 100', () => {
    it.each([null, 0, 50, 99])('percent %p → no change', (p) => {
      expect(applyAutoCompleteRule('Backlog', p)).toBeNull();
      expect(applyAutoCompleteRule('Playing', p)).toBeNull();
      expect(applyAutoCompleteRule('OnHold', p)).toBeNull();
      expect(applyAutoCompleteRule('Completed', p)).toBeNull();
      expect(applyAutoCompleteRule('Dropped', p)).toBeNull();
      expect(applyAutoCompleteRule('Wishlist', p)).toBeNull();
    });
  });

  describe('at percent === 100', () => {
    it('flips Backlog → Completed', () => {
      expect(applyAutoCompleteRule('Backlog', 100)).toBe('Completed');
    });

    it('flips OnHold → Completed', () => {
      expect(applyAutoCompleteRule('OnHold', 100)).toBe('Completed');
    });

    it('flips Playing → Completed', () => {
      expect(applyAutoCompleteRule('Playing', 100)).toBe('Completed');
    });

    it('preserves Completed (no-op — already there)', () => {
      expect(applyAutoCompleteRule('Completed', 100)).toBeNull();
    });

    it('preserves Dropped (explicit user decision)', () => {
      expect(applyAutoCompleteRule('Dropped', 100)).toBeNull();
    });

    it('preserves Wishlist (explicit user decision)', () => {
      expect(applyAutoCompleteRule('Wishlist', 100)).toBeNull();
    });
  });
});

describe('promoteWishlistOnEngagement (P-series, M0 per-platform shape)', () => {
  it('returns null for any non-Wishlist status (preserves user library state)', () => {
    const abp: AchievementsByPlatform = { PS: ent(5, 10, 50) };
    for (const s of ['Backlog', 'OnHold', 'Playing', 'Completed', 'Dropped'] as const) {
      expect(promoteWishlistOnEngagement(s, abp)).toBeNull();
    }
  });

  it('returns null on Wishlist with empty map (no entries fetched yet)', () => {
    expect(promoteWishlistOnEngagement('Wishlist', {})).toBeNull();
  });

  it('returns null on Wishlist when all entries have earned === 0', () => {
    const abp: AchievementsByPlatform = { PS: ent(0, 50, 0), ST: ent(0, 30, 0) };
    expect(promoteWishlistOnEngagement('Wishlist', abp)).toBeNull();
    // Even if `total > 0`, if nothing is earned we conservatively don't
    // promote — the game might be in the trophy list because the user
    // pulled it down but hasn't actually launched it yet.
  });

  it('promotes Wishlist → OnHold when any single platform has earned > 0 below 100%', () => {
    expect(promoteWishlistOnEngagement('Wishlist', { PS: ent(1, 50, 2) })).toBe('OnHold');
    expect(promoteWishlistOnEngagement('Wishlist', { PS: ent(16, 52, 31) })).toBe('OnHold'); // Andrea's Lego Batman
    expect(promoteWishlistOnEngagement('Wishlist', { ST: ent(50, 51, 98) })).toBe('OnHold');
  });

  it('promotes Wishlist → OnHold when one platform has earned and another is empty', () => {
    expect(
      promoteWishlistOnEngagement('Wishlist', { PS: ent(0, 50, 0), ST: ent(5, 30, 17) }),
    ).toBe('OnHold');
  });

  it('promotes Wishlist → Completed when any platform hits percent === 100', () => {
    expect(promoteWishlistOnEngagement('Wishlist', { PS: ent(50, 50, 100) })).toBe('Completed');
    expect(promoteWishlistOnEngagement('Wishlist', { ST: ent(44, 44, 100) })).toBe('Completed');
  });

  it('Completed beats OnHold when one platform is 100% and another is partial', () => {
    // Multi-platform: Steam 100%, PSN partial → Completed (the strongest
    // signal wins per M-D8). Any platform at 100% means the user beat the
    // game; the other platform being partial doesn't downgrade them.
    const abp: AchievementsByPlatform = { ST: ent(44, 44, 100), PS: ent(10, 50, 20) };
    expect(promoteWishlistOnEngagement('Wishlist', abp)).toBe('Completed');
  });
});
