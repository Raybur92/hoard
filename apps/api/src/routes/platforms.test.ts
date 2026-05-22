import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    platform: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    platformLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    game: {
      upsert: jest.fn(),
    },
    userGame: {
      upsert: jest.fn(),
    },
    $queryRaw: jest.fn(),
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

import { app } from '../index';
import { prisma } from '@hoard/db';

const NPSSO_64 = 'A'.repeat(64);

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = jest.fn() as typeof global.fetch;
});

/* ── GET /api/platforms/status ── */

describe('GET /api/platforms/status', () => {
  it('returns an empty platforms array when the user has no connected platforms', async () => {
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/platforms/status');

    expect(res.status).toBe(200);
    expect(res.body.platforms).toEqual([]);
  });

  it('sets a short Cache-Control header (F8)', async () => {
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get('/api/platforms/status');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('returns mapped PlatformDetail entries for connected platforms', async () => {
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'plat-1',
        userId: 'test-user-id',
        code: 'ST',
        syncable: true,
        syncStatus: 'ok',
        lastSyncAt: new Date('2025-01-01'),
        credentials: { username: 'andreah' },
        createdAt: new Date(),
      },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ code: 'ST', count: 42 }]);

    const res = await request(app).get('/api/platforms/status');

    expect(res.status).toBe(200);
    expect(res.body.platforms).toHaveLength(1);
    expect(res.body.platforms[0].code).toBe('ST');
    expect(res.body.platforms[0].who).toBe('andreah');
    expect(res.body.platforms[0].connected).toBe(true);
    expect(res.body.platforms[0].syncStatus).toBe('ok');
  });
});

/* ── POST /api/platforms/psn/connect ── */

describe('POST /api/platforms/psn/connect', () => {
  it('returns 400 when the NPSSO token is shorter than 64 characters', async () => {
    const res = await request(app)
      .post('/api/platforms/psn/connect')
      .send({ npsso: 'tooshort' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/64 characters/);
  });

  it('returns 400 when the NPSSO token is longer than 64 characters', async () => {
    const res = await request(app)
      .post('/api/platforms/psn/connect')
      .send({ npsso: 'A'.repeat(65) });

    expect(res.status).toBe(400);
  });

  it('upserts the platform record and returns ok for a valid 64-character token', async () => {
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-ps-1' });

    const res = await request(app)
      .post('/api/platforms/psn/connect')
      .send({ npsso: NPSSO_64 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ code: 'PS', credentials: { npsso: NPSSO_64 } }),
      }),
    );
  });
});

/* ── POST /api/platforms/xbox/connect ── */

describe('POST /api/platforms/xbox/connect', () => {
  it('returns 400 for an API key shorter than 10 characters', async () => {
    const res = await request(app)
      .post('/api/platforms/xbox/connect')
      .send({ apiKey: 'short' });

    expect(res.status).toBe(400);
  });

  it('upserts the platform record and returns ok for a valid API key', async () => {
    (prisma.platform.upsert as jest.Mock).mockResolvedValue({ id: 'plat-xb-1' });

    const res = await request(app)
      .post('/api/platforms/xbox/connect')
      .send({ apiKey: 'valid-openxbl-key-here' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.platform.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ code: 'XB' }),
      }),
    );
  });
});

/* ── DELETE /api/platforms/:code ── */

describe('DELETE /api/platforms/:code', () => {
  it('returns 404 when no matching platform record exists', async () => {
    (prisma.platform.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const res = await request(app).delete('/api/platforms/st');

    expect(res.status).toBe(404);
  });

  it('deletes the platform record and returns ok', async () => {
    (prisma.platform.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await request(app).delete('/api/platforms/st');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.platform.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ code: 'ST' }) }),
    );
  });
});

/* ── GET /api/platforms/:code/log ── */

describe('GET /api/platforms/:code/log', () => {
  const sampleEntries = [
    { id: 'log-3', platformId: 'plat-1', userId: 'test-user-id', level: 'info', event: 'sync.ok', message: 'sync ok in 10.2s', details: { durationMs: 10234 }, createdAt: new Date('2026-05-08T17:55:19Z') },
    { id: 'log-2', platformId: 'plat-1', userId: 'test-user-id', level: 'info', event: 'library.imported', message: 'library: 488 imported, 4 skipped', details: { imported: 488, skipped: 4 }, createdAt: new Date('2026-05-08T17:55:14Z') },
    { id: 'log-1', platformId: 'plat-1', userId: 'test-user-id', level: 'info', event: 'sync.started', message: '// ST sync started', details: null, createdAt: new Date('2026-05-08T17:55:09Z') },
  ];

  it('returns 400 for an invalid platform code', async () => {
    const res = await request(app).get('/api/platforms/zz/log');
    expect(res.status).toBe(400);
  });

  it('returns 404 when the user has not connected this platform', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/platforms/st/log');
    expect(res.status).toBe(404);
  });

  it('returns mapped entries with createdAt as ISO and nextCursor=null when fewer than PAGE entries returned', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({ id: 'plat-1', userId: 'test-user-id', code: 'ST' });
    (prisma.platformLog.findMany as jest.Mock).mockResolvedValue(sampleEntries);

    const res = await request(app).get('/api/platforms/st/log');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.entries[0].id).toBe('log-3');
    expect(res.body.entries[0].createdAt).toBe('2026-05-08T17:55:19.000Z');
    expect(res.body.entries[0].details).toEqual({ durationMs: 10234 });
    // Fewer than PAGE entries means we drained.
    expect(res.body.nextCursor).toBeNull();
  });

  it('forwards the cursor query param to Prisma and returns nextCursor on full pages', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({ id: 'plat-1', userId: 'test-user-id', code: 'ST' });
    // Simulate a full 50-entry page.
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      ...sampleEntries[0]!,
      id: `log-${50 - i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    (prisma.platformLog.findMany as jest.Mock).mockResolvedValue(fullPage);

    const res = await request(app).get('/api/platforms/st/log?cursor=log-99');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(50);
    expect(res.body.nextCursor).toBe('log-1'); // last id in the page

    const findManyCall = (prisma.platformLog.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.cursor).toEqual({ id: 'log-99' });
    expect(findManyCall.skip).toBe(1);
    expect(findManyCall.take).toBe(50);
    expect(findManyCall.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(findManyCall.where).toEqual({ platformId: 'plat-1' });
  });
});

/* ── GET /api/platforms/:code/credentials ── */

describe('GET /api/platforms/:code/credentials', () => {
  it('returns 404 for an unsupported platform code', async () => {
    const res = await request(app).get('/api/platforms/zz/credentials');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a supported code that the user has not connected', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get('/api/platforms/ps/credentials');
    expect(res.status).toBe(404);
  });

  it('returns the npsso for PSN when the user has it stored', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'PS',
      credentials: { npsso: 'A'.repeat(64) },
    });
    const res = await request(app).get('/api/platforms/ps/credentials');
    expect(res.status).toBe(200);
    expect(res.body.npsso).toBe('A'.repeat(64));
    // Cache-Control: no-store so the credential never sits in browser cache.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns the steamId for Steam', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-2', userId: 'test-user-id', code: 'ST',
      credentials: { steamId: '76561197960287930', username: 'gabe' },
    });
    const res = await request(app).get('/api/platforms/st/credentials');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ steamId: '76561197960287930' });
    // Username should NOT leak through; only the credential field comes back.
    expect(res.body.username).toBeUndefined();
  });

  it('returns 404 when credentials column is null on the platform row', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-3', userId: 'test-user-id', code: 'PS',
      credentials: null,
    });
    const res = await request(app).get('/api/platforms/ps/credentials');
    expect(res.status).toBe(404);
  });
});

/* ── PATCH /api/platforms/:code ── */

describe('PATCH /api/platforms/:code', () => {
  it('returns 400 for an invalid platform code', async () => {
    const res = await request(app).patch('/api/platforms/zz').send({ syncFrequency: 'HOURLY' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid syncFrequency value', async () => {
    const res = await request(app).patch('/api/platforms/st').send({ syncFrequency: 'EVERY_NIGHT' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the platform is not connected', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).patch('/api/platforms/st').send({ syncFrequency: 'HOURLY' });
    expect(res.status).toBe(404);
  });

  it('updates syncFrequency and returns the mapped PlatformDetail', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'ST',
      syncable: true, syncStatus: 'ok', syncFrequency: 'HOURLY',
      lastSyncAt: new Date('2026-05-07T10:00:00Z'),
      credentials: { username: 'andrea' },
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'ST',
      syncable: true, syncStatus: 'ok', syncFrequency: 'FIVE_MIN',
      lastSyncAt: new Date('2026-05-07T10:00:00Z'),
      credentials: { username: 'andrea' },
    });

    const res = await request(app).patch('/api/platforms/st').send({ syncFrequency: 'FIVE_MIN' });

    expect(res.status).toBe(200);
    expect(res.body.syncFrequency).toBe('FIVE_MIN');
    expect(res.body.code).toBe('ST');
    expect(prisma.platform.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { syncFrequency: 'FIVE_MIN' } }),
    );
  });

  it('treats an empty body as a no-op and returns the current row', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1', userId: 'test-user-id', code: 'ST',
      syncable: true, syncStatus: 'ok', syncFrequency: 'HOURLY',
      lastSyncAt: null, credentials: null,
    });

    const res = await request(app).patch('/api/platforms/st').send({});

    expect(res.status).toBe(200);
    expect(res.body.syncFrequency).toBe('HOURLY');
    expect(prisma.platform.update).not.toHaveBeenCalled();
  });
});

/* ── POST /api/platforms/:code/sync ── */

describe('POST /api/platforms/:code/sync', () => {
  it('returns 400 for an unrecognised platform code', async () => {
    const res = await request(app).post('/api/platforms/zz/sync');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|unsupported/i);
  });

  it('returns 404 when the platform is not yet connected', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app).post('/api/platforms/st/sync');

    expect(res.status).toBe(404);
  });

  it('responds immediately with syncing status and updates the platform record', async () => {
    (prisma.platform.findUnique as jest.Mock).mockResolvedValue({
      id: 'plat-1',
      code: 'ST',
      syncable: true,
      credentials: { steamId: '76561198000000001' },
    });
    (prisma.platform.update as jest.Mock).mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ response: { games: [] } }),
    });

    const res = await request(app).post('/api/platforms/st/sync');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('syncing');
    expect(prisma.platform.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { syncStatus: 'syncing' } }),
    );
  });
});

/* ── POST /api/games/manual ── */

describe('POST /api/games/manual', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({ platformLabel: 'Nintendo' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an unrecognised status value', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({ igdbId: 1234, title: 'Metroid Prime', platformLabel: 'Nintendo', status: 'NotAStatus' });

    expect(res.status).toBe(400);
  });

  it('creates game + userGame records and returns 201 for a Nintendo manual add', async () => {
    const mockGame = { id: 'game-1', igdbId: 99999, title: 'Metroid Prime' };
    (prisma.game.upsert as jest.Mock).mockResolvedValue(mockGame);
    (prisma.userGame.upsert as jest.Mock).mockResolvedValue({ id: 'ug-1', gameId: 'game-1', userId: 'test-user-id' });

    const res = await request(app)
      .post('/api/games/manual')
      .send({ igdbId: 99999, title: 'Metroid Prime', platformLabel: 'Nintendo', status: 'Backlog' });

    expect(res.status).toBe(201);
    expect(res.body.igdbId).toBe(99999);
    expect(res.body.title).toBe('Metroid Prime');
    expect(res.body.platformLabel).toBe('Nintendo');
    expect(res.body.status).toBe('Backlog');
    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { igdbId: 99999 } }),
    );
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ playtimeByPlatform: { Nintendo: 0 } }),
      }),
    );
  });

  it('maps "On Hold" status to "OnHold" in the database write', async () => {
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-2', igdbId: 11111, title: 'Zelda' });
    (prisma.userGame.upsert as jest.Mock).mockResolvedValue({ id: 'ug-2', gameId: 'game-2', userId: 'test-user-id' });

    await request(app)
      .post('/api/games/manual')
      .send({ igdbId: 11111, title: 'Zelda', platformLabel: 'Nintendo', status: 'On Hold' });

    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'OnHold' }),
      }),
    );
  });

  // F1-PR2 collector-metadata fields per CM2 + CM12
  it('passes through mediaType + condition + region on the create path when provided', async () => {
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-3', igdbId: 22222, title: 'Pokémon Red' });
    (prisma.userGame.upsert as jest.Mock).mockResolvedValue({ id: 'ug-3', gameId: 'game-3', userId: 'test-user-id' });

    await request(app)
      .post('/api/games/manual')
      .send({
        igdbId: 22222,
        title: 'Pokémon Red',
        platformLabel: 'Game Boy',
        status: 'Backlog',
        mediaType: 'PHYSICAL',
        condition: 'LOOSE',
        region: 'PAL',
      });

    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'Backlog',
          mediaType: 'PHYSICAL',
          condition: 'LOOSE',
          region: 'PAL',
        }),
        update: expect.objectContaining({
          mediaType: 'PHYSICAL',
          condition: 'LOOSE',
          region: 'PAL',
        }),
      }),
    );
  });

  it('omits optional fields from upsert payload when not provided (avoids overwriting existing values with undefined)', async () => {
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-4', igdbId: 33333, title: 'Some Game' });
    (prisma.userGame.upsert as jest.Mock).mockResolvedValue({ id: 'ug-4', gameId: 'game-4', userId: 'test-user-id' });

    await request(app)
      .post('/api/games/manual')
      .send({ igdbId: 33333, title: 'Some Game', platformLabel: 'PC', status: 'Backlog' });

    const upsertCall = (prisma.userGame.upsert as jest.Mock).mock.calls[0]?.[0];
    expect(upsertCall.create).not.toHaveProperty('mediaType');
    expect(upsertCall.create).not.toHaveProperty('condition');
    expect(upsertCall.create).not.toHaveProperty('region');
    expect(upsertCall.create).not.toHaveProperty('wishlistedPlatforms');
    expect(upsertCall.update).not.toHaveProperty('mediaType');
    expect(upsertCall.update).not.toHaveProperty('condition');
    expect(upsertCall.update).not.toHaveProperty('region');
    expect(upsertCall.update).not.toHaveProperty('wishlistedPlatforms');
  });

  it('rejects invalid mediaType values (Zod schema enforces the 2-value enum)', async () => {
    const res = await request(app)
      .post('/api/games/manual')
      .send({
        igdbId: 44444, title: 'Bad Media', platformLabel: 'PC', status: 'Backlog',
        mediaType: 'PHYSICAL_DISC', // old 4-value enum value — no longer accepted
      });
    expect(res.status).toBe(400);
  });
});
