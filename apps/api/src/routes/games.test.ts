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
    },
    hltbData: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
  requireAuth: (req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = 'test-user-id'; next(); },
}));

jest.mock('../services/hltb', () => ({
  fetchHltb: jest.fn().mockResolvedValue(null),
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
    // Six findMany calls, one per status. We map status strings to deterministic mock results.
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockImplementation((args: { where: { status: string } }) => {
      if (args.where.status === 'Playing')   return Promise.resolve([makeUserGame({ id: 'p1', status: 'Playing' })]);
      if (args.where.status === 'Backlog')   return Promise.resolve([makeUserGame({ id: 'b1', status: 'Backlog' }), makeUserGame({ id: 'b2', status: 'Backlog' })]);
      if (args.where.status === 'Completed') return Promise.resolve([]);
      if (args.where.status === 'OnHold')    return Promise.resolve([makeUserGame({ id: 'h1', status: 'OnHold' })]);
      if (args.where.status === 'Dropped')   return Promise.resolve([]);
      if (args.where.status === 'Wishlist')  return Promise.resolve([makeUserGame({ id: 'w1', status: 'Wishlist' })]);
      return Promise.resolve([]);
    });
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
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/games/shelves?perStatus=4');

    expect(findManyMock).toHaveBeenCalledTimes(6);
    for (const call of findManyMock.mock.calls) {
      expect(call[0].take).toBe(4);
    }
  });

  it('defaults perStatus to 12 when omitted', async () => {
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockResolvedValue([]);
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
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/games/shelves?perStatus=5');

    const calls = findManyMock.mock.calls;
    const wishlistCall = calls.find((c) => c[0].where.status === 'Wishlist');
    const backlogCall = calls.find((c) => c[0].where.status === 'Backlog');
    expect(wishlistCall?.[0].orderBy).toEqual({ addedAt: 'desc' });
    expect(backlogCall?.[0].orderBy).toEqual({ lastPlayedAt: 'desc' });
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
