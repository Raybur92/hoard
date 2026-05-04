import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    wishlistRelease: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
}));

const mockGetGame = jest.fn();
jest.mock('../services/igdb', () => ({
  getGame: (...args: unknown[]) => mockGetGame(...args),
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
  mockGetGame.mockReset();
});

const makeRelease = (overrides: Partial<{ id: string; igdbId: number; title: string; platforms: string[] }> = {}) => ({
  id: overrides.id ?? 'w-1',
  userId: 'test-user-id',
  igdbId: overrides.igdbId ?? 1,
  title: overrides.title ?? 'Some Game',
  developer: 'Some Studio',
  releaseDate: new Date('2026-06-01'),
  releaseDateCategory: 'YYYY',
  platforms: overrides.platforms ?? ['STEAM', 'PSN'],
  genres: ['RPG'],
  hype: 10,
  synopsis: null,
  coverUrl: null,
});

describe('GET /api/upcoming', () => {
  it('returns the user\'s wishlisted releases', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      makeRelease({ id: 'w-1', title: 'Game A' }),
      makeRelease({ id: 'w-2', title: 'Game B' }),
    ]);

    const res = await request(app).get('/api/upcoming');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Game A');
  });

  it('filters by platform when ?platform=PS is provided', async () => {
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([
      makeRelease({ id: 'w-st', title: 'Steam Game', platforms: ['STEAM'] }),
      makeRelease({ id: 'w-ps', title: 'PSN Game', platforms: ['PSN'] }),
    ]);

    const res = await request(app).get('/api/upcoming?platform=PS');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('w-ps');
  });
});

describe('POST /api/upcoming/:igdbId/wishlist', () => {
  it('removes an existing wishlist entry and returns tracked: false', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(makeRelease({ id: 'w-1', igdbId: 42 }));
    (prisma.wishlistRelease.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/upcoming/42/wishlist');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: false });
    expect(prisma.wishlistRelease.delete).toHaveBeenCalledWith({ where: { id: 'w-1' } });
  });

  it('creates a new wishlist entry from IGDB metadata when none exists', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(null);
    mockGetGame.mockResolvedValue({
      igdbId: 99,
      title: 'New Game',
      developer: 'Studio',
      releaseYear: null,
      genres: ['Action'],
      coverUrl: 'https://example.com/cover.jpg',
    });
    (prisma.wishlistRelease.create as jest.Mock).mockResolvedValue(makeRelease({ id: 'w-new', igdbId: 99, title: 'New Game' }));

    const res = await request(app).post('/api/upcoming/99/wishlist');

    expect(res.status).toBe(200);
    expect(res.body.tracked).toBe(true);
    expect(res.body.release.title).toBe('New Game');
    expect(prisma.wishlistRelease.create).toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric igdbId', async () => {
    const res = await request(app).post('/api/upcoming/notanumber/wishlist');

    expect(res.status).toBe(400);
    expect(prisma.wishlistRelease.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when IGDB does not return the game', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(null);
    mockGetGame.mockResolvedValue(null);

    const res = await request(app).post('/api/upcoming/123456/wishlist');

    expect(res.status).toBe(404);
  });
});
