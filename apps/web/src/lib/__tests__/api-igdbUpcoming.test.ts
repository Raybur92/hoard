/**
 * Regression test for the wishlist-scope client-encoding bug.
 *
 * The server's `/api/igdb/upcoming` endpoint accepts three scopes:
 * `my-platforms` (default), `all`, and `wishlist` (added in Post-8 PR B).
 * The client must forward both non-default scopes; previously it only
 * forwarded `all` and silently routed `useUpcoming('wishlist')` to the
 * my-platforms feed — which broke the hero countdown on the Releases page
 * (it picked the first future-dated item from my-platforms instead of
 * the user's actual wishlist, with a hollow star to match).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
});

async function loadApi() {
  const mod = await import('../api');
  return mod.api;
}

describe('api.igdbUpcoming — scope encoding', () => {
  it('default (my-platforms) sends no query param', async () => {
    const api = await loadApi();
    await api.igdbUpcoming();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toMatch(/\/api\/igdb\/upcoming$/);
    expect(url).not.toContain('scope=');
  });

  it("scope='all' sends ?scope=all", async () => {
    const api = await loadApi();
    await api.igdbUpcoming('all');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('scope=all');
  });

  it("scope='wishlist' sends ?scope=wishlist (regression: was missing)", async () => {
    const api = await loadApi();
    await api.igdbUpcoming('wishlist');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('scope=wishlist');
  });
});
