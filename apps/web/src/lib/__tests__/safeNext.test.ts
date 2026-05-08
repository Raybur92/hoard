import { describe, it, expect } from 'vitest';
import { safeNext } from '../safeNext';

describe('safeNext', () => {
  describe('honors legitimate same-origin paths', () => {
    it('passes through a simple root path', () => {
      expect(safeNext('/')).toBe('/');
    });

    it('passes through a single-segment path', () => {
      expect(safeNext('/library')).toBe('/library');
    });

    it('passes through a deep path with query string', () => {
      expect(safeNext('/library/Backlog?sort=playtime')).toBe('/library/Backlog?sort=playtime');
    });

    it('passes through /welcome itself (handles refresh-on-welcome edge case)', () => {
      expect(safeNext('/welcome')).toBe('/welcome');
    });

    it('passes through paths containing colons AFTER the leading slash (legit RFC 3986 path chars)', () => {
      // `:` is a valid path character in RFC 3986; only matters in safety
      // terms when it appears BEFORE the first `/` (i.e. signals a scheme).
      expect(safeNext('/path:colon')).toBe('/path:colon');
    });
  });

  describe('rejects open-redirect attack vectors', () => {
    it('rejects protocol-relative URLs (//evil.com)', () => {
      expect(safeNext('//evil.com')).toBe('/');
      expect(safeNext('//evil.com/path')).toBe('/');
    });

    it('rejects absolute http/https URLs', () => {
      expect(safeNext('https://evil.com')).toBe('/');
      expect(safeNext('http://evil.com/path')).toBe('/');
    });

    it('rejects javascript: pseudo-URLs', () => {
      expect(safeNext('javascript:alert(1)')).toBe('/');
    });

    it('rejects data: URLs', () => {
      expect(safeNext('data:text/html,<script>alert(1)</script>')).toBe('/');
    });

    it('rejects vbscript: pseudo-URLs', () => {
      expect(safeNext('vbscript:msgbox')).toBe('/');
    });

    it('rejects backslash-prefixed (some legacy browsers normalize \\\\ → //)', () => {
      // Doesn't start with `/`, caught by rule (a).
      expect(safeNext('\\\\evil.com')).toBe('/');
    });

    it('rejects paths missing the leading slash', () => {
      expect(safeNext('library')).toBe('/');
      expect(safeNext('evil.com')).toBe('/');
    });
  });

  describe('rejects nullish, empty, and non-string inputs', () => {
    it('returns / for null', () => {
      expect(safeNext(null)).toBe('/');
    });

    it('returns / for undefined', () => {
      expect(safeNext(undefined)).toBe('/');
    });

    it('returns / for empty string', () => {
      expect(safeNext('')).toBe('/');
    });
  });
});
