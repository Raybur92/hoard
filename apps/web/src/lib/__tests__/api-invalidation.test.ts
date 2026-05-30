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
  it('invalidating `dashboard` also clears the DASH-PR2 period-scoped variants (`dashboard:year` / `dashboard:month`)', async () => {
    // Regression guard: useDashboard parameterizes its cache key with the
    // period suffix. Any existing mutation that flushes `dashboard` must
    // continue to cover the new variants without per-mutation changes, via
    // cache.invalidate()'s startsWith() prefix match. If a future cache
    // refactor changes that contract, this test surfaces it loudly.
    cache.set('dashboard', { stats: 'all' });
    cache.set('dashboard:year', { stats: 'year' });
    cache.set('dashboard:month', { stats: 'month' });

    cache.invalidate('dashboard');

    expect(cache.get('dashboard')).toBeUndefined();
    expect(cache.get('dashboard:year')).toBeUndefined();
    expect(cache.get('dashboard:month')).toBeUndefined();
  });

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

  it('toggleWishlist drops upcoming:, dashboard, releases:recent, AND library caches', async () => {
    const api = await loadApi();
    cache.set('upcoming:my-platforms', [{ id: 'old' }]);
    cache.set('upcoming:all', [{ id: 'old' }]);
    cache.set('upcoming:wishlist', [{ id: 'old' }]);
    cache.set('dashboard', 'old');
    cache.set('releases:recent', { starred: ['old'], hyped: ['old'] });
    // After the wishlist-as-library work the toggle also creates/deletes a
    // UserGame with status=Wishlist. The Library Wishlist shelf, search
    // overlay, and per-shelf counts all read UserGame data — they must
    // invalidate so the change shows up immediately.
    cache.set('games:{}', [{ id: 'old' }]);
    cache.set('shelves:default', { Wishlist: ['old'] });
    cache.set('gameCounts', { Wishlist: 1 });

    await api.toggleWishlist(123);

    expect(cache.get('upcoming:my-platforms')).toBeUndefined();
    expect(cache.get('upcoming:all')).toBeUndefined();
    expect(cache.get('upcoming:wishlist')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
    expect(cache.get('releases:recent')).toBeUndefined();
    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('shelves:default')).toBeUndefined();
    expect(cache.get('gameCounts')).toBeUndefined();
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

  it('removeWishlistedPlatform drops game:{id} + library caches', async () => {
    const api = await loadApi();
    cache.set('game:abc', { id: 'abc', wishlistedPlatforms: ['PC', 'PS'] });
    cache.set('games:{}', 'old');
    cache.set('gameCounts', 'old');
    cache.set('dashboard', 'old');

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'abc', wishlistedPlatforms: ['PS'] }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;

    await api.removeWishlistedPlatform('abc', 'PC');

    expect(cache.get('game:abc')).toBeUndefined();
    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('gameCounts')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
  });

  it('removeWishlistedPlatform encodes the platform code path segment', async () => {
    const api = await loadApi();
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'abc', wishlistedPlatforms: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    // Use a code with a character that must be percent-encoded to ensure
    // the client never lets a raw `/` smuggle into the path.
    await api.removeWishlistedPlatform('abc', 'A/B');

    const callArgs = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(callArgs[0]).toContain('/api/games/abc/wishlist-platforms/A%2FB');
    expect(callArgs[1]?.method).toBe('DELETE');
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

  it('connectItch drops platformStatus + library (M1)', async () => {
    const api = await loadApi();
    cache.set('platformStatus', 'old');
    cache.set('games:{}', 'old');
    cache.set('dashboard', 'old');
    cache.set('shelves:30', 'old');

    await api.connectItch('a-real-itch-key');

    expect(cache.get('platformStatus')).toBeUndefined();
    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
    expect(cache.get('shelves:30')).toBeUndefined();
  });

  it('connectEpic drops platformStatus + library (M2)', async () => {
    const api = await loadApi();
    cache.set('platformStatus', 'old');
    cache.set('games:{}', 'old');
    cache.set('dashboard', 'old');
    cache.set('shelves:30', 'old');

    await api.connectEpic('an-epic-auth-code');

    expect(cache.get('platformStatus')).toBeUndefined();
    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
    expect(cache.get('shelves:30')).toBeUndefined();
  });

  it('connectNintendo drops platformStatus + library (M3)', async () => {
    const api = await loadApi();
    cache.set('platformStatus', 'old');
    cache.set('games:{}', 'old');
    cache.set('dashboard', 'old');
    cache.set('shelves:30', 'old');

    await api.connectNintendo({
      redirectUrl: 'npf...://auth#session_token_code=eyJh.abc.def&state=ST',
      verifier: 'V'.repeat(43),
    });

    expect(cache.get('platformStatus')).toBeUndefined();
    expect(cache.get('games:{}')).toBeUndefined();
    expect(cache.get('dashboard')).toBeUndefined();
    expect(cache.get('shelves:30')).toBeUndefined();
  });

  it('admin.deleteFeedback drops only admin:feedback (admin-IA redesign 2026-05-29)', async () => {
    const api = await loadApi();
    cache.set('admin:feedback', 'old');
    cache.set('admin:invite-codes', 'unaffected');
    cache.set('admin:users', 'unaffected');

    globalThis.fetch = vi.fn(async () =>
      new Response(null, { status: 204 })
    ) as unknown as typeof fetch;

    await api.admin.deleteFeedback('fb_xyz');

    expect(cache.get('admin:feedback')).toBeUndefined();
    // Narrower invalidation than `deleteUser` — codes + users untouched.
    expect(cache.get('admin:invite-codes')).toBeDefined();
    expect(cache.get('admin:users')).toBeDefined();
  });
});
