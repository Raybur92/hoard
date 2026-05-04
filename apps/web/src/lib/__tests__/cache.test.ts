import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cache from '../cache';

beforeEach(() => {
  cache._resetForTests();
});

describe('cache', () => {
  it('set then get returns the value', () => {
    cache.set('k', { a: 1 });
    expect(cache.get<{ a: number }>('k')?.data).toEqual({ a: 1 });
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('invalidate by exact key drops the entry and emits', () => {
    const fn = vi.fn();
    cache.subscribe('k', fn);
    cache.set('k', 1);
    expect(fn).toHaveBeenCalledTimes(1); // emitted on set

    cache.invalidate('k');
    expect(cache.get('k')).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2); // emitted on invalidate
  });

  it('invalidate by prefix drops every matching entry and emits each one', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    cache.subscribe('games:a', fnA);
    cache.subscribe('games:b', fnB);
    cache.set('games:a', 'A');
    cache.set('games:b', 'B');
    cache.set('dashboard', 'D');

    cache.invalidate('games:');

    expect(cache.get('games:a')).toBeUndefined();
    expect(cache.get('games:b')).toBeUndefined();
    expect(cache.get('dashboard')?.data).toBe('D'); // not matched
    expect(fnA).toHaveBeenCalledTimes(2); // set + invalidate
    expect(fnB).toHaveBeenCalledTimes(2);
  });

  it('subscribe returns an unsubscribe that stops further notifications', () => {
    const fn = vi.fn();
    const unsub = cache.subscribe('k', fn);
    cache.set('k', 1);
    expect(fn).toHaveBeenCalledTimes(1);

    unsub();
    cache.set('k', 2);
    expect(fn).toHaveBeenCalledTimes(1); // no more
  });

  it('invalidate with empty prefix wipes everything (logout / delete account)', () => {
    cache.set('a', 1);
    cache.set('games:x', 2);
    cache.set('dashboard', 3);
    cache.invalidate('');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('games:x')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
  });

  it('preserves the entry timestamp when set', async () => {
    cache.set('k', 'v');
    const e1 = cache.get('k');
    expect(e1?.ts).toBeTypeOf('number');

    await new Promise((r) => setTimeout(r, 5));
    cache.set('k', 'v2');
    const e2 = cache.get('k');
    expect(e2!.ts).toBeGreaterThan(e1!.ts);
  });
});
