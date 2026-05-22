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
    it('maps "PlayStation 5" → PS5 (playstation bucket)', () => {
      const opt = inferFromIgdb('PlayStation 5');
      expect(opt).toBeDefined();
      expect(opt?.label).toBe('PS5');
      expect(opt?.bucket).toBe('playstation');
    });

    it('maps "Nintendo Switch" → Switch (nintendo bucket)', () => {
      const opt = inferFromIgdb('Nintendo Switch');
      expect(opt?.label).toBe('Switch');
      expect(opt?.bucket).toBe('nintendo');
    });

    it('maps "Game Boy" → Game Boy (nintendo bucket — Nintendo family includes retro)', () => {
      const opt = inferFromIgdb('Game Boy');
      expect(opt?.label).toBe('Game Boy');
      expect(opt?.bucket).toBe('nintendo');
    });

    it('maps "PC (Microsoft Windows)" → PC (pc bucket)', () => {
      const opt = inferFromIgdb('PC (Microsoft Windows)');
      expect(opt?.label).toBe('PC');
      expect(opt?.bucket).toBe('pc');
    });

    it('maps multiple aliases to the same canonical option (Genesis ⇆ Mega Drive)', () => {
      const a = inferFromIgdb('Sega Mega Drive/Genesis');
      const b = inferFromIgdb('Sega Genesis');
      const c = inferFromIgdb('Mega Drive');
      expect(a?.label).toBe('Genesis');
      expect(b?.label).toBe('Genesis');
      expect(c?.label).toBe('Genesis');
      expect(a?.bucket).toBe('sega');
    });

    it('maps Atari to the other bucket', () => {
      const opt = inferFromIgdb('Atari 2600');
      expect(opt?.label).toBe('Atari 2600');
      expect(opt?.bucket).toBe('other');
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

    it('does NOT include stores as picker entries (PSN, Steam, eShop are not consoles)', () => {
      // Post-2026-05-22 restructure: stores aren't picker entries. IGDB
      // platform names like "PlayStation Network" or "Steam" as a store
      // designation should NOT map to anything (Steam is folded into "PC"
      // via the PC alias list, but the IGDB primary "PlayStation Network"
      // identifier doesn't exist as a platform per se).
      expect(inferFromIgdb('PlayStation Network')).toBeUndefined();
    });
  });

  describe('suggestedFromIgdbPlatforms', () => {
    it('preserves IGDB order in the suggestions (release order convention)', () => {
      const suggested = suggestedFromIgdbPlatforms(['Game Boy', 'Game Boy Color']);
      expect(suggested.map((s) => s.label)).toEqual(['Game Boy', 'Game Boy Color']);
    });

    it('dedupes when multiple aliases point to the same canonical option', () => {
      // If IGDB reported both "Sega Genesis" and "Mega Drive" (rare but possible),
      // we shouldn't end up with two Genesis entries.
      const suggested = suggestedFromIgdbPlatforms(['Sega Genesis', 'Mega Drive']);
      expect(suggested).toHaveLength(1);
      expect(suggested[0]?.label).toBe('Genesis');
    });

    it('skips IGDB platforms Hoard hasn\'t enumerated (graceful degradation)', () => {
      const suggested = suggestedFromIgdbPlatforms(['PlayStation 5', 'Some Obscure Platform', 'Nintendo Switch']);
      expect(suggested.map((s) => s.label)).toEqual(['PS5', 'Switch']);
    });

    it('returns empty array for empty input', () => {
      expect(suggestedFromIgdbPlatforms([])).toEqual([]);
    });

    it('GTA-V-style cross-platform game yields multiple buckets across the list', () => {
      const suggested = suggestedFromIgdbPlatforms(['PlayStation 5', 'Xbox Series X|S', 'PC (Microsoft Windows)']);
      expect(suggested.map((s) => s.bucket)).toEqual(['playstation', 'xbox', 'pc']);
    });
  });

  describe('preferredBucketFromIgdb', () => {
    it('returns the bucket of the first IGDB-suggested platform (Pokemon Red → nintendo)', () => {
      expect(preferredBucketFromIgdb(['Game Boy', 'Game Boy Color'])).toBe('nintendo');
    });

    it('returns "pc" as fallback when no IGDB platforms are present', () => {
      expect(preferredBucketFromIgdb([])).toBe('pc');
    });

    it('returns "pc" as fallback when none of the IGDB platforms are enumerated', () => {
      expect(preferredBucketFromIgdb(['Some Obscure Platform', 'Another One'])).toBe('pc');
    });

    it('skips unenumerated platforms and uses the next one for bucket inference', () => {
      // If IGDB's first platform is unknown but the second is known, the bucket
      // of the second one wins.
      expect(preferredBucketFromIgdb(['Unknown Platform', 'PlayStation 5'])).toBe('playstation');
    });

    it('GTA-V case — first platform PS5 → playstation bucket pre-opens', () => {
      expect(preferredBucketFromIgdb(['PlayStation 5', 'Xbox Series X|S', 'PC (Microsoft Windows)'])).toBe('playstation');
    });
  });

  describe('bucketOptions', () => {
    it('returns all platforms in a bucket, sorted alphabetically by label', () => {
      const nintendo = bucketOptions('nintendo');
      const labels = nintendo.map((p) => p.label);
      const sortedCopy = [...labels].sort((a, b) => a.localeCompare(b));
      expect(labels).toEqual(sortedCopy);
    });

    it('only returns platforms in the requested bucket', () => {
      const pc = bucketOptions('pc');
      expect(pc.every((p) => p.bucket === 'pc')).toBe(true);
    });

    it('returns at least one entry per bucket (sanity check on enum population)', () => {
      expect(bucketOptions('pc').length).toBeGreaterThan(0);
      expect(bucketOptions('playstation').length).toBeGreaterThan(0);
      expect(bucketOptions('xbox').length).toBeGreaterThan(0);
      expect(bucketOptions('nintendo').length).toBeGreaterThan(0);
      expect(bucketOptions('sega').length).toBeGreaterThan(0);
      expect(bucketOptions('other').length).toBeGreaterThan(0);
    });

    it('nintendo bucket includes both modern and retro Nintendo platforms', () => {
      const nintendo = bucketOptions('nintendo');
      const labels = nintendo.map((p) => p.label);
      expect(labels).toContain('Switch');
      expect(labels).toContain('Game Boy');
      expect(labels).toContain('SNES');
    });
  });

  describe('findByLabel', () => {
    it('finds an exact-label match in the correct bucket', () => {
      expect(findByLabel('PS5')?.bucket).toBe('playstation');
      expect(findByLabel('Game Boy')?.bucket).toBe('nintendo');
      expect(findByLabel('PC')?.bucket).toBe('pc');
      expect(findByLabel('Genesis')?.bucket).toBe('sega');
    });

    it('returns undefined for unknown labels (freeform platform names)', () => {
      expect(findByLabel('Steam Deck OLED Special Edition')).toBeUndefined();
    });

    it('returns undefined for store names — stores are not picker entries post-restructure', () => {
      expect(findByLabel('Steam')).toBeUndefined();
      expect(findByLabel('PSN')).toBeUndefined();
      expect(findByLabel('Xbox Live')).toBeUndefined();
      expect(findByLabel('Nintendo eShop')).toBeUndefined();
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
