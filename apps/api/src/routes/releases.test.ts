import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    wishlistRelease: { findMany: jest.fn() },
    userGame: { findMany: jest.fn() },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'test-user-id';
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'test-user-id';
    next();
  },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = { id: 'test-user-id', status: 'ACTIVE', isAdmin: false };
    next();
  },
}));

const mockGetRecentlyReleased = jest.fn();
jest.mock('../services/igdb', () => ({
  getRecentlyReleased: (...args: unknown[]) => mockGetRecentlyReleased(...args),
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
});

const wishlistRow = (overrides: Partial<{ igdbId: number; title: string; releaseDate: Date | null; hype: number | null }>) => ({
  id: `w-${overrides.igdbId ?? 1}`,
  userId: 'test-user-id',
  igdbId: overrides.igdbId ?? 1,
  title: overrides.title ?? 'Game',
  developer: 'Studio',
  releaseDate: overrides.releaseDate ?? new Date('2026-05-01'),
  releaseDateCategory: 'Q2',
  platforms: ['PC (Microsoft Windows)'],
  genres: ['RPG'],
  coverUrl: null,
  synopsis: null,
  hype: overrides.hype ?? 50,
  category: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const igdbRow = (overrides: Partial<{ igdbId: number; title: string; hype: number | null }>) => ({
  igdbId: overrides.igdbId ?? 100,
  title: overrides.title ?? 'IGDB Game',
  developer: 'IGDB Studio',
  releaseDate: '2026-05-02T00:00:00.000Z',
  releaseDateCategory: 'Q2' as const,
  platforms: ['PlayStation 5'],
  genres: ['Action'],
  coverUrl: null,
  synopsis: null,
  wishlisted: false,
  category: 0,
  hype: overrides.hype ?? 90,
});

describe('GET /api/releases/recent', () => {
  it('returns starred + hyped lists in IgdbUpcomingRelease shape (D7)', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      wishlistRow({ igdbId: 42, title: 'Starred A' }),
    ]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    mockGetRecentlyReleased.mockResolvedValue([igdbRow({ igdbId: 100 })]);

    const res = await request(app).get('/api/releases/recent');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      starred: [expect.objectContaining({ igdbId: 42, title: 'Starred A', wishlisted: true })],
      hyped: [expect.objectContaining({ igdbId: 100, title: 'IGDB Game', wishlisted: false })],
    });
    // Both lists share IgdbUpcomingRelease shape — assert the non-trivial fields.
    expect(res.body.starred[0]).not.toHaveProperty('id');     // DB pk dropped per D7
    expect(res.body.starred[0]).not.toHaveProperty('userId'); // userId dropped per D7
  });

  it("filters wishlist rows whose library status is anything other than 'Wishlist' (i.e., really owned)", async () => {
    // 3 wishlisted rows in window. UserGames mock:
    //   igdbId=1 → status=Wishlist (auto-created by toggle, still on shelf) → KEEP
    //   igdbId=2 → status=Backlog (sync imported it OR user manually moved) → DROP
    //   igdbId=3 → no UserGame at all (legacy data, pre-backfill)            → KEEP
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      wishlistRow({ igdbId: 1, title: 'Auto-Wishlist UserGame' }),
      wishlistRow({ igdbId: 2, title: 'Owned (Backlog)' }),
      wishlistRow({ igdbId: 3, title: 'No UserGame' }),
    ]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      { id: 'ug-1', status: 'Wishlist', game: { igdbId: 1 } },
      { id: 'ug-2', status: 'Backlog',  game: { igdbId: 2 } },
    ]);
    mockGetRecentlyReleased.mockResolvedValue([]);

    const res = await request(app).get('/api/releases/recent');

    expect(res.status).toBe(200);
    expect(res.body.starred).toHaveLength(2);
    const ids = res.body.starred.map((r: { igdbId: number }) => r.igdbId);
    expect(ids).toEqual([1, 3]);

    // The kept Wishlist row carries its userGameId so the client can route
    // to /game/${userGameId} on tap. The legacy row (no UserGame) is null.
    const idsToUg = Object.fromEntries(
      res.body.starred.map((r: { igdbId: number; userGameId: string | null }) => [r.igdbId, r.userGameId]),
    );
    expect(idsToUg[1]).toBe('ug-1');
    expect(idsToUg[3]).toBeNull();

    // userGame query is scoped to the user AND only the wishlisted igdbIds
    const ugCall = (prisma.userGame.findMany as jest.Mock).mock.calls[0][0];
    expect(ugCall.where.userId).toBe('test-user-id');
    expect(ugCall.where.game.igdbId.in).toEqual([1, 2, 3]);
  });

  it('dedupes hyped against starred by igdbId', async () => {
    // igdbId=42 is in both lists — should appear in starred only.
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      wishlistRow({ igdbId: 42 }),
    ]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    mockGetRecentlyReleased.mockResolvedValue([
      igdbRow({ igdbId: 42, title: 'Same as starred' }),
      igdbRow({ igdbId: 99, title: 'Hype only' }),
    ]);

    const res = await request(app).get('/api/releases/recent');

    expect(res.status).toBe(200);
    expect(res.body.starred.map((r: { igdbId: number }) => r.igdbId)).toEqual([42]);
    expect(res.body.hyped.map((r: { igdbId: number }) => r.igdbId)).toEqual([99]);
  });

  it('queries IGDB with the 14-day backward window and minHype=80', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    mockGetRecentlyReleased.mockResolvedValue([]);

    await request(app).get('/api/releases/recent');

    const opts = mockGetRecentlyReleased.mock.calls[0][0];
    expect(opts.minHype).toBe(80);
    // 14-day span in unix seconds: toTs - fromTs ~= 14 * 86400 = 1209600.
    // Allow small clock drift between when the route computes `now` vs when
    // the test computes its expected value.
    const span = opts.toTs - opts.fromTs;
    expect(span).toBeGreaterThanOrEqual(14 * 86400 - 5);
    expect(span).toBeLessThanOrEqual(14 * 86400 + 5);
  });

  it('queries the wishlist table with a 14-day backward window scoped to the user', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    mockGetRecentlyReleased.mockResolvedValue([]);

    await request(app).get('/api/releases/recent');

    const where = (prisma.wishlistRelease.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.userId).toBe('test-user-id');

    const from = where.releaseDate.gte.getTime();
    const to = where.releaseDate.lte.getTime();
    const span = (to - from) / 1000;
    expect(span).toBeGreaterThanOrEqual(14 * 86400 - 5);
    expect(span).toBeLessThanOrEqual(14 * 86400 + 5);
  });

  it('still returns starred when IGDB throws — degrades gracefully', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      wishlistRow({ igdbId: 1, title: 'Mine' }),
    ]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    mockGetRecentlyReleased.mockRejectedValue(new Error('IGDB down'));

    const res = await request(app).get('/api/releases/recent');

    expect(res.status).toBe(200);
    expect(res.body.starred).toHaveLength(1);
    expect(res.body.hyped).toEqual([]);
  });

  it('returns empty lists when nothing qualifies', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    mockGetRecentlyReleased.mockResolvedValue([]);

    const res = await request(app).get('/api/releases/recent');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ starred: [], hyped: [] });
  });
});
