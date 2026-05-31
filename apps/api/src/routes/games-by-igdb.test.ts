/**
 * GD-PR1 — route tests for the three new GameDetail v2 endpoints:
 *   - GET /api/games/by-igdb/:igdbId
 *   - GET /api/games/by-igdb/:igdbId/deals
 *   - GET /api/games/usergame/:id/igdb-id
 *
 * Mocks prisma at the module level (per Hard Rule #7). IGDB lazy fetch is
 * mocked via `getReleaseDetails` so tests stay offline + fast.
 */

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    game: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userGame: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    deal: {
      findMany: jest.fn(),
    },
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
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = {
      id: 'test-user-id',
      status: 'ACTIVE',
      isAdmin: false,
    };
    next();
  },
}));

jest.mock('../services/igdb', () => ({
  getGame: jest.fn(),
  getTimeToBeat: jest.fn().mockResolvedValue(null),
  getReleaseDetails: jest.fn(),
}));

jest.mock('../services/hltb', () => ({
  fetchHltbWithFallback: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/deals/affiliate', () => ({
  routeAffiliateUrl: (_shop: string, url: string) => url, // identity passthrough for tests
}));

import { app } from '../index';
import { prisma } from '@hoard/db';
import { getReleaseDetails } from '../services/igdb';

beforeEach(() => {
  jest.resetAllMocks();
});

const FUTURE_ISO = new Date(Date.now() + 365 * 86400000).toISOString();
const PAST_ISO = new Date('2024-01-01T00:00:00Z').toISOString();

function makeGame(overrides: Partial<{ id: string; igdbId: number; title: string }> = {}) {
  return {
    id: overrides.id ?? 'game-1',
    igdbId: overrides.igdbId ?? 1942,
    title: overrides.title ?? 'Hollow Knight',
    developer: 'Team Cherry',
    releaseYear: 2017,
    genres: ['Platformer'],
    themes: [],
    playerPerspectives: [],
    coverUrl: null,
    heroImageUrl: null,
    steamAppId: 367520,
    gogAppId: null,
    psnConceptId: null,
    xboxTitleId: null,
    epicCatalogItemId: null,
    nintendoTitleId: null,
    itchGameId: null,
    hltbId: null,
    psnNpCommunicationId: null,
    metadata: null,
  };
}

function makeIgdbRelease(future: boolean) {
  return {
    igdbId: 1942,
    title: 'Hollow Knight',
    developer: 'Team Cherry',
    releaseDate: future ? FUTURE_ISO : PAST_ISO,
    releaseDateCategory: 'YearMonthDay' as const,
    platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
    genres: ['Platformer'],
    themes: [],
    playerPerspectives: [],
    coverUrl: null,
    heroImageUrl: null,
    synopsis: 'A 2D action-adventure.',
    wishlisted: false,
    category: 0,
    hype: null,
    userGameId: null,
    wishlistedPlatforms: [],
  };
}

function makeUserGameRow(status: string) {
  return {
    id: 'ug-1',
    userId: 'test-user-id',
    gameId: 'game-1',
    status,
    playtimeByPlatform: {},
    lastPlayedAt: null,
    notes: null,
    rating: null,
    achievementsByPlatform: {},
    mediaType: null,
    condition: null,
    region: null,
    wishlistedPlatforms: [],
    addedAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    game: { ...makeGame(), hltbData: null },
  };
}

describe('GET /api/games/by-igdb/:igdbId (GD-PR1)', () => {
  it('returns S1 when no UserGame + past release', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    (getReleaseDetails as jest.Mock).mockResolvedValue(makeIgdbRelease(false));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('S1');
    expect(res.body.userGame).toBeNull();
    expect(res.body.game.igdbId).toBe(1942);
    expect(res.body.game.synopsis).toBe('A 2D action-adventure.');
    expect(res.body.game.platforms).toEqual(['PC (Microsoft Windows)', 'Nintendo Switch']);
  });

  it('returns S2 when no UserGame + future release', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    (getReleaseDetails as jest.Mock).mockResolvedValue(makeIgdbRelease(true));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('S2');
  });

  it('returns S3 when UserGame status=Playing', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGameRow('Playing'));
    (getReleaseDetails as jest.Mock).mockResolvedValue(makeIgdbRelease(false));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('S3');
    expect(res.body.userGame).not.toBeNull();
    expect(res.body.userGame.status).toBe('Playing');
  });

  it('returns S4 when UserGame status=Completed', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGameRow('Completed'));
    (getReleaseDetails as jest.Mock).mockResolvedValue(makeIgdbRelease(false));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('S4');
  });

  it('returns S2 when UserGame status=Wishlist + future release (anticipation framing)', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGameRow('Wishlist'));
    (getReleaseDetails as jest.Mock).mockResolvedValue(makeIgdbRelease(true));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('S2');
  });

  it('returns S3 when UserGame status=Wishlist + past release (library citizen per OQ-GD-12)', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGameRow('Wishlist'));
    (getReleaseDetails as jest.Mock).mockResolvedValue(makeIgdbRelease(false));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('S3');
  });

  it('400 on non-numeric igdbId', async () => {
    const res = await request(app).get('/api/games/by-igdb/notanumber');
    expect(res.status).toBe(400);
  });

  it('404 when Game row does not exist', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/games/by-igdb/9999999');
    expect(res.status).toBe(404);
  });

  it('degrades gracefully when IGDB throws (no synopsis, S1 fallback)', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(makeGame());
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    (getReleaseDetails as jest.Mock).mockRejectedValue(new Error('IGDB down'));

    const res = await request(app).get('/api/games/by-igdb/1942');
    expect(res.status).toBe(200);
    // No releaseDate from IGDB → treated as already-out → S1
    expect(res.body.state).toBe('S1');
    expect(res.body.game.synopsis).toBeNull();
    expect(res.body.game.platforms).toEqual([]);
  });
});

describe('GET /api/games/by-igdb/:igdbId/deals (GD-PR1)', () => {
  it('returns empty deals array when no deals exist (not 404)', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      title: 'Hollow Knight',
      coverUrl: null,
      heroImageUrl: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ marketCode: 'AT' });
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.deal.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/games/by-igdb/1942/deals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ igdbId: 1942, marketCode: 'AT', deals: [] });
  });

  it('returns mapped DealRow array when deals exist', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      title: 'Hollow Knight',
      coverUrl: 'cover-url',
      heroImageUrl: 'hero-url',
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ marketCode: 'AT' });
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue({
      status: 'Backlog',
      wishlistedPlatforms: [],
    });
    (prisma.deal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'deal-1',
        gameId: 'game-1',
        shopId: '16',
        shopName: 'Epic Game Store',
        isReseller: false,
        currentPrice: 20.99,
        originalPrice: 59.99,
        currency: 'EUR',
        discountPct: 65,
        dealUrl: 'https://itad.link/foo',
        voucher: null,
        expiresAt: null,
        storeLow: 20.99,
        isHistoricalLow: true,
        isTrendingDown: false,
        fetchedAt: new Date('2026-05-31T00:00:00Z'),
      },
    ]);

    const res = await request(app).get('/api/games/by-igdb/1942/deals');
    expect(res.status).toBe(200);
    expect(res.body.deals).toHaveLength(1);
    expect(res.body.deals[0].shopName).toBe('Epic Game Store');
    expect(res.body.deals[0].discountPct).toBe(65);
    expect(res.body.deals[0].isWishlisted).toBe(false);
    expect(res.body.deals[0].gameTitle).toBe('Hollow Knight');
  });

  it('isWishlisted=true when UserGame.status=Wishlist', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      title: 'Hollow Knight',
      coverUrl: null,
      heroImageUrl: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ marketCode: 'AT' });
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue({
      status: 'Wishlist',
      wishlistedPlatforms: [],
    });
    (prisma.deal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'deal-1',
        gameId: 'game-1',
        shopId: '61',
        shopName: 'Steam',
        isReseller: false,
        currentPrice: 14.99,
        originalPrice: 14.99,
        currency: 'EUR',
        discountPct: 0,
        dealUrl: 'https://store.steampowered.com/app/367520',
        voucher: null,
        expiresAt: null,
        storeLow: null,
        isHistoricalLow: false,
        isTrendingDown: false,
        fetchedAt: new Date(),
      },
    ]);

    const res = await request(app).get('/api/games/by-igdb/1942/deals');
    expect(res.status).toBe(200);
    expect(res.body.deals[0].isWishlisted).toBe(true);
  });

  it('isWishlisted=true when UserGame.wishlistedPlatforms is non-empty (CM12)', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      title: 'Hollow Knight',
      coverUrl: null,
      heroImageUrl: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ marketCode: 'AT' });
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue({
      status: 'Backlog',
      wishlistedPlatforms: ['NT'],
    });
    (prisma.deal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'deal-1',
        gameId: 'game-1',
        shopId: '61',
        shopName: 'Steam',
        isReseller: false,
        currentPrice: 14.99,
        originalPrice: 14.99,
        currency: 'EUR',
        discountPct: 0,
        dealUrl: 'https://store.steampowered.com/app/367520',
        voucher: null,
        expiresAt: null,
        storeLow: null,
        isHistoricalLow: false,
        isTrendingDown: false,
        fetchedAt: new Date(),
      },
    ]);

    const res = await request(app).get('/api/games/by-igdb/1942/deals');
    expect(res.status).toBe(200);
    expect(res.body.deals[0].isWishlisted).toBe(true);
  });

  it('falls back to US when no marketCode set', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      title: 'Hollow Knight',
      coverUrl: null,
      heroImageUrl: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ marketCode: null });
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.deal.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/games/by-igdb/1942/deals');
    expect(res.status).toBe(200);
    expect(res.body.marketCode).toBe('US');
  });

  it('404 when Game row does not exist', async () => {
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/games/by-igdb/9999999/deals');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/games/usergame/:id/igdb-id (GD-PR1)', () => {
  it('returns { igdbId } when UserGame exists + belongs to user', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue({
      game: { igdbId: 1942 },
    });
    const res = await request(app).get('/api/games/usergame/ug-1/igdb-id');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ igdbId: 1942 });
  });

  it('404 when UserGame does not exist', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/games/usergame/nonexistent/igdb-id');
    expect(res.status).toBe(404);
  });

  it('scopes by userId — does not return UserGames belonging to other users', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    await request(app).get('/api/games/usergame/ug-1/igdb-id');
    expect(prisma.userGame.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ug-1', userId: 'test-user-id' },
      }),
    );
  });
});
