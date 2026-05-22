import { describe, it, expect } from 'vitest';
import {
  inferFromIgdb,
  suggestedFromIgdbPlatforms,
  preferredBucketFromIgdb,
  bucketOptions,
  findByLabel,
  PLATFORM_OPTIONS,
} from '../platformBuckets';

describe('platformBuckets', () => {
  describe('inferFromIgdb', () => {
    it('maps "PlayStation 5" → PS5 (physical bucket)', () => {
      const opt = inferFromIgdb('PlayStation 5');
      expect(opt).toBeDefined();
      expect(opt?.label).toBe('PS5');
      expect(opt?.bucket).toBe('physical');
    });

    it('maps "Nintendo Switch" → Switch (physical bucket)', () => {
      const opt = inferFromIgdb('Nintendo Switch');
      expect(opt?.label).toBe('Switch');
      expect(opt?.bucket).toBe('physical');
    });

    it('maps "Game Boy" → Game Boy (retro bucket)', () => {
      const opt = inferFromIgdb('Game Boy');
      expect(opt?.label).toBe('Game Boy');
      expect(opt?.bucket).toBe('retro');
    });

    it('maps multiple aliases to the same canonical option (Genesis ⇆ Mega Drive)', () => {
      const a = inferFromIgdb('Sega Mega Drive/Genesis');
      const b = inferFromIgdb('Sega Genesis');
      const c = inferFromIgdb('Mega Drive');
      expect(a?.label).toBe('Genesis');
      expect(b?.label).toBe('Genesis');
      expect(c?.label).toBe('Genesis');
    });

    it('is case-insensitive on alias matching', () => {
      expect(inferFromIgdb('playstation 5')?.label).toBe('PS5');
      expect(inferFromIgdb('PLAYSTATION 5')?.label).toBe('PS5');
    });

    it('returns undefined for unknown platforms (Hoard hasn\'t enumerated them)', () => {
      expect(inferFromIgdb('Some Obscure Retro Platform')).toBeUndefined();
      expect(inferFromIgdb('')).toBeUndefined();
    });

    it('does NOT match the canonical Hoard label as an implicit alias', () => {
      // "PS5" is the Hoard label — not in the IGDB alias list explicitly.
      // IGDB always reports the full name. Prevents false positives from
      // generic 2-char tokens elsewhere in the platform world.
      expect(inferFromIgdb('PS5')).toBeUndefined();
    });
  });

  describe('suggestedFromIgdbPlatforms', () => {
    it('preserves IGDB order in the suggestions (release order convention)', () => {
      const suggested = suggestedFromIgdbPlatforms(['Game Boy', 'Game Boy Color', 'Wii Virtual Console']);
      expect(suggested.map((s) => s.label)).toEqual(['Game Boy', 'Game Boy Color', 'Wii VC']);
    });

    it('dedupes when multiple aliases point to the same canonical option', () => {
      // If IGDB reported both "Sega Genesis" and "Mega Drive" (rare but possible),
      // we shouldn't end up with two Genesis entries.
      const suggested = suggestedFromIgdbPlatforms(['Sega Genesis', 'Mega Drive']);
      expect(suggested).toHaveLength(1);
      expect(suggested[0]?.label).toBe('Genesis');
    });

    it('skips IGDB platforms Hoard hasn\'t enumerated (graceful degradation)', () => {
      const suggested = suggestedFromIgdbPlatforms(['PlayStation 5', 'Some Obscure Platform', 'Switch']);
      // Wait — IGDB says "Switch" not "Nintendo Switch"; let's test with the actual IGDB alias.
      const correct = suggestedFromIgdbPlatforms(['PlayStation 5', 'Some Obscure Platform', 'Nintendo Switch']);
      expect(correct.map((s) => s.label)).toEqual(['PS5', 'Switch']);
      // confirm `suggested` would skip Switch since "Switch" without "Nintendo" isn't an alias
      expect(suggested.map((s) => s.label)).toEqual(['PS5']);
    });

    it('returns empty array for empty input', () => {
      expect(suggestedFromIgdbPlatforms([])).toEqual([]);
    });
  });

  describe('preferredBucketFromIgdb', () => {
    it('returns the bucket of the first IGDB-suggested platform', () => {
      // Pokemon Red — IGDB reports Game Boy first
      expect(preferredBucketFromIgdb(['Game Boy', 'Game Boy Color'])).toBe('retro');
    });

    it('returns "digital" as fallback when no IGDB platforms are present', () => {
      expect(preferredBucketFromIgdb([])).toBe('digital');
    });

    it('returns "digital" as fallback when none of the IGDB platforms are enumerated', () => {
      expect(preferredBucketFromIgdb(['Some Obscure Platform', 'Another One'])).toBe('digital');
    });

    it('skips unenumerated platforms and uses the next one for bucket inference', () => {
      // If IGDB's first platform is unknown but the second is known, the bucket
      // of the second one wins.
      expect(preferredBucketFromIgdb(['Unknown Platform', 'PlayStation 5'])).toBe('physical');
    });
  });

  describe('bucketOptions', () => {
    it('returns all platforms in a bucket, sorted alphabetically by label', () => {
      const retro = bucketOptions('retro');
      const labels = retro.map((p) => p.label);
      const sortedCopy = [...labels].sort((a, b) => a.localeCompare(b));
      expect(labels).toEqual(sortedCopy);
    });

    it('only returns platforms in the requested bucket', () => {
      const digital = bucketOptions('digital');
      expect(digital.every((p) => p.bucket === 'digital')).toBe(true);
    });

    it('returns at least one entry per bucket (sanity check on enum population)', () => {
      expect(bucketOptions('digital').length).toBeGreaterThan(0);
      expect(bucketOptions('physical').length).toBeGreaterThan(0);
      expect(bucketOptions('retro').length).toBeGreaterThan(0);
    });
  });

  describe('findByLabel', () => {
    it('finds an exact-label match', () => {
      expect(findByLabel('PS5')?.bucket).toBe('physical');
      expect(findByLabel('Game Boy')?.bucket).toBe('retro');
      expect(findByLabel('Steam')?.bucket).toBe('digital');
    });

    it('returns undefined for unknown labels (freeform platform names)', () => {
      expect(findByLabel('Steam Deck OLED Special Edition')).toBeUndefined();
    });
  });

  describe('enum data shape', () => {
    it('every option has a unique canonical label', () => {
      const labels = PLATFORM_OPTIONS.map((p) => p.label);
      const unique = new Set(labels);
      expect(unique.size).toBe(labels.length);
    });
  });
});
