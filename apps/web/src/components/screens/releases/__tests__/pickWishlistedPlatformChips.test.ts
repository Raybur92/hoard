/**
 * REL-PR1 — `pickWishlistedPlatformChips` decides when a Releases card
 * surfaces the user's per-platform wishlist subset vs. the generic IGDB
 * platform array. PAGES_PLAN §5.4 + OQ-REL-3.
 *
 * The function is small but the truth-table matters: any change to which
 * row paths return `'wishlist'` vs `'generic'` would change the visible
 * card content silently. These tests pin the contract row-by-row.
 */

import { describe, it, expect } from 'vitest';
import type { IgdbUpcomingRelease } from '@hoard/types';
import { pickWishlistedPlatformChips } from '../utils';

function release(overrides: Partial<IgdbUpcomingRelease> = {}): IgdbUpcomingRelease {
  return {
    igdbId: 1,
    title: 'Test',
    developer: null,
    releaseDate: null,
    releaseDateCategory: 'Q1',
    platforms: ['PlayStation 5', 'Nintendo Switch'],
    genres: [],
    coverUrl: null,
    synopsis: null,
    wishlisted: false,
    category: 0,
    hype: null,
    userGameId: null,
    wishlistedPlatforms: [],
    themes: [],
    playerPerspectives: [],
    ...overrides,
  };
}

describe('pickWishlistedPlatformChips', () => {
  it('returns generic mode when wishlistedPlatforms is empty (default for non-wishlist scopes)', () => {
    const r = release({ platforms: ['PlayStation 5', 'Nintendo Switch'], wishlistedPlatforms: [] });
    const out = pickWishlistedPlatformChips(r);
    expect(out.mode).toBe('generic');
    expect(out.platforms).toEqual(['PlayStation 5', 'Nintendo Switch']);
  });

  it('returns generic mode when wishlistedPlatforms matches the full IGDB platforms set', () => {
    // User wishlisted on every release platform — no narrowing to surface;
    // the generic platform list is the more informative rendering.
    const r = release({
      platforms: ['PlayStation 5', 'Nintendo Switch'],
      wishlistedPlatforms: ['PlayStation 5', 'Nintendo Switch'],
    });
    const out = pickWishlistedPlatformChips(r);
    expect(out.mode).toBe('generic');
    expect(out.platforms).toEqual(['PlayStation 5', 'Nintendo Switch']);
  });

  it('returns wishlist mode (and the subset) when wishlistedPlatforms is a strict subset of IGDB platforms', () => {
    // Spec's canonical case: release on PS5+Switch+Xbox, user wishlisted PS5+Switch.
    // Card surfaces `// wishlisted: PS5 · Switch`.
    const r = release({
      platforms: ['PlayStation 5', 'Nintendo Switch', 'Xbox Series X|S'],
      wishlistedPlatforms: ['PlayStation 5', 'Nintendo Switch'],
    });
    const out = pickWishlistedPlatformChips(r);
    expect(out.mode).toBe('wishlist');
    expect(out.platforms).toEqual(['PlayStation 5', 'Nintendo Switch']);
  });

  it('returns wishlist mode when wishlistedPlatforms is a single-platform subset of multi-platform IGDB array', () => {
    const r = release({
      platforms: ['PlayStation 5', 'PC (Microsoft Windows)'],
      wishlistedPlatforms: ['PlayStation 5'],
    });
    const out = pickWishlistedPlatformChips(r);
    expect(out.mode).toBe('wishlist');
    expect(out.platforms).toEqual(['PlayStation 5']);
  });

  it('returns generic mode when wishlistedPlatforms is a single platform that IS the only IGDB platform (no narrowing)', () => {
    const r = release({
      platforms: ['PlayStation 5'],
      wishlistedPlatforms: ['PlayStation 5'],
    });
    const out = pickWishlistedPlatformChips(r);
    expect(out.mode).toBe('generic');
  });

  it('preserves order from wishlistedPlatforms (not from IGDB platforms) when in wishlist mode', () => {
    // The user's stored order is the user's preference. Don't re-sort by
    // IGDB's order — that would feel arbitrary.
    const r = release({
      platforms: ['PlayStation 5', 'Nintendo Switch', 'Xbox Series X|S'],
      wishlistedPlatforms: ['Nintendo Switch', 'PlayStation 5'],
    });
    const out = pickWishlistedPlatformChips(r);
    expect(out.platforms).toEqual(['Nintendo Switch', 'PlayStation 5']);
  });

  it('surfaces wishlist mode when wishlistedPlatforms contains entries not in IGDB.platforms (data-drift edge case per OQ-REL-3 v1)', () => {
    // Spec OQ-REL-3 v1 recommendation: same-way display when the user
    // wishlisted on a platform they don't have synced (or that IGDB doesn't
    // list yet). The user's stored intent wins for the Releases card UX;
    // the "you wishlisted on a platform you don't own" concern lives on
    // Library / GameDetail, not the card.
    const r = release({
      platforms: ['PlayStation 5'],
      wishlistedPlatforms: ['PlayStation 5', 'Nintendo Switch'],
    });
    const out = pickWishlistedPlatformChips(r);
    expect(out.mode).toBe('wishlist');
    expect(out.platforms).toEqual(['PlayStation 5', 'Nintendo Switch']);
  });

  it('handles empty IGDB platforms array (no release info yet) gracefully', () => {
    // Edge case: IGDB hasn't surfaced platforms for the release yet. Today
    // we'd render no platform chips at all; with REL-PR1 a wishlisted subset
    // surfaces in wishlist mode (data-drift bucket above).
    const r1 = release({ platforms: [], wishlistedPlatforms: [] });
    expect(pickWishlistedPlatformChips(r1)).toEqual({ mode: 'generic', platforms: [] });

    const r2 = release({ platforms: [], wishlistedPlatforms: ['PlayStation 5'] });
    const out = pickWishlistedPlatformChips(r2);
    expect(out.mode).toBe('wishlist');
    expect(out.platforms).toEqual(['PlayStation 5']);
  });
});
