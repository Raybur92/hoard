import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { mapUserGame } from '../lib/mappers';
import type {
  ActivityHeatmap,
  DashboardResponse,
  DashboardStats,
  PlatformStat,
  Platform,
  ReleaseDateCategory,
} from '@hoard/types';

const router = Router();

const PLATFORM_LABELS: Record<string, string> = {
  ST: 'STEAM', PS: 'PSN', XB: 'XBOX', GG: 'GOG', NT: 'NINTENDO', EP: 'EPIC',
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

router.get('/dashboard', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [
    countGroups,
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
    // lastPlayedAt for the activity heatmap). Loads every UserGame but ~80%
    // smaller per row than including full Game.
    prisma.userGame.findMany({
      where: { userId },
      select: {
        playtimeByPlatform: true,
        lastPlayedAt: true,
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

  const stats: DashboardStats = {
    totalGames,
    playingCount: shelfCounts['Playing'],
    backlogCount: shelfCounts['Backlog'],
    completedCount: shelfCounts['Completed'],
    onHoldCount: shelfCounts['On Hold'],
    droppedCount: shelfCounts['Dropped'],
    wishlistCount: shelfCounts['Wishlist'],
    totalPlaytimeMinutes,
    completionPct,
    weeklyAdded,
    playtimeByPlatform,
    genres,
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
