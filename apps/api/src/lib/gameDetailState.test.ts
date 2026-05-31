import { detectGameDetailState } from './gameDetailState';

describe('detectGameDetailState (GD-PR1)', () => {
  const NOW = new Date('2026-05-31T12:00:00Z');
  const PAST = new Date('2024-01-01T00:00:00Z');
  const FUTURE = new Date('2027-12-01T00:00:00Z');

  describe('no UserGame (anonymous / not in library)', () => {
    it('released → S1', () => {
      expect(detectGameDetailState(null, PAST, NOW)).toBe('S1');
    });
    it('upcoming (future release) → S2', () => {
      expect(detectGameDetailState(null, FUTURE, NOW)).toBe('S2');
    });
    it('no release date → S1 (treated as already-released catalog game)', () => {
      expect(detectGameDetailState(null, null, NOW)).toBe('S1');
    });
  });

  describe('UserGame exists, status=Wishlist', () => {
    it('future release → S2 (anticipation framing)', () => {
      expect(detectGameDetailState('Wishlist', FUTURE, NOW)).toBe('S2');
    });
    it('past release → S3 (library citizen per OQ-GD-12)', () => {
      expect(detectGameDetailState('Wishlist', PAST, NOW)).toBe('S3');
    });
    it('null release date → S3 (treat as already-out for library framing)', () => {
      expect(detectGameDetailState('Wishlist', null, NOW)).toBe('S3');
    });
  });

  describe('UserGame exists, status=Completed', () => {
    it('always → S4 regardless of release date', () => {
      expect(detectGameDetailState('Completed', PAST, NOW)).toBe('S4');
      expect(detectGameDetailState('Completed', FUTURE, NOW)).toBe('S4');
      expect(detectGameDetailState('Completed', null, NOW)).toBe('S4');
    });
  });

  describe('UserGame exists, status ∈ {Playing, Backlog, OnHold, Dropped}', () => {
    it('Playing → S3', () => {
      expect(detectGameDetailState('Playing', PAST, NOW)).toBe('S3');
    });
    it('Backlog → S3', () => {
      expect(detectGameDetailState('Backlog', PAST, NOW)).toBe('S3');
    });
    it('On Hold → S3', () => {
      expect(detectGameDetailState('On Hold', PAST, NOW)).toBe('S3');
    });
    it('Dropped → S3', () => {
      expect(detectGameDetailState('Dropped', PAST, NOW)).toBe('S3');
    });
    it('Playing + future release → S3 (preorder-played edge case stays S3)', () => {
      // Defensive — a game with a future IGDB date but the user has
      // playtime (e.g. early-access on Steam) is in-progress, not
      // upcoming. Status overrides the release-date hint.
      expect(detectGameDetailState('Playing', FUTURE, NOW)).toBe('S3');
    });
  });

  describe('boundary: releaseDate exactly === now', () => {
    it('no UserGame + releaseDate=now → S1 (already counts as released)', () => {
      expect(detectGameDetailState(null, NOW, NOW)).toBe('S1');
    });
    it('Wishlist + releaseDate=now → S3 (library citizen — released today)', () => {
      expect(detectGameDetailState('Wishlist', NOW, NOW)).toBe('S3');
    });
  });
});
