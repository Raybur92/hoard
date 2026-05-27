import { applyAutoCompleteRule, promoteWishlistOnEngagement } from './achievements';

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

describe('promoteWishlistOnEngagement (P-series)', () => {
  it('returns null for any non-Wishlist status (preserves user library state)', () => {
    for (const s of ['Backlog', 'OnHold', 'Playing', 'Completed', 'Dropped'] as const) {
      expect(promoteWishlistOnEngagement(s, 5, 50)).toBeNull();
      expect(promoteWishlistOnEngagement(s, 52, 100)).toBeNull();
      expect(promoteWishlistOnEngagement(s, 0, 0)).toBeNull();
    }
  });

  it('returns null on Wishlist with zero earned (no engagement signal yet)', () => {
    expect(promoteWishlistOnEngagement('Wishlist', 0, 0)).toBeNull();
    expect(promoteWishlistOnEngagement('Wishlist', 0, null)).toBeNull();
    // Even if `total > 0`, if nothing is earned we conservatively don't
    // promote — the game might be in the trophy list because the user
    // pulled it down but hasn't actually launched it yet.
  });

  it('promotes Wishlist → OnHold on any earned trophy below 100%', () => {
    expect(promoteWishlistOnEngagement('Wishlist', 1, 5)).toBe('OnHold');
    expect(promoteWishlistOnEngagement('Wishlist', 16, 31)).toBe('OnHold'); // Andrea's Lego Batman case
    expect(promoteWishlistOnEngagement('Wishlist', 50, 99)).toBe('OnHold');
  });

  it('promotes Wishlist → Completed when percent === 100 (folds in T-D2)', () => {
    expect(promoteWishlistOnEngagement('Wishlist', 52, 100)).toBe('Completed');
  });
});
