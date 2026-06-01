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
  // GD-PR3 fields
  subStatus: null,
  completionsCount: null,
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

// GD-PR3 — helper for testing the auto-clear-stale-subStatus path. The
// row's CURRENT state has a sub-status set; PATCH changes status WITHOUT
// touching subStatus → server should null it.
const makeUserGameWithSubStatus = (subStatus: string) => ({
  ...makeUserGame({ status: 'Playing' }),
  subStatus,
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

/* ── GET /api/games/lens-index (B-IGDB-3b2) ── */

describe('GET /api/games/lens-index', () => {
  it('aggregates genre/theme/perspective counts across user library', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      { game: { genres: ['RPG', 'Action'], themes: ['Fantasy'], playerPerspectives: ['Third-person'] } },
      { game: { genres: ['RPG'], themes: ['Sci-Fi'], playerPerspectives: ['First-person'] } },
      { game: { genres: ['Strategy'], themes: ['Fantasy'], playerPerspectives: [] } },
    ]);

    const res = await request(app).get('/api/games/lens-index');

    expect(res.status).toBe(200);
    expect(res.body.genre).toEqual([
      { name: 'RPG', count: 2 },
      { name: 'Action', count: 1 },
      { name: 'Strategy', count: 1 },
    ]);
    expect(res.body.theme).toEqual([
      { name: 'Fantasy', count: 2 },
      { name: 'Sci-Fi', count: 1 },
    ]);
    expect(res.body.perspective).toEqual([
      { name: 'First-person', count: 1 },
      { name: 'Third-person', count: 1 },
    ]);
  });

  it('breaks count ties by name asc (deterministic)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      { game: { genres: ['Zelda', 'Action'], themes: [], playerPerspectives: [] } },
    ]);
    const res = await request(app).get('/api/games/lens-index');
    expect(res.body.genre.map((e: { name: string }) => e.name)).toEqual(['Action', 'Zelda']);
  });

  it('returns empty arrays when the user has no games', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get('/api/games/lens-index');
    expect(res.body).toEqual({ genre: [], theme: [], perspective: [] });
  });

  it('sets a short Cache-Control header', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get('/api/games/lens-index');
    expect(res.headers['cache-control']).toBe('private, max-age=30');
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
  // Cap bumped 500 → 5000 → 50000 on 2026-05-31. The 5000 cap was still
  // arbitrary; 50000 is effectively unbounded for any realistic personal
  // library and lets Library's chip-strip count mirror the sidebar's
  // truthful per-status count instead of `loaded.length`.
  it('rejects limit > 50000', async () => {
    const res = await request(app).get('/api/games?limit=100000');
    expect(res.status).toBe(400);
  });

  it('accepts limit = 50000 (Library single-shelf request — entire shelf)', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.userGame.count as jest.Mock).mockResolvedValue(0);
    const res = await request(app).get('/api/games?limit=50000');
    expect(res.status).toBe(200);
  });

  it('still accepts limit = 500 (legacy/smaller callers)', async () => {
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

  /* ── GD-PR3 — sub-status + completionsCount ── */

  describe('sub-status validity guard (GD-PR3 / OQ-GD-2)', () => {
    it("accepts a valid sub-status for the current row's status (Playing → 'paused')", async () => {
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Playing' }));
      (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Playing' }));

      const res = await request(app).patch('/api/games/ug-1').send({ subStatus: 'paused' });

      expect(res.status).toBe(200);
      expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.subStatus).toBe('paused');
    });

    it("accepts a sub-status valid against an incoming status (Completed → '100%')", async () => {
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Playing' }));
      (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Completed' }));

      const res = await request(app).patch('/api/games/ug-1').send({ status: 'Completed', subStatus: '100%' });

      expect(res.status).toBe(200);
      expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.subStatus).toBe('100%');
    });

    it('rejects an INVALID combo with 400 INVALID_SUB_STATUS (Playing + 100%)', async () => {
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Playing' }));

      const res = await request(app).patch('/api/games/ug-1').send({ subStatus: '100%' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_SUB_STATUS');
      expect(prisma.userGame.update).not.toHaveBeenCalled();
    });

    it('null subStatus is always accepted (clearing)', async () => {
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Playing' }));
      (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Playing' }));

      const res = await request(app).patch('/api/games/ug-1').send({ subStatus: null });

      expect(res.status).toBe(200);
      expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.subStatus).toBeNull();
    });

    it('auto-clears stale subStatus when status changes without an explicit subStatus arg', async () => {
      // Row has subStatus='paused' under Playing; user moves to Completed without
      // touching subStatus. Server clears it because it would be incoherent.
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGameWithSubStatus('paused'));
      (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame({ status: 'Completed' }));

      const res = await request(app).patch('/api/games/ug-1').send({ status: 'Completed' });

      expect(res.status).toBe(200);
      expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.subStatus).toBeNull();
    });

    it('returns 400 when subStatus exceeds the length cap', async () => {
      const res = await request(app).patch('/api/games/ug-1').send({ subStatus: 'a'.repeat(33) });
      expect(res.status).toBe(400);
    });
  });

  describe('completionsCount (GD-PR3 / OQ-GD-3)', () => {
    it('round-trips a non-zero count', async () => {
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame());
      (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame());

      const res = await request(app).patch('/api/games/ug-1').send({ completionsCount: 3 });

      expect(res.status).toBe(200);
      expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.completionsCount).toBe(3);
    });

    it('rejects negative values', async () => {
      const res = await request(app).patch('/api/games/ug-1').send({ completionsCount: -1 });
      expect(res.status).toBe(400);
    });

    it('rejects values above 999', async () => {
      const res = await request(app).patch('/api/games/ug-1').send({ completionsCount: 1000 });
      expect(res.status).toBe(400);
    });

    it('null clears the counter', async () => {
      (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(makeUserGame());
      (prisma.userGame.update as jest.Mock).mockResolvedValue(makeUserGame());

      const res = await request(app).patch('/api/games/ug-1').send({ completionsCount: null });

      expect(res.status).toBe(200);
      expect((prisma.userGame.update as jest.Mock).mock.calls[0][0].data.completionsCount).toBeNull();
    });
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

describe('DELETE /api/games/:id/wishlist-platforms/:code (F1-PR2 / CM12)', () => {
  const makeWishlistRow = (wishlistedPlatforms: string[], id = 'ug-1') => ({
    ...makeUserGame({ id }),
    wishlistedPlatforms,
  });

  it('returns 404 when the UserGame does not belong to the user', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(app).delete('/api/games/missing/wishlist-platforms/PC');
    expect(res.status).toBe(404);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('returns 400 when the code path segment is too long (>32 chars)', async () => {
    // Express trims out empty path segments so the empty-string case 404s
    // at the router rather than reaching the handler — the length cap is the
    // testable boundary.
    const tooLong = 'x'.repeat(33);
    const res = await request(app).delete(`/api/games/ug-1/wishlist-platforms/${tooLong}`);
    expect(res.status).toBe(400);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('removes a code from wishlistedPlatforms when present', async () => {
    const before = makeWishlistRow(['PC', 'PS']);
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValueOnce(before);
    (prisma.userGame.update as jest.Mock).mockResolvedValue({ ...before, wishlistedPlatforms: ['PS'] });

    const res = await request(app).delete('/api/games/ug-1/wishlist-platforms/PC');
    expect(res.status).toBe(200);
    expect(res.body.wishlistedPlatforms).toEqual(['PS']);

    const updateArgs = (prisma.userGame.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data).toEqual({ wishlistedPlatforms: ['PS'] });
    expect(updateArgs.where).toEqual({ id: 'ug-1' });
  });

  it('is idempotent: returns 200 with unchanged record when the code is not present (no update call)', async () => {
    const before = makeWishlistRow(['PS']);
    (prisma.userGame.findFirst as jest.Mock)
      .mockResolvedValueOnce(before)   // initial lookup (select wishlistedPlatforms)
      .mockResolvedValueOnce(before);  // refetch with hltbData when no change

    const res = await request(app).delete('/api/games/ug-1/wishlist-platforms/PC');
    expect(res.status).toBe(200);
    expect(res.body.wishlistedPlatforms).toEqual(['PS']);
    expect(prisma.userGame.update).not.toHaveBeenCalled();
  });

  it('only removes the matching code (leaves others intact, including order)', async () => {
    const before = makeWishlistRow(['PC', 'NT', 'XB']);
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValueOnce(before);
    (prisma.userGame.update as jest.Mock).mockImplementation(async (args: { data: { wishlistedPlatforms: string[] } }) => ({
      ...before,
      wishlistedPlatforms: args.data.wishlistedPlatforms,
    }));

    const res = await request(app).delete('/api/games/ug-1/wishlist-platforms/NT');
    expect(res.status).toBe(200);
    expect(res.body.wishlistedPlatforms).toEqual(['PC', 'XB']);
  });

  it('scopes the lookup to the requesting user (cross-user isolation)', async () => {
    (prisma.userGame.findFirst as jest.Mock).mockResolvedValue(null);
    await request(app).delete('/api/games/ug-other/wishlist-platforms/PC');
    const firstCall = (prisma.userGame.findFirst as jest.Mock).mock.calls[0][0];
    expect(firstCall.where).toEqual({ id: 'ug-other', userId: 'test-user-id' });
  });
});
