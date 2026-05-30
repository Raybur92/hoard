import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import { mapUserGame } from '../lib/mappers';
import type {
  ActivityHeatmap,
  DashboardPeriod,
  DashboardPeriodStats,
  DashboardResponse,
  DashboardStats,
  PlatformStat,
  Platform,
  ReleaseDateCategory,
} from '@hoard/types';

const router = Router();

const PLATFORM_LABELS: Record<string, string> = {
  ST: 'STEAM', PS: 'PSN', XB: 'XBOX', GG: 'GOG', NT: 'NINTENDO', EP: 'EPIC', IT: 'ITCH.IO',
};

const SHELF_KEYS = ['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist'] as const;
type ShelfKey = typeof SHELF_KEYS[number];

const BACKLOG_POOL_SIZE = 30;
const TOP_GENRES = 5;
const ACTIVITY_WEEKS = 24;
const DAY_MS = 86_400_000;

/**
 * Build a `weeks × 7` heatmap from the lastPlayedAt timestamps in the user's
 * library. Each game contributes a single cell (the day its `lastPlayedAt`
 * falls on). Cell value = count of distinct games whose last-play landed there.
 *
 * Limitation: we don't keep a session log, so this isn't "minutes per day" —
 * it's "games last-touched per day" over the last `weeks` weeks. Sparse but
 * real. Documented in docs/PERFORMANCE_PLAN.md F14.
 */
function buildActivity(rows: Array<{ lastPlayedAt: Date | null }>, weeks = ACTIVITY_WEEKS): ActivityHeatmap {
  const cells = new Array<number>(weeks * 7).fill(0);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayDow = new Date(todayUTC).getUTCDay(); // 0 = Sun
  // Oldest cell is the Sunday at column 0, row 0 of the grid. From today,
  // walk back todayDow days to last Sunday, then a further (weeks - 1) full
  // weeks to land on the oldest visible Sunday.
  const oldestSundayUTC = todayUTC - (todayDow + (weeks - 1) * 7) * DAY_MS;

  for (const r of rows) {
    if (!r.lastPlayedAt) continue;
    const lp = r.lastPlayedAt;
    const lpUTC = Date.UTC(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate());
    const offset = (lpUTC - oldestSundayUTC) / DAY_MS;
    if (offset >= 0 && offset < cells.length) {
      cells[offset] = (cells[offset] ?? 0) + 1;
    }
  }
  return { weeks, cells };
}

/** DASH-PR2 — `?period=` parsing. Default to `'all'` (cumulative), reject
 *  unknown values silently rather than 400ing — the toggle UI only emits
 *  the three known values, and a typo'd URL shouldn't break the page. */
function parsePeriod(raw: unknown): DashboardPeriod {
  return raw === 'year' || raw === 'month' ? raw : 'all';
}

/** DASH-PR2 — period start in server-local time (UTC). `month` is start-of-
 *  current-calendar-month; `year` is start-of-current-calendar-year; `all`
 *  returns null (no bound). Tested via a `now` parameter for determinism. */
function periodStart(period: DashboardPeriod, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

router.get('/dashboard', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000);
  const period = parsePeriod(req.query.period);
  const since = periodStart(period);

  const [
    countGroups,
    wishlistCount,
    weeklyAdded,
    nowPlayingRaw,
    backlogIdsRaw,
    aggUserGames,
    wishlistReleases,
    platforms,
  ] = await Promise.all([
    prisma.userGame.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    }),
    // F1-PR2 audit punch-list (SURFACE.md §13.7 per CM12 + CM13). The
    // Wishlist shelf widens to include games where wishlistedPlatforms
    // is non-empty (per-platform wishlist binding without global
    // status=Wishlist). Done as a separate count() because OR conditions
    // don't fit cleanly into groupBy. Distinct count of UserGames
    // matching either condition.
    prisma.userGame.count({
      where: {
        userId,
        OR: [
          { status: 'Wishlist' },
          { wishlistedPlatforms: { isEmpty: false } },
        ],
      },
    }),
    prisma.userGame.count({
      where: { userId, addedAt: { gte: oneWeekAgo } },
    }),
    prisma.userGame.findMany({
      where: { userId, status: 'Playing' },
      orderBy: { lastPlayedAt: 'desc' },
      take: 3,
      include: { game: { include: { hltbData: true } } },
    }),
    // Lightweight: id + HLTB only, used to pick the BACKLOG_POOL_SIZE shortest.
    prisma.userGame.findMany({
      where: { userId, status: 'Backlog' },
      select: {
        id: true,
        game: { select: { hltbData: { select: { mainStory: true } } } },
      },
    }),
    // Lightweight: just the columns the aggregations need (playtime, genres,
    // lastPlayedAt for the activity heatmap + period-bounded stats per
    // DASH-PR2, plus status + achievementsByPlatform for the engagement-scoped
    // completion + achievements cards). Loads every UserGame but ~80% smaller
    // per row than including full Game.
    prisma.userGame.findMany({
      where: { userId },
      select: {
        playtimeByPlatform: true,
        lastPlayedAt: true,
        status: true,
        achievementsByPlatform: true,
        game: { select: { genres: true } },
      },
    }),
    prisma.wishlistRelease.findMany({
      where: { userId, releaseDate: { gte: new Date() } },
      orderBy: { releaseDate: 'asc' },
      take: 5,
    }),
    prisma.platform.findMany({ where: { userId } }),
  ]);

  // Shelf counts (and totalGames derived from sum)
  const shelfCounts: Record<ShelfKey, number> = {
    Playing: 0, Backlog: 0, Completed: 0, 'On Hold': 0, Dropped: 0, Wishlist: 0,
  };
  for (const g of countGroups) {
    const key: ShelfKey = (g.status === 'OnHold' ? 'On Hold' : g.status) as ShelfKey;
    if (key in shelfCounts) shelfCounts[key] = g._count.status;
  }
  const totalGames = SHELF_KEYS.reduce((s, k) => s + shelfCounts[k], 0);

  // Aggregations from the lightweight rows.
  let totalPlaytimeMinutes = 0;
  const playtimeMap: Record<string, number> = {};
  const genreMap: Record<string, number> = {};
  for (const ug of aggUserGames) {
    const ptp = ug.playtimeByPlatform as Record<string, number | null>;
    for (const [code, mins] of Object.entries(ptp)) {
      const n = mins ?? 0;
      totalPlaytimeMinutes += n;
      playtimeMap[code] = (playtimeMap[code] ?? 0) + n;
    }
    for (const g of ug.game.genres) {
      genreMap[g] = (genreMap[g] ?? 0) + 1;
    }
  }

  const playtimeByPlatform: PlatformStat[] = Object.entries(playtimeMap)
    .sort(([, a], [, b]) => b - a)
    .map(([code, minutes]) => ({
      code,
      label: PLATFORM_LABELS[code] ?? code,
      minutes,
      pct: totalPlaytimeMinutes > 0
        ? Math.round((minutes / totalPlaytimeMinutes) * 1000) / 10
        : 0,
    }));

  const genres = Object.entries(genreMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_GENRES)
    .map(([name, count]) => ({ name, count }));

  const completionPct =
    totalGames > 0
      ? Math.round((shelfCounts['Completed'] / totalGames) * 1000) / 10
      : 0;

  // T6 rollup (M0) + DASH-PR2 period scoping. Iterate aggUserGames once,
  // tallying both the all-time achievement rollup AND the period-bounded
  // variants needed for `periodStats` below. M-D7: Steam achievements and
  // PSN trophies are distinct sets, but for a library-wide percent indicator
  // counting both makes sense — every popped trophy / achievement is
  // engagement evidence. `achievementsRollup` is `null` (UI hides the card)
  // when no row in the library has any achievement data; otherwise
  // total>0 by construction.
  let achEarned = 0;
  let achTotal = 0;
  // DASH-PR2 — engagement-scoped tallies. A row contributes iff its
  // lastPlayedAt falls in the period (period start computed above as `since`,
  // null for `'all'`). For `period === 'all'` these mirror the cumulative
  // tallies and we collapse them to the all-time values below.
  let periodEngagedGames = 0;
  let periodCompleted = 0;
  let periodAchEarned = 0;
  let periodAchTotal = 0;
  for (const ug of aggUserGames) {
    const map = (ug.achievementsByPlatform ?? {}) as Record<string, { earned?: number; total?: number }>;
    let rowEarned = 0;
    let rowTotal = 0;
    for (const e of Object.values(map)) {
      if (typeof e?.earned === 'number') rowEarned += e.earned;
      if (typeof e?.total === 'number') rowTotal += e.total;
    }
    achEarned += rowEarned;
    achTotal += rowTotal;

    const inPeriod = since === null
      || (ug.lastPlayedAt !== null && ug.lastPlayedAt >= since);
    if (inPeriod) {
      periodEngagedGames += 1;
      if (ug.status === 'Completed') periodCompleted += 1;
      periodAchEarned += rowEarned;
      periodAchTotal += rowTotal;
    }
  }
  const achievementsRollup =
    achTotal > 0
      ? {
          earned: achEarned,
          total: achTotal,
          percent: Math.round((achEarned / achTotal) * 1000) / 10,
        }
      : null;

  // DASH-PR2 — `period === 'all'` collapses to cumulative all-time. Server
  // returns this collapsed form so the frontend doesn't need branching;
  // toggle just re-fetches with a different period.
  const periodStats: DashboardPeriodStats = period === 'all'
    ? {
        completedCount: shelfCounts['Completed'],
        totalGames,
        completionPct:
          totalGames > 0
            ? Math.round((shelfCounts['Completed'] / totalGames) * 1000) / 10
            : 0,
        achievementsRollup,
      }
    : {
        completedCount: periodCompleted,
        totalGames: periodEngagedGames,
        completionPct:
          periodEngagedGames > 0
            ? Math.round((periodCompleted / periodEngagedGames) * 1000) / 10
            : 0,
        achievementsRollup:
          periodAchTotal > 0
            ? {
                earned: periodAchEarned,
                total: periodAchTotal,
                percent: Math.round((periodAchEarned / periodAchTotal) * 1000) / 10,
              }
            : null,
      };

  const stats: DashboardStats = {
    totalGames,
    playingCount: shelfCounts['Playing'],
    backlogCount: shelfCounts['Backlog'],
    completedCount: shelfCounts['Completed'],
    onHoldCount: shelfCounts['On Hold'],
    droppedCount: shelfCounts['Dropped'],
    // wishlistCount widened per CM12 + CM13 (SURFACE.md §13.7 audit punch-list):
    // counts UserGames where status='Wishlist' OR wishlistedPlatforms non-empty.
    // The groupBy-derived shelfCounts['Wishlist'] only counts global-status
    // matches; the separate count() query above captures both.
    wishlistCount,
    totalPlaytimeMinutes,
    completionPct,
    weeklyAdded,
    playtimeByPlatform,
    genres,
    achievementsRollup,
    // DASH-PR2 — top-level fields stay all-time; periodStats carries the
    // scoped variants for the completion + achievements cards.
    period,
    periodStats,
  };

  // Backlog pick: order all backlog by HLTB mainStory asc (HLTB-known first),
  // take the top N as the shuffle pool, then load full data for those N.
  const sortedBacklogIds = backlogIdsRaw
    .map((u) => ({ id: u.id, ms: u.game.hltbData?.mainStory ?? null }))
    .sort((a, b) => {
      if (a.ms != null && b.ms != null) return a.ms - b.ms;
      if (a.ms != null) return -1;
      if (b.ms != null) return 1;
      return 0;
    })
    .slice(0, BACKLOG_POOL_SIZE)
    .map((u) => u.id);

  const backlogTopRaw = sortedBacklogIds.length > 0
    ? await prisma.userGame.findMany({
        where: { id: { in: sortedBacklogIds }, userId },
        include: { game: { include: { hltbData: true } } },
      })
    : [];

  // Re-order to match the HLTB-asc order (Prisma's `in` doesn't preserve order).
  const idIndex = new Map(sortedBacklogIds.map((id, i) => [id, i]));
  backlogTopRaw.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

  const nowPlaying = nowPlayingRaw.map(mapUserGame);
  const backlogItems = backlogTopRaw.map(mapUserGame);
  const backlogPick = backlogItems[0] ?? null;

  const mappedPlatforms: Platform[] = platforms.map((p) => ({
    id: p.id,
    userId: p.userId,
    code: p.code as Platform['code'],
    syncable: p.syncable,
    lastSyncAt: p.lastSyncAt?.toISOString() ?? null,
    syncStatus: p.syncStatus as Platform['syncStatus'],
    syncFrequency: p.syncFrequency as Platform['syncFrequency'],
  }));

  const wishlistCountdown = wishlistReleases.map((w) => ({
    id: w.id,
    igdbId: w.igdbId,
    title: w.title,
    developer: w.developer,
    releaseDate: w.releaseDate?.toISOString() ?? null,
    releaseDateCategory: w.releaseDateCategory as ReleaseDateCategory,
    platforms: w.platforms,
    genres: w.genres,
    userId: w.userId,
    hype: w.hype,
    synopsis: w.synopsis,
    coverUrl: w.coverUrl ?? null,
    category: w.category,
  }));

  const activity = buildActivity(aggUserGames);

  const body: DashboardResponse = {
    stats,
    nowPlaying,
    wishlistCountdown,
    backlogPick,
    backlogItems,
    platforms: mappedPlatforms,
    activity,
  };

  res.json(body);
});

export default router;
