import { applyAutoCompleteRule } from './achievements';

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
