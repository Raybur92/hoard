import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    platform: { findMany: jest.fn() },
    wishlistRelease: { findMany: jest.fn() },
    // DEALS-PR1 — dashboard tallies wishlistDealsCount via prisma.deal.count
    deal: { count: jest.fn() },
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

beforeEach(() => {
  jest.resetAllMocks();
});

const makeUserGame = (overrides: Partial<{ id: string; status: string; mainStory: number | null }> = {}) => ({
  id: overrides.id ?? 'ug-1',
  userId: 'test-user-id',
  gameId: 'game-1',
  status: overrides.status ?? 'Backlog',
  playtimeByPlatform: { ST: 600, PS: 300 } as Record<string, number>,
  lastPlayedAt: new Date('2025-01-01'),
  notes: null,
  rating: null,
  addedAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  game: {
    id: 'game-1',
    igdbId: 1942,
    title: 'Hollow Knight',
    developer: 'Team Cherry',
    releaseYear: 2017,
    genres: ['Platformer', 'Metroidvania'],
    coverUrl: null,
    hltbData: overrides.mainStory != null
      ? { id: 'h-1', gameId: 'game-1', mainStory: overrides.mainStory, mainExtras: null, completionist: null, fetchedAt: new Date() }
      : null,
  },
});

const aggRow = (
  genres: string[] = ['Platformer'],
  playtime: Record<string, number> = { ST: 600, PS: 300 },
  lastPlayedAt: Date | null = null,
  status: string = 'Backlog',
  // The route only reads `earned` and `total`. Tests pass realistic shapes
  // including `percent`/`updatedAt` for parity with what the writers emit;
  // signature stays loose so those don't trip the type system.
  achievementsByPlatform: Record<string, Record<string, unknown>> = {},
) => ({
  playtimeByPlatform: playtime,
  lastPlayedAt,
  status,
  achievementsByPlatform,
  // B-IGDB-3 — dashboard route now reads `themes` + `playerPerspectives`
  // alongside `genres` to compute the 3-tab breakdown counts. Tests default
  // to empty arrays; specific tests can override via the factory's overrides.
  game: { genres, themes: [], playerPerspectives: [] },
});

const backlogIdRow = (id: string, mainStory: number | null) => ({
  id,
  game: { hltbData: mainStory != null ? { mainStory } : null },
});

/**
 * Sets up the mocks for the slim dashboard route.
 *
 * The route runs (in parallel):
 *   1. userGame.groupBy (counts)
 *   2. userGame.count   (wishlistCount widened)
 *   3. userGame.count   (weeklyAdded)
 *   4. userGame.findMany — nowPlaying (Playing, take 3, with full game+hltb)
 *   5. userGame.findMany — backlogIdsRaw (Backlog, lightweight: id + hltb.mainStory)
 *   6. userGame.findMany — aggUserGames (playtime + genres + lastPlayedAt +
 *      status + achievementsByPlatform for every userGame; the latter two
 *      added in DASH-PR2 for period-scoped engagement aggregates + T6 rollup)
 *   7. wishlistRelease.findMany
 *   8. platform.findMany
 * Then a follow-up:
 *   9. userGame.findMany — backlogTopRaw (full data for the 30 IDs with shortest HLTB)
 *
 * DASH-PR2 — `achievementsRows` is no longer a separate query. The
 * achievements rollup is derived from `aggUserGames` (which now selects
 * `achievementsByPlatform` alongside playtime/genres/status). Migrating
 * existing tests: any `achievementsRows` they passed should set the
 * `achievementsByPlatform` field on the matching `aggRows` entry instead.
 */
function setupDashboard({
  countGroups = [] as Array<{ status: string; _count: { status: number } }>,
  weeklyAdded = 0,
  nowPlaying = [] as ReturnType<typeof makeUserGame>[],
  backlogIds = [] as ReturnType<typeof backlogIdRow>[],
  aggRows = [] as ReturnType<typeof aggRow>[],
  backlogTop = [] as ReturnType<typeof makeUserGame>[],
  wishlist = [] as unknown[],
  platforms = [] as unknown[],
}: Partial<{
  countGroups: Array<{ status: string; _count: { status: number } }>;
  weeklyAdded: number;
  nowPlaying: ReturnType<typeof makeUserGame>[];
  backlogIds: ReturnType<typeof backlogIdRow>[];
  aggRows: ReturnType<typeof aggRow>[];
  backlogTop: ReturnType<typeof makeUserGame>[];
  wishlist: unknown[];
  platforms: unknown[];
}>) {
  (prisma.userGame.groupBy as jest.Mock).mockResolvedValue(countGroups);
  // Two count() calls in Promise.all order: wishlistCount (widened), weeklyAdded.
  (prisma.userGame.count as jest.Mock)
    .mockResolvedValueOnce(0)
    .mockResolvedValueOnce(weeklyAdded);
  // findMany order: nowPlaying, backlogIds, aggRows, [backlogTop if any backlogIds]
  const findManyMock = prisma.userGame.findMany as jest.Mock;
  findManyMock.mockReset();
  findManyMock
    .mockResolvedValueOnce(nowPlaying)
    .mockResolvedValueOnce(backlogIds)
    .mockResolvedValueOnce(aggRows)
    .mockResolvedValueOnce(backlogTop);
  (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue(wishlist);
  (prisma.platform.findMany as jest.Mock).mockResolvedValue(platforms);
  // DEALS-PR1 — wishlistDealsCount via prisma.deal.count; default 0 for tests
  // that don't care about the deals tally.
  (prisma.deal.count as jest.Mock).mockResolvedValue(0);
}

describe('GET /api/dashboard', () => {
  it('returns the full DashboardResponse shape with all required fields', async () => {
    setupDashboard({
      countGroups: [
        { status: 'Playing',  _count: { status: 1 } },
        { status: 'Backlog',  _count: { status: 1 } },
        { status: 'Completed', _count: { status: 1 } },
      ],
      weeklyAdded: 0,
      nowPlaying: [makeUserGame({ id: 'np', status: 'Playing', mainStory: 1500 })],
      backlogIds: [backlogIdRow('ug-2', 600)],
      aggRows: [aggRow(['Platformer'], { ST: 600, PS: 300 }), aggRow(['Action'], { ST: 600, PS: 300 }), aggRow(['RPG'], { ST: 600, PS: 300 })],
      backlogTop: [makeUserGame({ id: 'ug-2', status: 'Backlog', mainStory: 600 })],
    });

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalGames).toBe(3);
    expect(res.body.stats.playingCount).toBe(1);
    expect(res.body.stats.backlogCount).toBe(1);
    expect(res.body.stats.completedCount).toBe(1);
    expect(res.body.stats.totalPlaytimeMinutes).toBe(2700); // 3 agg rows × (600+300)
    expect(res.body.nowPlaying).toHaveLength(1);
    expect(res.body.backlogPick).toBeDefined();
    expect(res.body.backlogItems).toBeDefined();
    expect(res.body.wishlistCountdown).toEqual([]);
  });

  it('orders the backlog pool by HLTB mainStory ascending so backlogPick is the shortest', async () => {
    setupDashboard({
      countGroups: [{ status: 'Backlog', _count: { status: 3 } }],
      backlogIds: [
        backlogIdRow('ug-long',  3000),
        backlogIdRow('ug-short',  600),
        backlogIdRow('ug-mid',   1200),
      ],
      // Prisma's `where: { id: { in: [...] } }` returns rows in any order — the
      // route re-orders client-side based on the sortedBacklogIds index map.
      backlogTop: [
        makeUserGame({ id: 'ug-mid',   status: 'Backlog', mainStory: 1200 }),
        makeUserGame({ id: 'ug-long',  status: 'Backlog', mainStory: 3000 }),
        makeUserGame({ id: 'ug-short', status: 'Backlog', mainStory: 600 }),
      ],
    });

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.backlogPick.id).toBe('ug-short');
    expect(res.body.backlogItems.map((u: { id: string }) => u.id)).toEqual(['ug-short', 'ug-mid', 'ug-long']);
  });

  it('handles empty libraries without crashing', async () => {
    setupDashboard({});
    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stats.totalGames).toBe(0);
    expect(res.body.backlogPick).toBeNull();
    expect(res.body.nowPlaying).toEqual([]);
    expect(res.body.backlogItems).toEqual([]);
  });

  it('returns an activity heatmap built from lastPlayedAt timestamps (F14)', async () => {
    // Three games last-played today + two yesterday + one a week ago. The cell
    // for "today" should have count 3, "yesterday" 2, "one week ago" 1.
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const lastWeek = new Date(today.getTime() - 7 * 86_400_000);

    setupDashboard({
      countGroups: [{ status: 'Playing', _count: { status: 6 } }],
      aggRows: [
        aggRow(['Action'],   { ST: 60 }, today),
        aggRow(['Action'],   { ST: 60 }, today),
        aggRow(['Action'],   { ST: 60 }, today),
        aggRow(['Strategy'], { ST: 60 }, yesterday),
        aggRow(['Strategy'], { ST: 60 }, yesterday),
        aggRow(['RPG'],      { ST: 60 }, lastWeek),
      ],
    });

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.activity).toBeDefined();
    expect(res.body.activity.weeks).toBe(24);
    expect(res.body.activity.cells).toHaveLength(24 * 7);

    // Recompute the expected cell offsets the same way the route does, so the
    // assertion is robust to whatever today's day-of-week is.
    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const todayDow = new Date(todayUTC).getUTCDay();
    const oldestSundayUTC = todayUTC - (todayDow + 23 * 7) * 86_400_000;
    const offsetFor = (d: Date) => {
      const dUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return (dUTC - oldestSundayUTC) / 86_400_000;
    };
    expect(res.body.activity.cells[offsetFor(today)]).toBe(3);
    expect(res.body.activity.cells[offsetFor(yesterday)]).toBe(2);
    expect(res.body.activity.cells[offsetFor(lastWeek)]).toBe(1);
  });

  it('does not load every UserGame with full Game data — backlog query uses lightweight select (F5)', async () => {
    setupDashboard({
      countGroups: [{ status: 'Backlog', _count: { status: 50 } }],
      backlogIds: Array.from({ length: 50 }, (_, i) => backlogIdRow(`ug-${i}`, i * 100)),
      backlogTop: Array.from({ length: 30 }, (_, i) => makeUserGame({ id: `ug-${i}`, status: 'Backlog', mainStory: i * 100 })),
    });

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    // Lightweight backlog id query is the second findMany call.
    const backlogIdsCall = (prisma.userGame.findMany as jest.Mock).mock.calls[1]?.[0];
    expect(backlogIdsCall.where).toEqual({ userId: 'test-user-id', status: 'Backlog' });
    expect(backlogIdsCall.select).toBeDefined();
    expect(backlogIdsCall.include).toBeUndefined();
    expect(backlogIdsCall.select.id).toBe(true);

    // Full backlog data only loaded for top 30.
    expect(res.body.backlogItems.length).toBeLessThanOrEqual(30);
  });
});

/* ── T6 — achievements rollup on /api/dashboard ── */

describe('GET /api/dashboard — wishlistCount widening (F1-PR2 / CM12 + CM13)', () => {
  it('wishlistCount comes from the widened count() query, not from countGroups[Wishlist]', async () => {
    (prisma.userGame.groupBy as jest.Mock).mockResolvedValue([
      { status: 'Backlog',  _count: { status: 10 } },
      { status: 'Wishlist', _count: { status: 3 } },
    ]);
    (prisma.userGame.count as jest.Mock)
      .mockResolvedValueOnce(5) // widened wishlistCount
      .mockResolvedValueOnce(0); // weeklyAdded
    const findManyMock = prisma.userGame.findMany as jest.Mock;
    findManyMock.mockReset();
    findManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stats.wishlistCount).toBe(5);
    expect(res.body.stats.backlogCount).toBe(10);

    // Verify the count() call shape — the widened one uses OR with isEmpty: false
    const countCalls = (prisma.userGame.count as jest.Mock).mock.calls;
    const widenedCall = countCalls.find((c) => c[0]?.where?.OR);
    expect(widenedCall).toBeDefined();
    expect(widenedCall![0].where.OR).toEqual(
      expect.arrayContaining([
        { status: 'Wishlist' },
        { wishlistedPlatforms: { isEmpty: false } },
      ]),
    );
  });
});

describe('GET /api/dashboard — achievements rollup (T6, M0 per-platform shape)', () => {
  it('returns null when no game in the library has achievement data yet', async () => {
    setupDashboard({
      countGroups: [{ status: 'Backlog', _count: { status: 5 } }],
      aggRows: [
        aggRow(['Action'], { ST: 0 }, null, 'Backlog', {}),
        aggRow(['Action'], { ST: 0 }, null, 'Backlog', {}),
      ],
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.stats.achievementsRollup).toBeNull();
  });

  it('aggregates summed counts across single-platform rows + percent rounded to one decimal', async () => {
    setupDashboard({
      countGroups: [{ status: 'Playing', _count: { status: 10 } }],
      aggRows: [
        aggRow(['Action'], { PS: 0 }, null, 'Playing', { PS: { earned: 800, total: 2000, percent: 40, updatedAt: 't' } }),
        aggRow(['Action'], { ST: 0 }, null, 'Playing', { ST: { earned: 442, total: 2580, percent: 17, updatedAt: 't' } }),
      ],
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.stats.achievementsRollup).toEqual({
      earned: 1242,
      total: 4580,
      percent: 27.1,
    });
  });

  it('aggregates summed counts across cross-platform rows (M-D7 — both .ST and .PS contribute)', async () => {
    setupDashboard({
      countGroups: [{ status: 'Playing', _count: { status: 1 } }],
      // Cyberpunk-style: same game with both Steam achievements and PSN trophies.
      // Both should contribute to the library-wide rollup.
      aggRows: [
        aggRow(['Action'], { ST: 0, PS: 0 }, null, 'Playing', {
          ST: { earned: 28, total: 44, percent: 64, updatedAt: 't' },
          PS: { earned: 30, total: 45, percent: 67, updatedAt: 't' },
        }),
      ],
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.body.stats.achievementsRollup).toEqual({
      earned: 58, // 28 + 30
      total: 89,  // 44 + 45
      percent: 65.2,
    });
  });

  it('handles a 0/N case (user has games with achievement support but earned none)', async () => {
    setupDashboard({
      countGroups: [{ status: 'Backlog', _count: { status: 1 } }],
      aggRows: [
        aggRow(['Action'], { ST: 0 }, null, 'Backlog', { ST: { earned: 0, total: 100, percent: 0, updatedAt: 't' } }),
      ],
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.body.stats.achievementsRollup).toEqual({ earned: 0, total: 100, percent: 0 });
  });

  it('selects achievementsByPlatform alongside playtime + genres + lastPlayedAt + status on the aggUserGames query (DASH-PR2)', async () => {
    setupDashboard({
      countGroups: [{ status: 'Backlog', _count: { status: 1 } }],
      aggRows: [
        aggRow(['Action'], { ST: 0 }, null, 'Backlog', { ST: { earned: 50, total: 200, percent: 25, updatedAt: 't' } }),
      ],
    });

    await request(app).get('/api/dashboard');

    // The 3rd findMany call is the aggUserGames query (per setupDashboard order:
    // nowPlaying, backlogIds, aggUserGames, backlogTop). DASH-PR2 dropped the
    // separate achievementsRows query; achievementsByPlatform now rides along
    // on aggUserGames since the engagement-scoped period stats need both
    // status + achievementsByPlatform on the same row.
    const findManyCalls = (prisma.userGame.findMany as jest.Mock).mock.calls;
    const aggCall = findManyCalls[2]?.[0];
    expect(aggCall.where.userId).toBe('test-user-id');
    expect(aggCall.select).toEqual({
      playtimeByPlatform: true,
      lastPlayedAt: true,
      status: true,
      achievementsByPlatform: true,
      // DEALS-PR1 added gameId + wishlistedPlatforms so the dashboard
      // can tally wishlistDealsCount in the same pass.
      gameId: true,
      wishlistedPlatforms: true,
      // B-IGDB-3 added themes + playerPerspectives alongside genres so the
      // dashboard 3-tab breakdown can render all three series from a single
      // pass over aggUserGames. One row per UserGame, three light String[]
      // columns; no schema overhead.
      game: { select: { genres: true, themes: true, playerPerspectives: true } },
    });
  });
});

describe('GET /api/dashboard — DASH-PR2 period scoping', () => {
  it('defaults to period="all" when no ?period= query parameter is provided', async () => {
    setupDashboard({
      countGroups: [
        { status: 'Playing', _count: { status: 2 } },
        { status: 'Completed', _count: { status: 8 } },
      ],
      aggRows: [
        aggRow(['Action'], { ST: 100 }, null, 'Playing', {}),
        aggRow(['RPG'], { ST: 0 }, null, 'Completed', {}),
      ],
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.stats.period).toBe('all');
    // Period-all mirrors the all-time numerator + denominator from shelfCounts.
    expect(res.body.stats.periodStats.completedCount).toBe(8);
    expect(res.body.stats.periodStats.totalGames).toBe(10);
    expect(res.body.stats.periodStats.completionPct).toBe(80);
  });

  it('rejects unknown ?period= values silently by collapsing to "all" (no 400)', async () => {
    setupDashboard({ countGroups: [{ status: 'Backlog', _count: { status: 1 } }] });
    const res = await request(app).get('/api/dashboard?period=weekly');
    expect(res.status).toBe(200);
    expect(res.body.stats.period).toBe('all');
  });

  it('?period=year: completedCount + totalGames count only UserGames with lastPlayedAt this calendar year', async () => {
    const now = new Date();
    const thisYearStart = new Date(Date.UTC(now.getUTCFullYear(), 6, 15)); // mid-year — definitely after start of year
    const lastYearEnd = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31));

    setupDashboard({
      countGroups: [
        { status: 'Playing', _count: { status: 1 } },
        { status: 'Completed', _count: { status: 3 } },
      ],
      aggRows: [
        // Three played this year — 2 completed, 1 playing
        aggRow(['Action'], { ST: 100 }, thisYearStart, 'Completed', {}),
        aggRow(['Action'], { ST: 100 }, thisYearStart, 'Completed', {}),
        aggRow(['Action'], { ST: 50 }, thisYearStart, 'Playing', {}),
        // One played last year — completed, must NOT count
        aggRow(['RPG'], { ST: 100 }, lastYearEnd, 'Completed', {}),
      ],
    });

    const res = await request(app).get('/api/dashboard?period=year');
    expect(res.status).toBe(200);
    expect(res.body.stats.period).toBe('year');
    expect(res.body.stats.periodStats.completedCount).toBe(2);
    expect(res.body.stats.periodStats.totalGames).toBe(3);
    expect(res.body.stats.periodStats.completionPct).toBeCloseTo(66.7, 0);
  });

  it('?period=month: lastPlayedAt before this calendar month is excluded from the period denominator', async () => {
    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const thisMonthMid = new Date(thisMonthStart.getTime() + 5 * 86_400_000);
    const lastMonthEnd = new Date(thisMonthStart.getTime() - 86_400_000);

    setupDashboard({
      countGroups: [{ status: 'Completed', _count: { status: 2 } }],
      aggRows: [
        aggRow(['Action'], { ST: 100 }, thisMonthMid, 'Completed', {}),
        aggRow(['Action'], { ST: 100 }, thisMonthMid, 'Backlog', {}),
        // Excluded — last month
        aggRow(['Action'], { ST: 100 }, lastMonthEnd, 'Completed', {}),
      ],
    });

    const res = await request(app).get('/api/dashboard?period=month');
    expect(res.body.stats.period).toBe('month');
    expect(res.body.stats.periodStats.totalGames).toBe(2);
    expect(res.body.stats.periodStats.completedCount).toBe(1);
  });

  it('rows with lastPlayedAt=null are never counted under year/month periods', async () => {
    setupDashboard({
      countGroups: [{ status: 'Wishlist', _count: { status: 5 } }],
      aggRows: [
        aggRow(['Action'], {}, null, 'Wishlist', {}),
        aggRow(['Action'], {}, null, 'Wishlist', {}),
        aggRow(['Action'], {}, null, 'Wishlist', {}),
      ],
    });

    const res = await request(app).get('/api/dashboard?period=year');
    expect(res.body.stats.periodStats.totalGames).toBe(0);
    expect(res.body.stats.periodStats.completedCount).toBe(0);
    expect(res.body.stats.periodStats.completionPct).toBe(0);
    expect(res.body.stats.periodStats.achievementsRollup).toBeNull();
  });

  it('achievementsRollup under period scope sums only games last-played in the period (all-time achievement count on those games)', async () => {
    const now = new Date();
    const thisYearMid = new Date(Date.UTC(now.getUTCFullYear(), 6, 15));
    const lastYearMid = new Date(Date.UTC(now.getUTCFullYear() - 1, 6, 15));

    setupDashboard({
      countGroups: [{ status: 'Playing', _count: { status: 2 } }],
      aggRows: [
        // In-period — achievements DO count
        aggRow(['Action'], { ST: 100 }, thisYearMid, 'Playing', {
          ST: { earned: 30, total: 50, percent: 60, updatedAt: 't' },
        }),
        // Out-of-period — achievements EXCLUDED
        aggRow(['Action'], { PS: 100 }, lastYearMid, 'Completed', {
          PS: { earned: 100, total: 100, percent: 100, updatedAt: 't' },
        }),
      ],
    });

    const res = await request(app).get('/api/dashboard?period=year');
    // All-time rollup includes both rows
    expect(res.body.stats.achievementsRollup).toEqual({ earned: 130, total: 150, percent: 86.7 });
    // Period rollup includes only the in-period row
    expect(res.body.stats.periodStats.achievementsRollup).toEqual({
      earned: 30,
      total: 50,
      percent: 60,
    });
  });

  it('top-level all-time stats (completedCount/totalGames/completionPct/achievementsRollup) are NOT affected by period (greeting header reads them)', async () => {
    const now = new Date();
    const lastYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 6, 15));

    setupDashboard({
      countGroups: [
        { status: 'Backlog', _count: { status: 7 } },
        { status: 'Completed', _count: { status: 3 } },
      ],
      aggRows: [
        // Everything is last year; under period=year these all fall outside
        aggRow(['Action'], { ST: 100 }, lastYear, 'Completed', {
          ST: { earned: 50, total: 100, percent: 50, updatedAt: 't' },
        }),
      ],
    });

    const res = await request(app).get('/api/dashboard?period=year');
    // Greeting header reads these cumulative values
    expect(res.body.stats.completedCount).toBe(3);
    expect(res.body.stats.totalGames).toBe(10);
    expect(res.body.stats.completionPct).toBe(30);
    expect(res.body.stats.achievementsRollup).toEqual({ earned: 50, total: 100, percent: 50 });
    // Period-scoped subset is empty (everything is last year)
    expect(res.body.stats.periodStats.completedCount).toBe(0);
    expect(res.body.stats.periodStats.totalGames).toBe(0);
  });
});
