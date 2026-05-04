import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import type { StatsResponse, PlatformStat, GameStatus } from '@hoard/types';

const router = Router();

const PLATFORM_LABELS: Record<string, string> = {
  ST: 'STEAM', PS: 'PSN', XB: 'XBOX', GG: 'GOG', NT: 'NINTENDO', EP: 'EPIC',
};

router.get('/stats', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  const userGames = await prisma.userGame.findMany({
    where: { userId },
    include: { game: true },
  });

  const shelfCounts: Partial<Record<GameStatus, number>> = {};
  let totalPlaytimeMinutes = 0;
  const playtimeMap: Record<string, number> = {};
  const genreMap: Record<string, number> = {};

  for (const ug of userGames) {
    const s = (ug.status === 'OnHold' ? 'On Hold' : ug.status) as GameStatus;
    shelfCounts[s] = (shelfCounts[s] ?? 0) + 1;

    for (const [code, mins] of Object.entries(ug.playtimeByPlatform as Record<string, number>)) {
      totalPlaytimeMinutes += mins;
      playtimeMap[code] = (playtimeMap[code] ?? 0) + mins;
    }

    for (const genre of ug.game.genres) {
      genreMap[genre] = (genreMap[genre] ?? 0) + 1;
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

  const genreBreakdown = Object.entries(genreMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const totalGames = userGames.length;
  const completedGames = shelfCounts['Completed'] ?? 0;
  const completionPct =
    totalGames > 0 ? Math.round((completedGames / totalGames) * 1000) / 10 : 0;

  const body: StatsResponse = {
    totalGames,
    completedGames,
    completionPct,
    totalPlaytimeMinutes,
    playtimeByPlatform,
    genreBreakdown,
    shelfCounts,
  };

  res.json(body);
});

export default router;
