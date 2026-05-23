import { promoteWishlistOnOwnership } from './promoteWishlist';

describe('promoteWishlistOnOwnership (CM13 policy)', () => {
  describe('triggers — existing status is Wishlist', () => {
    it('returns OnHold when incoming playtime > 0', () => {
      expect(promoteWishlistOnOwnership('Wishlist', 1)).toBe('OnHold');
      expect(promoteWishlistOnOwnership('Wishlist', 60)).toBe('OnHold');
      expect(promoteWishlistOnOwnership('Wishlist', 999_999)).toBe('OnHold');
    });

    it('returns Backlog when incoming playtime === 0', () => {
      expect(promoteWishlistOnOwnership('Wishlist', 0)).toBe('Backlog');
    });
  });

  describe('preserves — existing status is anything else', () => {
    // Any other existing status returns undefined → "no status change".
    // The user's manual library decision survives untouched.
    it.each(['Backlog', 'OnHold', 'Playing', 'Completed', 'Dropped'] as const)(
      'returns undefined for existing status=%s regardless of playtime',
      (status) => {
        expect(promoteWishlistOnOwnership(status, 0)).toBeUndefined();
        expect(promoteWishlistOnOwnership(status, 500)).toBeUndefined();
      },
    );
  });

  describe('null / undefined existing status (create path)', () => {
    // Brand-new UserGame — caller picks initial status from input, not from
    // auto-promotion. Helper signals "not my concern" via undefined.
    it('returns undefined for null existing status', () => {
      expect(promoteWishlistOnOwnership(null, 0)).toBeUndefined();
      expect(promoteWishlistOnOwnership(null, 600)).toBeUndefined();
    });

    it('returns undefined for undefined existing status', () => {
      expect(promoteWishlistOnOwnership(undefined, 0)).toBeUndefined();
      expect(promoteWishlistOnOwnership(undefined, 600)).toBeUndefined();
    });
  });
});
