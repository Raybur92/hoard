import { Router, Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import type {
  DashboardResponse,
  DashboardStats,
  PlatformStat,
  UserGameDetail,
  Platform,
} from '@hoard/types';

const router = Router();

const PLATFORM_LABELS: Record<string, string> = {
  ST: 'STEAM', PS: 'PSN', XB: 'XBOX', GG: 'GOG', NT: 'NINTENDO', EP: 'EPIC',
};

router.get('/dashboard', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  const [userGamesRaw, platforms, wishlistReleases] = await Promise.all([
    prisma.userGame.findMany({
      where: { userId },
      include: { game: { include: { hltbData: true } } },
      orderBy: { lastPlayedAt: 'desc' },
    }),
    prisma.platform.findMany({ where: { userId } }),
    prisma.wishlistRelease.findMany({
      where: { userId, releaseDate: { gte: new Date() } },
      orderBy: { releaseDate: 'asc' },
      take: 5,
    }),
  ]);

  // Map prisma records to API types
  const userGames: UserGameDetail[] = userGamesRaw.map(ug => ({
    id: ug.id,
    userId: ug.userId,
    gameId: ug.gameId,
    game: {
      id: ug.game.id,
      igdbId: ug.game.igdbId,
      title: ug.game.title,
      developer: ug.game.developer,
      releaseYear: ug.game.releaseYear,
      genres: ug.game.genres,
      coverUrl: ug.game.coverUrl,
    },
    status: (ug.status === 'OnHold' ? 'On Hold' : ug.status) as UserGameDetail['status'],
    playtimeByPlatform: ug.playtimeByPlatform as UserGameDetail['playtimeByPlatform'],
    lastPlayedAt: ug.lastPlayedAt?.toISOString() ?? null,
    notes: ug.notes,
    rating: ug.rating,
    addedAt: ug.addedAt.toISOString(),
    updatedAt: ug.updatedAt.toISOString(),
    hltb: ug.game.hltbData
      ? {
          id: ug.game.hltbData.id,
          gameId: ug.game.hltbData.gameId,
          mainStory: ug.game.hltbData.mainStory,
          mainExtras: ug.game.hltbData.mainExtras,
          completionist: ug.game.hltbData.completionist,
          fetchedAt: ug.game.hltbData.fetchedAt.toISOString(),
        }
      : null,
  }));

  // Shelf counts
  const shelfCounts = {
    Playing: 0, Backlog: 0, Completed: 0, 'On Hold': 0, Dropped: 0, Wishlist: 0,
  };
  let totalPlaytimeMinutes = 0;
  const playtimeMap: Record<string, number> = {};

  for (const ug of userGames) {
    const s = ug.status as keyof typeof shelfCounts;
    if (s in shelfCounts) shelfCounts[s]++;

    for (const [code, mins] of Object.entries(ug.playtimeByPlatform)) {
      totalPlaytimeMinutes += mins ?? 0;
      playtimeMap[code] = (playtimeMap[code] ?? 0) + (mins ?? 0);
    }
  }

  // Platform stats
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

  // Genre breakdown (count from all games)
  const genreMap: Record<string, number> = {};
  for (const ug of userGames) {
    for (const g of ug.game.genres) {
      genreMap[g] = (genreMap[g] ?? 0) + 1;
    }
  }
  const genres = Object.entries(genreMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Weekly added: games added in the last 7 days
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000);
  const weeklyAdded = userGames.filter(
    ug => new Date(ug.addedAt) >= oneWeekAgo,
  ).length;

  const totalGames = userGames.length;
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

  const nowPlaying = userGames.filter(ug => ug.status === 'Playing').slice(0, 3);

  // Backlog pick: game with shortest HLTB mainStory
  // backlogItems is sorted shortest-HLTB first so backlogItems[0] === backlogPick
  const backlogGames = userGames.filter(ug => ug.status === 'Backlog');
  const sortedBacklog = [
    ...backlogGames.filter(ug => ug.hltb?.mainStory != null)
      .sort((a, b) => (a.hltb!.mainStory ?? 0) - (b.hltb!.mainStory ?? 0)),
    ...backlogGames.filter(ug => ug.hltb?.mainStory == null),
  ];
  const pick = sortedBacklog[0] ?? null;

  const mappedPlatforms: Platform[] = platforms.map(p => ({
    id: p.id,
    userId: p.userId,
    code: p.code as Platform['code'],
    syncable: p.syncable,
    lastSyncAt: p.lastSyncAt?.toISOString() ?? null,
    syncStatus: p.syncStatus as Platform['syncStatus'],
  }));

  const wishlistCountdown = wishlistReleases.map(w => ({
    id: w.id,
    igdbId: w.igdbId,
    title: w.title,
    developer: w.developer,
    releaseDate: w.releaseDate?.toISOString() ?? null,
    releaseDateCategory: w.releaseDateCategory as WishlistReleaseCategory,
    platforms: w.platforms,
    genres: w.genres,
    userId: w.userId,
    hype: w.hype,
    synopsis: w.synopsis,
    coverUrl: w.coverUrl ?? null,
  }));

  const body: DashboardResponse = {
    stats,
    nowPlaying,
    wishlistCountdown,
    backlogPick: pick ?? null,
    backlogItems: sortedBacklog,
    platforms: mappedPlatforms,
  };

  res.json(body);
});

type WishlistReleaseCategory = import('@hoard/types').ReleaseDateCategory;

export default router;
