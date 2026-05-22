import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    game: {
      upsert: jest.fn(),
    },
    hltbData: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
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

jest.mock('../services/hltb', () => ({
  fetchHltbWithFallback: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/igdb', () => ({
  getTimeToBeat: jest.fn().mockResolvedValue(null),
  getGame: jest.fn(),
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
});

const makeUserGame = (overrides: Partial<{ id: string; status: string; title: string; igdbId: number }> = {}) => ({
  id: overrides.id ?? 'ug-1',
  userId: 'test-user-id',
  gameId: 'game-1',
  status: overrides.status ?? 'Backlog',
  playtimeByPlatform: { ST: 120 } as Record<string, number>,
  lastPlayedAt: new Date('2025-01-01'),
  notes: null,
  rating: null,
  addedAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  game: {
    id: 'game-1',
    igdbId: overrides.igdbId ?? 1942,
    title: overrides.title ?? 'Hollow Knight',
    developer: 'Team Cherry',
    releaseYear: 2017,
    genres: ['Platformer'],
    coverUrl: null,
    steamAppId: null,
    hltbData: null,
  },
});

/* ── GET /api/games ── */

describe('GET /api/games', () => {
  it('returns a paginated list of the user\'s games', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([makeUserGame()]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(1);

    const res = await request(app).get('/api/games');

    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.games[0].game.title).toBe('Hollow Knight');
    expect(res.body.games[0].status).toBe('Backlog');
  });

  it('filters by status when ?status=Backlog is provided', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([makeUserGame({ status: 'Backlog' })]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(1);

    const res = await request(app).get('/api/games?status=Backlog');

    expect(res.status).toBe(200);
    expect((prisma.userGame.findMany as jest.Mock).mock.calls[0][0].where.status).toBe('Backlog');
  });

  it('maps "On Hold" status to Prisma "OnHold" enum value', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);

    await request(app).get('/api/games?status=On%20Hold');

    expect((prisma.userGame.findMany as jest.Mock).mock.calls[0][0].where.status).toBe('OnHold');
  });

  it('paginates correctly with ?page=2&limit=5', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(12);

    const res = await request(app).get('/api/games?page=2&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
    expect(res.body.total).toBe(12);
    expect(res.body.hasMore).toBe(true); // 2*5=10 < 12
    expect((prisma.userGame.findMany as jest.Mock).mock.calls[0][0].skip).toBe(5);
    expect((prisma.userGame.findMany as jest.Mock).mock.calls[0][0].take).toBe(5);
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app).get('/api/games?status=Bogus');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when limit exceeds the maximum', async () => {
    const res = await request(app).get('/api/games?limit=99999');

    expect(res.status).toBe(400);
  });

  it('passes the search query through as a case-insensitive title contains filter', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);

    await request(app).get('/api/games?q=hollow');

    const call = (prisma.userGame.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.game.title.contains).toBe('hollow');
    expect(call.where.game.title.mode).toBe('insensitive');
  });

  it('post-filters results by platform code', async () => {
    const onSteam = makeUserGame({ id: 'ug-st' });
    onSteam.playtimeByPlatform = { ST: 100 };
    const onPsn = makeUserGame({ id: 'ug-ps' });
    onPsn.playtimeByPlatform = { PS: 50 } as Record<string, number>;
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([onSteam, onPsn]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(2);

    const res = await request(app).get('/api/games?platform=ST');

    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(1);
    expect(res.body.games[0].id).toBe('ug-st');
  });
});

/* ── GET /api/games/counts ── */

describe('GET /api/games/counts', () => {
  it('returns per-status counts and remaps OnHold → "On Hold"', async () => {
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([
      { status: 'Playing', _count: { status: 3 } },
      { status: 'OnHold', _count: { status: 2 } },
      { status: 'Backlog', _count: { status: 17 } },
    ]);

    const res = await request(app).get('/api/games/counts');

    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ Playing: 3, 'On Hold': 2, Backlog: 17 });
  });

  it('sets a short Cache-Control header (F8)', async () => {
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get('/api/games/counts');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=10');
  });
});

/* ── GET /api/games/shelves ── */

describe('GET /api/games/shelves (F6)', () => {
  it('returns up to perStatus games per shelf plus full counts', async () => {
    // Post-F1-PR2 (CM12 + CM13): non-Wishlist shelves still use the
    // narrow `where.status` filter; the Wishlist shelf uses an OR
    // condition (status='Wishlist' OR wishlistedPlatforms non-empty)
    // so the mock detection branches on which shape the Prisma call
    // is using.
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockImplementation((args: { where: { status?: string; OR?: unknown } }) => {
      if (args.where.OR)                      return Promise.resolve([makeUserGame({ id: 'w1', status: 'Wishlist' })]);
      if (args.where.status === 'Playing')   return Promise.resolve([makeUserGame({ id: 'p1', status: 'Playing' })]);
      if (args.where.status === 'Backlog')   return Promise.resolve([makeUserGame({ id: 'b1', status: 'Backlog' }), makeUserGame({ id: 'b2', status: 'Backlog' })]);
      if (args.where.status === 'Completed') return Promise.resolve([]);
      if (args.where.status === 'OnHold')    return Promise.resolve([makeUserGame({ id: 'h1', status: 'OnHold' })]);
      if (args.where.status === 'Dropped')   return Promise.resolve([]);
      return Promise.resolve([]);
    });
    // The widened Wishlist count() query (status='Wishlist' OR wishlistedPlatforms non-empty).
    (prisma.userGame.count as jest.Mock).mockResolvedValue(1);
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([
      { status: 'Playing',  _count: { status: 1 } },
      { status: 'Backlog',  _count: { status: 200 } },
      { status: 'OnHold',   _count: { status: 1 } },
      { status: 'Wishlist', _count: { status: 1 } },
    ]);

    const res = await request(app).get('/api/games/shelves?perStatus=8');

    expect(res.status).toBe(200);
    expect(res.body.shelves.Playing).toHaveLength(1);
    expect(res.body.shelves.Backlog).toHaveLength(2);
    expect(res.body.shelves.Completed).toEqual([]);
    expect(res.body.shelves['On Hold']).toHaveLength(1); // OnHold remapped
    expect(res.body.shelves.Dropped).toEqual([]);
    expect(res.body.shelves.Wishlist).toHaveLength(1);
    expect(res.body.counts).toEqual({ Playing: 1, Backlog: 200, 'On Hold': 1, Wishlist: 1 });
  });

  it('respects the perStatus take parameter on each shelf query', async () => {
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/games/shelves?perStatus=4');

    // Post-F1-PR2: 5 non-Wishlist status findMany + 1 Wishlist OR findMany = 6 calls total.
    expect(findManyMock).toHaveBeenCalledTimes(6);
    for (const call of findManyMock.mock.calls) {
      expect(call[0].take).toBe(4);
    }
  });

  it('defaults perStatus to 12 when omitted', async () => {
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/games/shelves');

    expect(findManyMock).toHaveBeenCalledTimes(6);
    expect(findManyMock.mock.calls[0]?.[0].take).toBe(12);
  });

  it('rejects perStatus > 50', async () => {
    const res = await request(app).get('/api/games/shelves?perStatus=200');
    expect(res.status).toBe(400);
  });

  it('orders Wishlist by addedAt and other shelves by lastPlayedAt', async () => {
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/games/shelves?perStatus=5');

    const calls = findManyMock.mock.calls;
    // Post-F1-PR2 (CM12): Wishlist findMany identifies via the OR condition
    // (status='Wishlist' OR wishlistedPlatforms non-empty) rather than a
    // plain status filter. Other shelves still use status= directly.
    const wishlistCall = calls.find((c) => !!c[0].where.OR);
    const backlogCall = calls.find((c) => c[0].where.status === 'Backlog');
    expect(wishlistCall?.[0].orderBy).toEqual({ addedAt: 'desc' });
    expect(backlogCall?.[0].orderBy).toEqual({ lastPlayedAt: 'desc' });
  });

  // F1-PR2 / CM12 + CM13: Wishlist shelf includes per-platform-wishlist entries
  it('Wishlist shelf includes UserGames where wishlistedPlatforms non-empty (GTA case)', async () => {
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockImplementation((args: { where: { status?: string; OR?: unknown } }) => {
      // The Wishlist OR query — return both a global-Wishlist row AND a
      // partially-wishlisted-on-owned-game row to verify the OR captures both.
      if (args.where.OR) {
        return Promise.resolve([
          makeUserGame({ id: 'w-global', status: 'Wishlist' }),
          // GTA case: status=Backlog (own on PS5), wishlistedPlatforms=['PC']
          makeUserGame({ id: 'w-partial', status: 'Backlog' }),
        ]);
      }
      return Promise.resolve([]);
    });
    // Widened count returns 2 (the global + the partial).
    (prisma.userGame.count as jest.Mock).mockResolvedValue(2);
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([
      { status: 'Backlog',  _count: { status: 5 } },
      { status: 'Wishlist', _count: { status: 1 } }, // only the global-Wishlist row counts here
    ]);

    const res = await request(app).get('/api/games/shelves?perStatus=12');

    expect(res.status).toBe(200);
    expect(res.body.shelves.Wishlist).toHaveLength(2);
    // counts.Wishlist is the WIDENED count (2), not the groupBy-derived 1
    expect(res.body.counts.Wishlist).toBe(2);
    // Backlog count from groupBy unchanged
    expect(res.body.counts.Backlog).toBe(5);
  });
});

/* ── GET /api/games — limit cap ── */

describe('GET /api/games — limit cap (F6)', () => {
  it('rejects limit > 500', async () => {
    const res = await request(app).get('/api/games?limit=2000');
    expect(res.status).toBe(400);
  });

  it('accepts limit = 500', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);
    const res = await request(app).get('/api/games?limit=500');
    expect(res.status).toBe(200);
  });
});

/* ── GET /api/games/:id ── */

describe('GET /api/games/:id', () => {
  it('returns the requested game when it belongs to the user', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame({ id: 'ug-42' }));

    const res = await request(app).get('/api/games/ug-42');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('ug-42');
  });

  it('returns 404 when the game does not exist for this user', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app).get('/api/games/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

/* ── PATCH /api/games/:id ── */

describe('PATCH /api/games/:id', () => {
  it('updates the status of an existing UserGame', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame({ id: 'ug-1', status: 'Backlog' }));
    (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame({ id: 'ug-1', status: 'Playing' }));

    const res = await request(app)
      .patch('/api/games/ug-1')
      .send({ status: 'Playing' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Playing');
    expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.status).toBe('Playing');
  });

  it('maps "On Hold" → Prisma OnHold on update', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame());
    (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame({ status: 'OnHold' }));

    await request(app).patch('/api/games/ug-1').send({ status: 'On Hold' });

    expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.status).toBe('OnHold');
  });

  it('updates notes and rating', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame());
    (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame());

    await request(app)
      .patch('/api/games/ug-1')
      .send({ notes: 'Got stuck on the final boss', rating: 9 });

    const data = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(data.notes).toBe('Got stuck on the final boss');
    expect(data.rating).toBe(9);
  });

  it('returns 404 when the game does not belong to the user', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app).patch('/api/games/missing').send({ status: 'Playing' });

    expect(res.status).toBe(404);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app).patch('/api/games/ug-1').send({ status: 'Bogus' });

    expect(res.status).toBe(400);
    expect(prisma.userGame.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 for an out-of-range rating', async () => {
    const res = await request(app).patch('/api/games/ug-1').send({ rating: 99 });

    expect(res.status).toBe(400);
  });
});

/* ── POST /api/games/:id/remap ── */

import { getGame } from '../services/igdb';

describe('POST /api/games/:id/remap', () => {
  const mockNewIgdb = {
    igdbId: 5000,
    title: 'Slay the Spire',
    developer: 'Mega Crit',
    releaseYear: 2019,
    genres: ['Card Game'],
    coverUrl: 'https://example.com/cover.jpg',
    platforms: ['PC (Microsoft Windows)', 'PlayStation 4'],
    totalRatingCount: 1500,
  };

  it('returns 400 for a non-positive igdbId', async () => {
    const res = await request(app).post('/api/games/ug-1/remap').send({ igdbId: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the UserGame does not belong to the user', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(app).post('/api/games/missing/remap').send({ igdbId: 5000 });
    expect(res.status).toBe(404);
  });

  it('returns 422 when IGDB lookup fails for the new id', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValueOnce(makeUserGame({ igdbId: 9999 }));
    (getGame as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app).post('/api/games/ug-1/remap').send({ igdbId: 5000 });
    expect(res.status).toBe(422);
  });

  it('no-ops when the target igdbId already matches the current Game', async () => {
    // Pre-existing UserGame already references igdbId=5000.
    (prisma.userGame.findFirst as jest.Mock)
      .mockResolvedValueOnce(makeUserGame({ igdbId: 5000 }))   // ownership check
      .mockResolvedValueOnce(makeUserGame({ igdbId: 5000 }));  // refetch with hltbData
    const res = await request(app).post('/api/games/ug-1/remap').send({ igdbId: 5000 });
    expect(res.status).toBe(200);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
    expect(prisma.game.upsert).not.toHaveBeenCalled();
  });

  it('rewrites UserGame.gameId to the new Game and preserves notes / status / playtime', async () => {
    const original = { ...makeUserGame({ igdbId: 9999, status: 'Playing' }), notes: 'best run yet' as string | null };
    (prisma.userGame.findFirst as jest.Mock)
      .mockResolvedValueOnce(original)   // ownership check
      .mockResolvedValueOnce(null);      // collision check (no other UserGame for new gameId)
    (getGame as jest.Mock).mockResolvedValueOnce(mockNewIgdb);
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-new', igdbId: 5000, title: 'Slay the Spire', steamAppId: null, hltbData: null });
    (prisma.userGame.update as jest.Mock).mockResolvedValue({
      ...original,
      gameId: 'game-new',
      game: { id: 'game-new', igdbId: 5000, title: 'Slay the Spire', developer: 'Mega Crit', releaseYear: 2019, genres: ['Card Game'], coverUrl: 'https://example.com/cover.jpg', steamAppId: null, hltbData: null },
    });

    const res = await request(app).post('/api/games/ug-1/remap').send({ igdbId: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.game.title).toBe('Slay the Spire');
    expect(res.body.notes).toBe('best run yet');     // notes preserved
    expect(res.body.status).toBe('Playing');         // status preserved

    // userGame.update only touches gameId — nothing else
    const updateData = (prisma.userGame.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData).toEqual({ gameId: 'game-new' });

    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { igdbId: 5000 },
        create: expect.objectContaining({ igdbId: 5000, title: 'Slay the Spire' }),
      }),
    );
  });

  it('returns 409 with conflictUserGameId + conflictTitle when the user already has a different UserGame for the target Game', async () => {
    const original = makeUserGame({ igdbId: 9999 });
    const conflict = { ...makeUserGame({ id: 'ug-other' }), game: { ...makeUserGame().game, igdbId: 5000, title: 'Slay the Spire' } };
    (prisma.userGame.findFirst as jest.Mock)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(conflict);
    (getGame as jest.Mock).mockResolvedValueOnce(mockNewIgdb);
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-new', igdbId: 5000 });

    const res = await request(app).post('/api/games/ug-1/remap').send({ igdbId: 5000 });

    expect(res.status).toBe(409);
    expect(res.body.conflictUserGameId).toBe('ug-other');
    expect(res.body.conflictTitle).toBe('Slay the Spire');
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('with merge=true: combines playtime (max-per-platform), keeps source status when non-default, deletes source UserGame', async () => {
    // Source: wrong-matched UserGame the user has been actively playing.
    const source = {
      ...makeUserGame({ id: 'ug-source', igdbId: 9999, status: 'Playing' }),
      playtimeByPlatform: { PS: 800 } as Record<string, number>,
      lastPlayedAt: new Date('2026-05-08T10:00:00Z'),
      addedAt: new Date('2026-05-01T00:00:00Z'),
      notes: 'rolling great runs',
      rating: 9,
    };
    // Target: untouched auto-sync entry the user already had under the right Game.
    const target = {
      ...makeUserGame({ id: 'ug-target', igdbId: 5000 }),
      playtimeByPlatform: { ST: 200 } as Record<string, number>,
      lastPlayedAt: new Date('2026-04-01T00:00:00Z'),
      addedAt: new Date('2026-03-15T00:00:00Z'),
      notes: null,
      rating: null,
      game: { ...makeUserGame().game, igdbId: 5000, title: 'Slay the Spire' },
    };

    (prisma.userGame.findFirst as jest.Mock)
      .mockResolvedValueOnce(source)   // ownership check
      .mockResolvedValueOnce(target);  // collision check
    (getGame as jest.Mock).mockResolvedValueOnce(mockNewIgdb);
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-target', igdbId: 5000 });

    const txMock = {
      userGame: {
        update: jest.fn().mockResolvedValue({
          ...target,
          playtimeByPlatform: { ST: 200, PS: 800 },
          lastPlayedAt: source.lastPlayedAt,
          addedAt: target.addedAt, // earlier
          status: 'Playing',
          notes: 'rolling great runs',
          rating: 9,
          game: { ...target.game, hltbData: null },
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

    const res = await request(app)
      .post('/api/games/ug-source/remap')
      .send({ igdbId: 5000, merge: true });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('ug-target');                     // target survived
    expect(res.body.status).toBe('Playing');                   // source's non-default status wins
    expect(res.body.notes).toBe('rolling great runs');         // source's notes win
    expect(res.body.rating).toBe(9);                            // source's rating wins
    expect(res.body.playtimeByPlatform).toEqual({ ST: 200, PS: 800 }); // merged

    // Transaction: target updated, source deleted
    expect(txMock.userGame.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ug-target' },
      data: expect.objectContaining({
        playtimeByPlatform: { ST: 200, PS: 800 },
        status: 'Playing',
        notes: 'rolling great runs',
        rating: 9,
      }),
    }));
    expect(txMock.userGame.delete).toHaveBeenCalledWith({ where: { id: 'ug-source' } });
  });

  it('with merge=true: max-per-platform handles overlap (target had higher PS playtime, source had higher ST)', async () => {
    const source = { ...makeUserGame({ id: 'ug-source', igdbId: 9999 }), playtimeByPlatform: { ST: 400, PS: 100 } as Record<string, number>, status: 'Backlog', notes: null, rating: null };
    const target = { ...makeUserGame({ id: 'ug-target', igdbId: 5000 }), playtimeByPlatform: { ST: 100, PS: 600 } as Record<string, number>, status: 'OnHold',  notes: 'kept', rating: 7, game: { ...makeUserGame().game, igdbId: 5000, title: 'X' } };

    (prisma.userGame.findFirst as jest.Mock).mockResolvedValueOnce(source).mockResolvedValueOnce(target);
    (getGame as jest.Mock).mockResolvedValueOnce(mockNewIgdb);
    (prisma.game.upsert as jest.Mock).mockResolvedValue({ id: 'game-target', igdbId: 5000 });

    const txUpdate = jest.fn().mockImplementation(async (args: { data: { playtimeByPlatform: Record<string, number>; status: string; notes: string | null; rating: number | null } }) => ({
      ...target,
      ...args.data,
      game: { ...target.game, hltbData: null },
    }));
    const txMock = {
      userGame: {
        update: txUpdate,
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(txMock));

    await request(app).post('/api/games/ug-source/remap').send({ igdbId: 5000, merge: true });

    const data = txUpdate.mock.calls[0][0].data;
    // Merged playtime is max-per-platform: ST=400 (source), PS=600 (target)
    expect(data.playtimeByPlatform).toEqual({ ST: 400, PS: 600 });
    // Source status was Backlog (default), so target's OnHold wins
    expect(data.status).toBe('OnHold');
    // Source notes/rating were null, so target's values are preserved
    expect(data.notes).toBe('kept');
    expect(data.rating).toBe(7);
  });
});
