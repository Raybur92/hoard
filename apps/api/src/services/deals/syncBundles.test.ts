/**
 * DEALS-PR2 — syncBundles orchestrator tests.
 *
 * Pins:
 *  - itadGameIds flattens correctly across multi-tier bundles + dedupes
 *  - non-'game' types (media etc) filtered out of itadGameIds
 *  - upsert fires per bundle with the right shape
 *  - bundles ITAD no longer returns get deleted (sale-ended cleanup)
 *  - ItadClientError is swallowed gracefully (returns zero counters)
 *  - per-bundle failures don't abort the whole run
 *  - publish + expiry ISO strings parse into Date instances
 */

jest.mock('@hoard/db', () => ({
  prisma: {
    bundle: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  Prisma: {},
}));

jest.mock('../itad', () => {
  class ItadClientError extends Error {
    constructor(message: string) { super(message); this.name = 'ItadClientError'; }
  }
  return {
    isItadConfigured: jest.fn().mockReturnValue(true),
    getBundles: jest.fn(),
    ItadClientError,
  };
});

jest.mock('./affiliate', () => ({
  routeAffiliateUrl: jest.fn((_shop: string, url: string) => `${url}#routed`),
}));

import { prisma } from '@hoard/db';
import { getBundles, isItadConfigured, ItadClientError } from '../itad';
import { syncAllBundles } from './syncBundles';

beforeEach(() => {
  jest.clearAllMocks();
  (isItadConfigured as jest.Mock).mockReturnValue(true);
  (prisma.bundle.upsert as jest.Mock).mockResolvedValue({});
  (prisma.bundle.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
});

const sampleBundle = (id: number, gameIds: string[], opts: { expiry?: string; shop?: string } = {}) => ({
  id,
  title: `Bundle ${id}`,
  page: { id: 8, name: opts.shop ?? 'Fanatical', shopId: 6 },
  url: `https://example.test/bundle-${id}`,
  details: `https://itad.test/bundles/${id}`,
  isMature: false,
  publish: '2026-06-01T00:00:00Z',
  expiry: opts.expiry ?? '2026-07-01T00:00:00Z',
  note: null,
  counts: { games: gameIds.length, media: 0 },
  tiers: [{
    price: { amount: 4.99, amountInt: 499, currency: 'USD' },
    addon: false,
    games: gameIds.map((gid) => ({ id: gid, slug: `g-${gid}`, title: `Game ${gid}`, type: 'game', mature: false })),
  }],
});

describe('DEALS-PR2 — syncAllBundles', () => {
  it('returns zero counters when ITAD is not configured', async () => {
    (isItadConfigured as jest.Mock).mockReturnValue(false);
    const result = await syncAllBundles();
    expect(result).toEqual({ fetched: 0, upserted: 0, removed: 0, failed: 0 });
    expect(getBundles).not.toHaveBeenCalled();
  });

  it('upserts each bundle returned from ITAD', async () => {
    (getBundles as jest.Mock).mockResolvedValue([
      sampleBundle(101, ['uuid-1', 'uuid-2']),
      sampleBundle(102, ['uuid-3']),
    ]);
    const result = await syncAllBundles();
    expect(result.fetched).toBe(2);
    expect(result.upserted).toBe(2);
    expect((prisma.bundle.upsert as jest.Mock).mock.calls.length).toBe(2);
  });

  it('flattens tier games into itadGameIds (no duplicates across tiers; non-game types filtered)', async () => {
    const multiTier = {
      ...sampleBundle(200, []),
      counts: { games: 3, media: 0 },
      tiers: [
        {
          price: { amount: 4.99, amountInt: 499, currency: 'USD' },
          addon: false,
          games: [
            { id: 'uuid-a', slug: 'a', title: 'A', type: 'game', mature: false },
            { id: 'uuid-b', slug: 'b', title: 'B', type: 'game', mature: false },
          ],
        },
        {
          price: { amount: 14.99, amountInt: 1499, currency: 'USD' },
          addon: false,
          games: [
            // uuid-a appears in both tiers (extended bundle) — dedupe
            { id: 'uuid-a', slug: 'a', title: 'A', type: 'game', mature: false },
            { id: 'uuid-c', slug: 'c', title: 'C', type: 'game', mature: false },
            // non-game type filtered out
            { id: 'uuid-soundtrack', slug: 'st', title: 'OST', type: 'media', mature: false },
          ],
        },
      ],
    };
    (getBundles as jest.Mock).mockResolvedValue([multiTier]);
    await syncAllBundles();
    const upsertCall = (prisma.bundle.upsert as jest.Mock).mock.calls[0][0];
    expect([...upsertCall.update.itadGameIds].sort()).toEqual(['uuid-a', 'uuid-b', 'uuid-c']);
  });

  it('affiliate-routes the bundle URL via routeAffiliateUrl', async () => {
    (getBundles as jest.Mock).mockResolvedValue([sampleBundle(300, ['uuid-x'])]);
    await syncAllBundles();
    const upsertCall = (prisma.bundle.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.update.url).toBe('https://example.test/bundle-300#routed');
  });

  it('deletes bundles ITAD no longer returns (sale-ended cleanup)', async () => {
    (getBundles as jest.Mock).mockResolvedValue([sampleBundle(101, ['uuid-1']), sampleBundle(102, ['uuid-2'])]);
    (prisma.bundle.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });
    const result = await syncAllBundles();
    expect((prisma.bundle.deleteMany as jest.Mock).mock.calls[0][0]).toEqual({
      where: { itadBundleId: { notIn: [101, 102] } },
    });
    expect(result.removed).toBe(5);
  });

  it('swallows ItadClientError gracefully (returns zero counters)', async () => {
    (getBundles as jest.Mock).mockRejectedValue(new ItadClientError('boom'));
    const result = await syncAllBundles();
    expect(result).toEqual({ fetched: 0, upserted: 0, removed: 0, failed: 0 });
  });

  it('counts per-bundle failures without aborting the whole run', async () => {
    (getBundles as jest.Mock).mockResolvedValue([
      sampleBundle(401, ['uuid-1']),
      sampleBundle(402, ['uuid-2']),
      sampleBundle(403, ['uuid-3']),
    ]);
    (prisma.bundle.upsert as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({});
    const result = await syncAllBundles();
    expect(result.fetched).toBe(3);
    expect(result.upserted).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('parses publish + expiry ISO strings into Date instances on the upsert payload', async () => {
    (getBundles as jest.Mock).mockResolvedValue([sampleBundle(501, ['uuid-1'], { expiry: '2027-01-15T12:00:00Z' })]);
    await syncAllBundles();
    const upsertCall = (prisma.bundle.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.update.publishedAt).toBeInstanceOf(Date);
    expect(upsertCall.update.expiresAt).toBeInstanceOf(Date);
    expect((upsertCall.update.expiresAt as Date).toISOString()).toBe('2027-01-15T12:00:00.000Z');
  });
});
