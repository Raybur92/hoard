import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// Mock Prisma. The toggle endpoint now writes through `prisma.$transaction`
// so the mock has to invoke the callback with itself, exposing all of the
// Game / UserGame / WishlistRelease methods inside the tx scope.
jest.mock('@hoard/db', () => {
  const mock: Record<string, unknown> = {
    wishlistRelease: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    game: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userGame: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: typeof mock) => Promise<unknown>) => cb(mock)),
  };
  return { prisma: mock };
});

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

const mockGetReleaseDetails = jest.fn();
jest.mock('../services/igdb', () => ({
  getReleaseDetails: (...args: unknown[]) => mockGetReleaseDetails(...args),
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  // `clearAllMocks` (NOT `resetAllMocks`) — we set the `$transaction` mock
  // implementation in the module factory above. resetAllMocks would wipe
  // it out and the callback would never fire, so the release returned to
  // mapRelease would be undefined and the test would crash with a confusing
  // "Cannot read properties of undefined" inside mapRelease.
  jest.clearAllMocks();
  mockGetReleaseDetails.mockReset();
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
  category: 0,
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

describe('POST /api/upcoming/:igdbId/wishlist — un-star branch', () => {
  it('drops both the WishlistRelease AND the auto-created Wishlist UserGame', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(makeRelease({ id: 'w-1', igdbId: 42 }));
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({ id: 'g-42' });
    (prisma.userGame.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.wishlistRelease.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/upcoming/42/wishlist');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: false });
    expect(prisma.wishlistRelease.delete).toHaveBeenCalledWith({ where: { id: 'w-1' } });
    // UserGame is only deleted when its status is still 'Wishlist'.
    expect(prisma.userGame.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'test-user-id', gameId: 'g-42', status: 'Wishlist' },
    });
  });

  it("leaves the UserGame alone when the user has manually moved it off the Wishlist shelf", async () => {
    // The UserGame exists but has status='Backlog' (user moved it).
    // deleteMany with status: 'Wishlist' filter returns count: 0 — exactly
    // what we want. We're asserting the WHERE clause is correct so the
    // UserGame can never be unintentionally clobbered.
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(makeRelease({ id: 'w-1', igdbId: 42 }));
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({ id: 'g-42' });
    (prisma.userGame.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.wishlistRelease.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/upcoming/42/wishlist');

    expect(res.status).toBe(200);
    const args = (prisma.userGame.deleteMany as jest.Mock).mock.calls[0][0];
    expect(args.where.status).toBe('Wishlist'); // never delete a non-Wishlist UserGame
  });

  it('still un-stars cleanly when no Game catalog row exists yet (legacy data)', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(makeRelease({ id: 'w-1', igdbId: 42 }));
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.wishlistRelease.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/upcoming/42/wishlist');

    expect(res.status).toBe(200);
    expect(prisma.userGame.deleteMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/upcoming/:igdbId/wishlist — star branch', () => {
  it('upserts Game, upserts UserGame(Wishlist), and creates the WishlistRelease in one transaction', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(null);
    mockGetReleaseDetails.mockResolvedValue({
      igdbId: 99,
      title: 'New Game',
      developer: 'Studio',
      releaseDate: '2026-06-01T00:00:00.000Z',
      releaseDateCategory: 'Q2',
      platforms: ['PC (Microsoft Windows)', 'PlayStation 5'],
      genres: ['Action'],
      coverUrl: 'https://example.com/cover.jpg',
      synopsis: 'An action game.',
      wishlisted: false,
      category: 0,
      hype: 42,
    });
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'g-99', igdbId: 99 });
    (prisma.userGame.upsert as jest.Mock).mockResolvedValue({ id: 'ug-99', userId: 'test-user-id', gameId: 'g-99', status: 'Wishlist' });
    (prisma.wishlistRelease.create as jest.Mock).mockResolvedValue(makeRelease({ id: 'w-new', igdbId: 99, title: 'New Game' }));

    const res = await request(app).post('/api/upcoming/99/wishlist');

    expect(res.status).toBe(200);
    expect(res.body.tracked).toBe(true);
    expect(res.body.release.title).toBe('New Game');

    // Transaction wraps all three writes.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Game upserted with the IGDB metadata, releaseYear derived.
    const gameArgs = (prisma.game.upsert as jest.Mock).mock.calls[0][0];
    expect(gameArgs.where).toEqual({ igdbId: 99 });
    expect(gameArgs.create).toMatchObject({
      igdbId: 99, title: 'New Game', developer: 'Studio',
      releaseYear: 2026, genres: ['Action'],
    });

    // UserGame upserted with status='Wishlist' on create; empty update so
    // we never override a manually-set status.
    const ugArgs = (prisma.userGame.upsert as jest.Mock).mock.calls[0][0];
    expect(ugArgs.where).toEqual({ userId_gameId: { userId: 'test-user-id', gameId: 'g-99' } });
    expect(ugArgs.create).toEqual({ userId: 'test-user-id', gameId: 'g-99', status: 'Wishlist' });
    expect(ugArgs.update).toEqual({});

    // WishlistRelease still captures the full IGDB shape (PR B persistence fix).
    const wlArgs = (prisma.wishlistRelease.create as jest.Mock).mock.calls[0][0].data;
    expect(wlArgs).toMatchObject({
      igdbId: 99, title: 'New Game', releaseDateCategory: 'Q2',
      platforms: ['PC (Microsoft Windows)', 'PlayStation 5'],
      synopsis: 'An action game.', hype: 42, category: 0,
    });
    expect(wlArgs.releaseDate).toEqual(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('returns 400 for a non-numeric igdbId', async () => {
    const res = await request(app).post('/api/upcoming/notanumber/wishlist');

    expect(res.status).toBe(400);
    expect(prisma.wishlistRelease.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when IGDB does not return the game', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(null);
    mockGetReleaseDetails.mockResolvedValue(null);

    const res = await request(app).post('/api/upcoming/123456/wishlist');

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
