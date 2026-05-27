import type { IgdbSearchResult } from '@hoard/types';
import { pickBestMatch, normalize } from './igdbMatch';

function makeResult(overrides: Partial<IgdbSearchResult>): IgdbSearchResult {
  return {
    igdbId: 1,
    title: 'Untitled',
    developer: null,
    releaseYear: null,
    genres: [],
    coverUrl: null,
    platforms: [],
    totalRatingCount: 0,
    ...overrides,
  };
}

describe('normalize', () => {
  it('lowercases and strips trademarks + diacritics', () => {
    expect(normalize('God of War Ragnarök')).toBe('god of war ragnarok');
    expect(normalize('Slay the Spire®')).toBe('slay the spire');
    expect(normalize("Don't Starve")).toBe('dont starve');
  });

  it('drops common edition suffixes', () => {
    expect(normalize('Hades II: Definitive Edition')).toBe('hades ii');
    expect(normalize('Cyberpunk 2077 Ultimate Edition')).toBe('cyberpunk 2077');
    expect(normalize('The Witcher 3 - Game of the Year Edition')).toBe('the witcher 3');
  });

  it('collapses whitespace and is idempotent', () => {
    const a = normalize('  FAR  CRY  6  ');
    const b = normalize(a);
    expect(a).toBe('far cry 6');
    expect(b).toBe(a);
  });
});

describe('pickBestMatch', () => {
  it('returns null on empty results', () => {
    expect(pickBestMatch('anything', [], 'PS')).toBeNull();
  });

  it('falls back to results[0] when nothing scores well', () => {
    const results = [
      makeResult({ igdbId: 1, title: 'Wildly Different Game', platforms: ['PC (Microsoft Windows)'] }),
    ];
    const out = pickBestMatch('something else entirely', results, 'PS');
    expect(out?.igdbId).toBe(1);
  });

  // ── The two real-world bugs that triggered this whole refactor ──

  it('picks Slay the Spire over Slay the Spire 2 (popularity tiebreaker on early-access sequel)', () => {
    const results = [
      // IGDB's relevance search ranks the 2026 sequel first because of fresh activity.
      makeResult({
        igdbId: 2,
        title: 'Slay the Spire 2',
        platforms: ['PC (Microsoft Windows)', 'PlayStation 5'],
        totalRatingCount: 30,
      }),
      makeResult({
        igdbId: 1,
        title: 'Slay the Spire',
        platforms: ['PC (Microsoft Windows)', 'PlayStation 4', 'PlayStation 5'],
        totalRatingCount: 1500,
      }),
    ];
    expect(pickBestMatch('Slay the Spire', results, 'PS')?.igdbId).toBe(1);
    expect(pickBestMatch('Slay the Spire', results, 'ST')?.igdbId).toBe(1);
  });

  it('picks God of War Ragnarök over the Korean MMO "Ragnarok: War of Gods" (platform agreement)', () => {
    const results = [
      // Real IGDB collision — a Korean MMORPG with no PlayStation presence.
      makeResult({
        igdbId: 99,
        title: 'Ragnarok: War of Gods',
        platforms: ['Android', 'iOS'],
        totalRatingCount: 5,
      }),
      makeResult({
        igdbId: 1,
        title: 'God of War Ragnarök',
        platforms: ['PlayStation 4', 'PlayStation 5'],
        totalRatingCount: 800,
      }),
    ];
    expect(pickBestMatch('God of War Ragnarök', results, 'PS')?.igdbId).toBe(1);
  });

  // ── General behaviour ──

  it('exact normalized title match outranks partial', () => {
    const results = [
      makeResult({ igdbId: 1, title: 'Hollow Knight: Silksong', platforms: ['PC (Microsoft Windows)'], totalRatingCount: 100 }),
      makeResult({ igdbId: 2, title: 'Hollow Knight',           platforms: ['PC (Microsoft Windows)'], totalRatingCount: 100 }),
    ];
    expect(pickBestMatch('Hollow Knight', results, 'ST')?.igdbId).toBe(2);
  });

  it('platform agreement outweighs an exact title match on the wrong platform — but only when there is a competing on-platform candidate', () => {
    // Two games called "Doom" — one on PC, one (hypothetical) only on mobile.
    // Searching for "Doom" with platformCode=ST should pick the PC one.
    const results = [
      makeResult({ igdbId: 1, title: 'Doom', platforms: ['Android', 'iOS'], totalRatingCount: 0 }),
      makeResult({ igdbId: 2, title: 'Doom', platforms: ['PC (Microsoft Windows)'], totalRatingCount: 800 }),
    ];
    expect(pickBestMatch('Doom', results, 'ST')?.igdbId).toBe(2);
  });

  it('does not penalize results with empty platforms[] (IGDB data missing)', () => {
    const results = [
      makeResult({ igdbId: 1, title: 'Some Game', platforms: [], totalRatingCount: 0 }),
      makeResult({ igdbId: 2, title: 'Wrong Game', platforms: ['Android'], totalRatingCount: 0 }),
    ];
    // Both have weak title scores but #1 has unknown-platform (+50) and
    // #2 has wrong-platform (-200), so #1 should win.
    expect(pickBestMatch('Some Game', results, 'PS')?.igdbId).toBe(1);
  });

  it('handles edition suffixes — exact match still wins despite suffix', () => {
    const results = [
      makeResult({ igdbId: 1, title: 'Cyberpunk 2077: Ultimate Edition', platforms: ['PC (Microsoft Windows)'], totalRatingCount: 200 }),
      makeResult({ igdbId: 2, title: 'Cyberpunk 2077',                   platforms: ['PC (Microsoft Windows)'], totalRatingCount: 1500 }),
    ];
    // Both normalize to "cyberpunk 2077", but #2 has higher rating count so
    // wins on the tiebreak. Either way, neither should be ignored.
    const out = pickBestMatch('Cyberpunk 2077', results, 'ST');
    expect(out?.igdbId).toBe(2);
  });

  describe('L-series — matchTitle scoring', () => {
    it('scores against matchTitle (localized) when present, not the canonical title', () => {
      // Italian PSN query against a candidate from the localization fallback:
      // canonical title is English, matchTitle is the Italian localization.
      const results = [
        makeResult({
          igdbId: 1,
          title: 'LEGO Batman: Legacy of the Dark Knight',
          matchTitle: "LEGO Batman: L'Eredità del Cavaliere Oscuro",
          platforms: ['PlayStation 5'],
        }),
        makeResult({
          igdbId: 2,
          title: 'LEGO Batman: The Videogame',
          platforms: ['PlayStation 5'],
        }),
      ];
      // Italian query exactly matches candidate #1's matchTitle → +1000.
      // It doesn't word-match candidate #2's title → 0 title score.
      const out = pickBestMatch("LEGO Batman: L'Eredità del Cavaliere Oscuro", results, 'PS');
      expect(out?.igdbId).toBe(1);
      // The chosen candidate still exposes the canonical English title
      // for syncRunner to persist on Game.title.
      expect(out?.title).toBe('LEGO Batman: Legacy of the Dark Knight');
    });

    it('falls back to canonical title when matchTitle is absent (non-localization path)', () => {
      const results = [
        makeResult({ igdbId: 1, title: 'Slay the Spire', platforms: ['PC (Microsoft Windows)'], totalRatingCount: 1500 }),
      ];
      const out = pickBestMatch('Slay the Spire', results, 'ST');
      expect(out?.igdbId).toBe(1);
    });
  });
});
