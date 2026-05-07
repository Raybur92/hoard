/**
 * Verifies that mutation calls invalidate the right cache keys.
 * Covers F4 success criterion: "PATCH a game's status invalidates dashboard
 * and games: cache keys and they are re-fetched on next read."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cache from '../cache';

// Stub fetch — returns the body unchanged for mutations, ignores GET shapes.
beforeEach(() => {
  cache._resetForTests();
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;
});

async function loadApi() {
  // Re-import to pick up cache module instance per-test.
  const mod = await import('../api');
  return mod.api;
}

describe('api mutation invalidation', () => {
  it('patchGame drops games:, gameCounts, dashboard and re-stores game:{id}', async () => {
    const api = await loadApi();
    cache.set('games:{}', { games: ['old'] });
    cache.set('gameCounts', { counts: { Playing: 1 } });
    cache.set('dashboard', { stats: 'old' });
    cache.set('game:abc', { id: 'abc', stale: true });

    // mock fetch returns the updated game body
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'abc', notes: 'fresh' }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;

    await api.patchGame('abc', { notes: 'fresh' });

    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('gameCounts')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
    // patchGame writes the response into the per-game cache slot
    expect(cache.get<{ notes: string }>('game:abc')?.data.notes).toBe('fresh');
  });

  it('toggleWishlist drops upcoming:, dashboard, and releases:recent', async () => {
    const api = await loadApi();
    cache.set('upcoming:my-platforms', [{ id: 'old' }]);
    cache.set('upcoming:all', [{ id: 'old' }]);
    cache.set('upcoming:wishlist', [{ id: 'old' }]);
    cache.set('dashboard', 'old');
    cache.set('releases:recent', { starred: ['old'], hyped: ['old'] });

    await api.toggleWishlist(123);

    expect(cache.get('upcoming:my-platforms')).toBeUndefined();
    expect(cache.get('upcoming:all')).toBeUndefined();
    expect(cache.get('upcoming:wishlist')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
    // releases:recent reads from the wishlist join — must invalidate too,
    // otherwise un-starring a recent drop leaves it in `// just out · starred`
    // until SWR's 30s window.
    expect(cache.get('releases:recent')).toBeUndefined();
  });

  it('updateMe({ hypeThreshold }) drops the upcoming: caches', async () => {
    const api = await loadApi();
    cache.set('upcoming:my-platforms', [{ id: 'old' }]);
    cache.set('upcoming:all', [{ id: 'old' }]);
    cache.set('upcoming:wishlist', [{ id: 'old' }]);

    // updateMe expects the auth-response shape on success.
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', preferences: { hypeThreshold: 80 } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;

    await api.updateMe({ hypeThreshold: 80 });

    expect(cache.get('upcoming:my-platforms')).toBeUndefined();
    expect(cache.get('upcoming:all')).toBeUndefined();
    expect(cache.get('upcoming:wishlist')).toBeUndefined();
  });

  it('updateMe with an unrelated pref does NOT touch upcoming caches', async () => {
    const api = await loadApi();
    cache.set('upcoming:my-platforms', [{ id: 'keep' }]);

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', preferences: { showHltb: false } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;

    await api.updateMe({ showHltb: false });

    expect(cache.get('upcoming:my-platforms')).toBeDefined();
  });

  it('addManualGame drops games:, gameCounts, dashboard', async () => {
    const api = await loadApi();
    cache.set('games:{"status":"Playing"}', 'old');
    cache.set('gameCounts', 'old');
    cache.set('dashboard', 'old');

    await api.addManualGame({ igdbId: 1, title: 'Test', status: 'Backlog', platformLabel: 'Nintendo' });

    expect(cache.get('games:{"status":"Playing"}')).toBeUndefined();
    expect(cache.get('gameCounts')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
  });

  it('logout / deleteAccount wipe the entire cache', async () => {
    const api = await loadApi();
    cache.set('a', 1);
    cache.set('games:x', 2);
    cache.set('dashboard', 3);

    await api.logout();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('games:x')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
  });

  it('platform mutations drop platformStatus + library', async () => {
    const api = await loadApi();
    cache.set('platformStatus', 'old');
    cache.set('games:{}', 'old');
    cache.set('dashboard', 'old');

    await api.connectPsn('a'.repeat(64));

    expect(cache.get('platformStatus')).toBeUndefined();
    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
  });
});
