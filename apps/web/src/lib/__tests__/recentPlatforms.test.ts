import { describe, it, expect, beforeEach } from 'vitest';
import { getRecent, pushRecent, _resetForTests } from '../recentPlatforms';

describe('recentPlatforms', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('returns empty array when nothing stored yet', () => {
    expect(getRecent()).toEqual([]);
  });

  it('persists a single push + reads it back', () => {
    pushRecent('PS5');
    expect(getRecent()).toEqual(['PS5']);
  });

  it('prepends most-recent (LRU order)', () => {
    pushRecent('PS5');
    pushRecent('Switch');
    pushRecent('Game Boy');
    expect(getRecent()).toEqual(['Game Boy', 'Switch', 'PS5']);
  });

  it('dedupes — pushing an existing entry moves it to the front', () => {
    pushRecent('PS5');
    pushRecent('Switch');
    pushRecent('PS5');
    expect(getRecent()).toEqual(['PS5', 'Switch']);
  });

  it('caps at 5 entries (older ones drop off)', () => {
    pushRecent('A');
    pushRecent('B');
    pushRecent('C');
    pushRecent('D');
    pushRecent('E');
    pushRecent('F');
    expect(getRecent()).toEqual(['F', 'E', 'D', 'C', 'B']);
  });

  it('silently no-ops on empty label (defensive)', () => {
    pushRecent('PS5');
    pushRecent('');
    expect(getRecent()).toEqual(['PS5']);
  });

  it('returns empty array on corrupt JSON in storage (graceful)', () => {
    window.localStorage.setItem('hoard.recentPlatforms.v1', '{not json');
    expect(getRecent()).toEqual([]);
  });

  it('returns empty array when storage holds a non-array value (graceful)', () => {
    window.localStorage.setItem('hoard.recentPlatforms.v1', JSON.stringify({ obj: true }));
    expect(getRecent()).toEqual([]);
  });

  it('filters non-string entries out of the stored array (defensive)', () => {
    window.localStorage.setItem('hoard.recentPlatforms.v1', JSON.stringify(['PS5', 42, null, 'Switch']));
    expect(getRecent()).toEqual(['PS5', 'Switch']);
  });
});
