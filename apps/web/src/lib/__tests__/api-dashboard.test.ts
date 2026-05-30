/**
 * DASH-PR2 — period-aware api.dashboard() URL encoding.
 *
 * Default period ('all') sends no query param (keeps URLs clean + matches
 * the server default). 'year' / 'month' send ?period= so the server's
 * engagement-scoped aggregates kick in.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  ) as unknown as typeof fetch;
});

async function loadApi() {
  const mod = await import('../api');
  return mod.api;
}

describe('api.dashboard — period encoding', () => {
  it("default sends no ?period= query param (server defaults to 'all')", async () => {
    const api = await loadApi();
    await api.dashboard();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toMatch(/\/api\/dashboard$/);
    expect(url).not.toContain('period=');
  });

  it("period='all' explicitly also sends no query param", async () => {
    const api = await loadApi();
    await api.dashboard('all');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).not.toContain('period=');
  });

  it("period='year' sends ?period=year", async () => {
    const api = await loadApi();
    await api.dashboard('year');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('period=year');
  });

  it("period='month' sends ?period=month", async () => {
    const api = await loadApi();
    await api.dashboard('month');
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('period=month');
  });
});
