import { describe, it, expect } from 'vitest';
import { igdbCoverSize } from '../igdbCover';

const BIG_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5l9p.jpg';
const BIG2X_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co5l9p.jpg';
const SMALL_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_small/co5l9p.jpg';

describe('igdbCoverSize', () => {
  it('downscales to t_cover_small for mobile-sized targets (<= 90 px)', () => {
    expect(igdbCoverSize(BIG_URL, 84)).toContain('t_cover_small');
    expect(igdbCoverSize(BIG_URL, 90)).toContain('t_cover_small');
  });

  it('keeps t_cover_big for desktop-sized targets (> 90 px)', () => {
    expect(igdbCoverSize(BIG_URL, 130)).toContain('t_cover_big');
    expect(igdbCoverSize(BIG_URL, 200)).toContain('t_cover_big');
  });

  it('substitutes regardless of starting variant', () => {
    expect(igdbCoverSize(BIG2X_URL, 84)).toContain('t_cover_small');
    expect(igdbCoverSize(SMALL_URL, 200)).toContain('t_cover_big');
  });

  it('returns null when src is null or undefined', () => {
    expect(igdbCoverSize(null, 100)).toBeNull();
    expect(igdbCoverSize(undefined, 100)).toBeNull();
  });

  it('passes through non-IGDB URLs unchanged', () => {
    const steam = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/header.jpg';
    expect(igdbCoverSize(steam, 84)).toBe(steam);
    expect(igdbCoverSize(steam, 200)).toBe(steam);
  });

  it('passes through URLs without a recognised t_cover_* token', () => {
    const url = 'https://images.igdb.com/igdb/image/upload/some_other/co5l9p.jpg';
    expect(igdbCoverSize(url, 100)).toBe(url);
  });
});
