import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    platform: { findMany: jest.fn() },
    wishlistRelease: { findMany: jest.fn() },
    // userGame.findMany is used by the route's userGameMap helper to tag
    // each release with userGameId. Default returns [] (no UserGames) — fine
    // for tests that don't assert on userGameId.
    userGame: { findMany: jest.fn() },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = { id: 'test-user-id', status: 'ACTIVE', isAdmin: false };
    next();
  },
}));

const mockSearchGames = jest.fn();
const mockGetUpcomingReleases = jest.fn();
const mockPlatformCodesToIgdbIds = jest.fn();
jest.mock('../services/igdb', () => ({
  searchGames: (...args: unknown[]) => mockSearchGames(...args),
  getUpcomingReleases: (...args: unknown[]) => mockGetUpcomingReleases(...args),
  platformCodesToIgdbIds: (...args: unknown[]) => mockPlatformCodesToIgdbIds(...args),
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
  // Default to "no UserGames" so the route's userGameMap helper returns
  // an empty map. Per-test setups can override this when asserting on
  // userGameId tagging.
  (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
});

/* ── GET /api/igdb/search ── */

describe('GET /api/igdb/search', () => {
  it('returns IGDB search results for a valid query', async () => {
    mockSearchGames.mockResolvedValue([
      { igdbId: 1, title: 'Hollow Knight', developer: 'Team Cherry', releaseYear: 2017, genres: [], coverUrl: null },
    ]);

    const res = await request(app).get('/api/igdb/search?q=hollow');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Hollow Knight');
    expect(mockSearchGames).toHaveBeenCalledWith('hollow');
  });

  it('returns 400 when the query is missing or too short', async () => {
    const res1 = await request(app).get('/api/igdb/search');
    expect(res1.status).toBe(400);

    const res2 = await request(app).get('/api/igdb/search?q=a');
    expect(res2.status).toBe(400);
  });

  it('returns 503 when IGDB throws', async () => {
    mockSearchGames.mockRejectedValue(new Error('IGDB down'));

    const res = await request(app).get('/api/igdb/search?q=anything');

    expect(res.status).toBe(503);
  });
});

/* ── GET /api/igdb/upcoming ── */

describe('GET /api/igdb/upcoming', () => {
  it('merges IGDB upcoming results with the user\'s wishlist', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ hypeThreshold: 5 });
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([{ code: 'ST' }]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([{ igdbId: 100 }]);
    mockPlatformCodesToIgdbIds.mockReturnValue([6]);
    mockGetUpcomingReleases.mockResolvedValue([
      { igdbId: 100, title: 'Tracked', developer: 'X', genres: [], releaseDate: null, releaseDateCategory: 'TBA', platforms: [], coverUrl: null, synopsis: null, hype: 10, category: 0 },
      { igdbId: 200, title: 'Untracked', developer: 'Y', genres: [], releaseDate: null, releaseDateCategory: 'TBA', platforms: [], coverUrl: null, synopsis: null, hype: 8, category: 0 },
    ]);

    const res = await request(app).get('/api/igdb/upcoming');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.find((r: { igdbId: number }) => r.igdbId === 100).wishlisted).toBe(true);
    expect(res.body.find((r: { igdbId: number }) => r.igdbId === 200).wishlisted).toBe(false);
  });

  it('passes allPlatforms=true when scope=all', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ hypeThreshold: 5 });
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([{ code: 'ST' }]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);
    mockGetUpcomingReleases.mockResolvedValue([]);

    await request(app).get('/api/igdb/upcoming?scope=all');

    const call = mockGetUpcomingReleases.mock.calls[0][0];
    expect(call.allPlatforms).toBe(true);
    expect(call.platformIds).toEqual([]);
  });

  it('returns 503 when IGDB throws', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ hypeThreshold: 5 });
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);
    mockGetUpcomingReleases.mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/api/igdb/upcoming');

    expect(res.status).toBe(503);
  });

  it('scope=wishlist returns persisted WishlistRelease rows shaped as upcoming feed (PR B)', async () => {
    // Wishlist scope reads only from the DB — no IGDB call.
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      {
        igdbId: 42, title: 'Wishlisted Game', developer: 'Studio',
        releaseDate: new Date('2026-08-01'), releaseDateCategory: 'Q3',
        platforms: ['PlayStation 5'], genres: ['RPG'],
        coverUrl: 'https://example.com/cover.jpg', synopsis: 'epic',
        hype: 50, category: 0,
      },
    ]);

    const res = await request(app).get('/api/igdb/upcoming?scope=wishlist');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      igdbId: 42,
      title: 'Wishlisted Game',
      releaseDateCategory: 'Q3',
      platforms: ['PlayStation 5'],
      synopsis: 'epic',
      hype: 50,
      category: 0,
      wishlisted: true,
    });
    // Live IGDB feed is bypassed entirely.
    expect(mockGetUpcomingReleases).not.toHaveBeenCalled();
  });

  it('scope=wishlist passes through hype/platform filtering (no IGDB-side filters)', async () => {
    // A row with hype below the user's threshold + no platform should still
    // show up in wishlist scope — it's the user's explicit choice.
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      {
        igdbId: 1, title: 'Niche', developer: null,
        releaseDate: null, releaseDateCategory: 'TBA',
        platforms: [], genres: [], coverUrl: null, synopsis: null,
        hype: 0, category: 0,
      },
    ]);

    const res = await request(app).get('/api/igdb/upcoming?scope=wishlist');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
