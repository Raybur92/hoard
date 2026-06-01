import { isValidSubStatus, SUB_STATUS_VARIANTS } from './subStatus';

describe('isValidSubStatus (GD-PR3)', () => {
  it('null is always valid (clearing)', () => {
    expect(isValidSubStatus('Playing', null)).toBe(true);
    expect(isValidSubStatus('Completed', null)).toBe(true);
    expect(isValidSubStatus('Backlog', null)).toBe(true);
    expect(isValidSubStatus('Wishlist', null)).toBe(true);
  });

  it('undefined is always valid', () => {
    expect(isValidSubStatus('Playing', undefined)).toBe(true);
  });

  describe('Playing variants', () => {
    it('accepts infinite + paused', () => {
      expect(isValidSubStatus('Playing', 'infinite')).toBe(true);
      expect(isValidSubStatus('Playing', 'paused')).toBe(true);
    });
    it('rejects Completed variants', () => {
      expect(isValidSubStatus('Playing', 'main')).toBe(false);
      expect(isValidSubStatus('Playing', '+side')).toBe(false);
      expect(isValidSubStatus('Playing', '100%')).toBe(false);
    });
    it('rejects arbitrary strings', () => {
      expect(isValidSubStatus('Playing', 'foo')).toBe(false);
      expect(isValidSubStatus('Playing', '')).toBe(false);
    });
  });

  describe('Completed variants', () => {
    it('accepts main + +side + 100%', () => {
      expect(isValidSubStatus('Completed', 'main')).toBe(true);
      expect(isValidSubStatus('Completed', '+side')).toBe(true);
      expect(isValidSubStatus('Completed', '100%')).toBe(true);
    });
    it('rejects Playing variants', () => {
      expect(isValidSubStatus('Completed', 'infinite')).toBe(false);
      expect(isValidSubStatus('Completed', 'paused')).toBe(false);
    });
  });

  describe('statuses with no variants', () => {
    it('Backlog rejects any non-null value', () => {
      expect(isValidSubStatus('Backlog', 'anything')).toBe(false);
    });
    it('On Hold rejects any non-null value', () => {
      expect(isValidSubStatus('On Hold', 'paused')).toBe(false);
    });
    it('Dropped rejects any non-null value', () => {
      expect(isValidSubStatus('Dropped', 'anything')).toBe(false);
    });
    it('Wishlist rejects any non-null value', () => {
      expect(isValidSubStatus('Wishlist', 'anything')).toBe(false);
    });
  });

  it('SUB_STATUS_VARIANTS map covers all GameStatus values', () => {
    const statuses = Object.keys(SUB_STATUS_VARIANTS);
    expect(statuses).toEqual(expect.arrayContaining(['Playing', 'Completed', 'Backlog', 'On Hold', 'Dropped', 'Wishlist']));
  });
});
