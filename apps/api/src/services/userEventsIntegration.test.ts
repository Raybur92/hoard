// TL1.2 sampled touchpoint integration tests. Verifies the wiring at 3
// touchpoints — sync.first, wishlist.toggled, error.surfaced — without
// re-exercising the helper itself (Andrea's "testing all 8 is testing
// the helper twice" rule). The `userEvents` module is mocked so we can
// spy on `logEvent` call shape; the helper's internals are covered by
// the dedicated unit tests in `userEvents.test.ts`.

jest.mock('dotenv/config', () => ({}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// Mock the helper so we can spy on call shape from the touchpoint sites.
jest.mock('./userEvents', () => ({
  logEvent: jest.fn(),
}));

jest.mock('@hoard/db', () => ({
  prisma: {
    platform: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    wishlistRelease: {
      findFirst: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    game: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userGame: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Stub the sync chain so the void-IIFE in /platforms/:code/sync drains
// quickly. The 3rd sync.first test wants the IIFE to reach its
// `await logEvent(... 'sync.first' ...)` call after a handful of
// microtask flushes — making each step a fast resolve keeps the test
// deterministic.
jest.mock('../services/platforms/steam', () => ({
  syncSteamLibrary: jest.fn(),
  getSteamWishlist: jest.fn(),
}));
jest.mock('../services/platforms/psn', () => ({
  syncPsnLibrary: jest.fn().mockResolvedValue([]),
  getPsnTrophyTitles: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/platforms/steamAchievements', () => ({
  triggerSteamAchievementsBackground: jest.fn(),
}));
jest.mock('../services/syncRunner', () => ({
  runSync: jest.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
}));
jest.mock('../services/trophies', () => ({
  applyPsnTrophyAggregates: jest.fn().mockResolvedValue({ matched: 0, autoCompleted: 0, missed: 0 }),
}));
jest.mock('../services/wishlistImport', () => ({
  applySteamWishlistImport: jest.fn(),
}));
jest.mock('../services/platformLog', () => ({
  logPlatform: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/igdb', () => ({
  getReleaseDetails: jest.fn(),
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'user-1';
    next();
  },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = 'user-1';
    next();
  },
}));

jest.mock('../middleware/active', () => ({
  requireActive: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; status: 'ACTIVE'; isAdmin: boolean } }).user = {
      id: 'user-1', status: 'ACTIVE', isAdmin: false,
    };
    next();
  },
}));

import { app } from '../index';
import { prisma } from '@hoard/db';
import { logEvent } from './userEvents';
import { getReleaseDetails } from '../services/igdb';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TL1.2 touchpoint integration — wishlist.toggled', () => {
  it('fires wishlist.toggled with { igdbId, action: "remove" } on un-star', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue({ id: 'wr-1', userId: 'user-1', igdbId: 12345 });
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({ id: 'g-1' });
    (prisma.userGame.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.wishlistRelease.delete as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/upcoming/12345/wishlist');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracked: false });
    expect(logEvent).toHaveBeenCalledWith('user-1', 'wishlist.toggled', { igdbId: 12345, action: 'remove' });
  });

  it('fires wishlist.toggled with { igdbId, action: "add" } on star', async () => {
    (prisma.wishlistRelease.findFirst as jest.Mock).mockResolvedValue(null);
    (getReleaseDetails as jest.Mock).mockResolvedValue({
      igdbId: 12345,
      title: 'Test Game',
      developer: 'Test Dev',
      releaseDate: '2026-12-01T00:00:00.000Z',
      releaseDateCategory: 'exact',
      platforms: ['PC'],
      genres: ['RPG'],
      coverUrl: null,
      synopsis: null,
      hype: 10,
      category: 0,
    });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        game: { upsert: jest.fn().mockResolvedValue({ id: 'g-1', igdbId: 12345 }) },
        userGame: { upsert: jest.fn().mockResolvedValue({}) },
        wishlistRelease: { create: jest.fn().mockResolvedValue({
          id: 'wr-1', userId: 'user-1', igdbId: 12345, title: 'Test Game',
          developer: 'Test Dev', releaseDate: new Date('2026-12-01'),
          releaseDateCategory: 'exact', platforms: ['PC'], genres: ['RPG'],
          hype: 10, synopsis: null, coverUrl: null, category: 0,
        }) },
      }),
    );

    const res = await request(app).post('/api/upcoming/12345/wishlist');

    expect(res.status).toBe(200);
    expect(res.body.tracked).toBe(true);
    expect(logEvent).toHaveBeenCalledWith('user-1', 'wishlist.toggled', { igdbId: 12345, action: 'add' });
  });
});

describe('TL1.2 touchpoint integration — error.surfaced', () => {
  // The error middleware is exported directly because Express 4's async
  // handler rejections don't reach app.use((err, ...)) without
  // express-async-errors. Invoking the middleware directly gives a clean
  // assertion surface — same behaviour, no HTTP/timeout flakiness.
  it('fires error.surfaced with route/errorClass/status/message (+ requestId when present)', async () => {
    const { globalErrorHandler } = await import('../index');

    const err = Object.assign(new Error('database connection refused'), {
      name: 'PrismaConnectionError',
    });
    const req = {
      userId: 'user-1',
      originalUrl: '/api/upcoming/77/wishlist',
      id: 'req-abc',
      headers: {},
      log: { error: jest.fn() },
    } as unknown as Parameters<typeof globalErrorHandler>[1];
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Parameters<typeof globalErrorHandler>[2];
    const next = jest.fn() as Parameters<typeof globalErrorHandler>[3];

    globalErrorHandler(err, req, res, next);
    // logEvent is void-called; let the microtask flush.
    await new Promise((r) => setImmediate(r));

    expect(logEvent).toHaveBeenCalledWith(
      'user-1',
      'error.surfaced',
      {
        route: '/api/upcoming/77/wishlist',
        errorClass: 'PrismaConnectionError',
        status: 500,
        message: 'database connection refused',
        requestId: 'req-abc',
      },
    );
  });

  it('does NOT fire error.surfaced when req.userId is missing (anonymous error)', async () => {
    const { globalErrorHandler } = await import('../index');

    const err = new Error('boom');
    const req = {
      originalUrl: '/api/anonymous',
      headers: {},
      log: { error: jest.fn() },
    } as unknown as Parameters<typeof globalErrorHandler>[1];
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Parameters<typeof globalErrorHandler>[2];
    const next = jest.fn() as Parameters<typeof globalErrorHandler>[3];

    globalErrorHandler(err, req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe('TL1.2 touchpoint integration — sync.first', () => {
  it('fires sync.first with { code, gamesImported } when Platform.lastSyncAt was null pre-sync', async () => {
    // Pre-sync platform with lastSyncAt: null → wasFirstSync = true.
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'user-1', code: 'PS',
      credentials: { npsso: 'x'.repeat(64) },
      syncable: true,
      lastSyncAt: null,
      syncStatus: 'manual',
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/platforms/PS/sync');
    expect(res.status).toBe(200);

    // The route responds immediately while the void-IIFE continues
    // asynchronously. Drain microtasks until the sync.first call lands
    // (or give up after a safety budget — the IIFE has ~8 awaits).
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setImmediate(r));
      if ((logEvent as jest.Mock).mock.calls.some(([, ev]) => ev === 'sync.first')) break;
    }

    expect(logEvent).toHaveBeenCalledWith('user-1', 'sync.first', { code: 'PS', gamesImported: 0 });
  });

  it('does NOT fire sync.first when Platform.lastSyncAt was already set (re-sync)', async () => {
    // Pre-sync platform with non-null lastSyncAt → wasFirstSync = false.
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'user-1', code: 'PS',
      credentials: { npsso: 'x'.repeat(64) },
      syncable: true,
      lastSyncAt: new Date('2026-05-01T00:00:00.000Z'),
      syncStatus: 'ok',
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({});

    const res = await request(app).post('/api/platforms/PS/sync');
    expect(res.status).toBe(200);

    // Drain the IIFE same as above.
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setImmediate(r));
    }

    const syncFirstCalls = (logEvent as jest.Mock).mock.calls.filter(([, ev]) => ev === 'sync.first');
    expect(syncFirstCalls).toHaveLength(0);
  });
});
