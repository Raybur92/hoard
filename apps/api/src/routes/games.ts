import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import type { GameStatus as PrismaGameStatus } from '@hoard/db';
import { z } from 'zod';
import { requireUser } from '../middleware/user';
import type { UserGameDetail, GameListResponse, PatchGameBody } from '@hoard/types';
import { fetchHltb } from '../services/hltb';

function triggerHltbBackground(gameId: string, title: string, steamAppId?: number | null): void {
  void (async () => {
    const result = await fetchHltb(title, steamAppId);
    if (!result) return;
    await prisma.hltbData.upsert({
      where: { gameId },
      update: { mainStory: result.mainStory, mainExtras: result.mainExtras, completionist: result.completionist, fetchedAt: new Date() },
      create: { gameId, mainStory: result.mainStory, mainExtras: result.mainExtras, completionist: result.completionist },
    });
  })();
}

const router = Router();

function toPrismaStatus(s: string): PrismaGameStatus {
  return (s === 'On Hold' ? 'OnHold' : s) as PrismaGameStatus;
}

function fromPrismaStatus(s: string): UserGameDetail['status'] {
  return (s === 'OnHold' ? 'On Hold' : s) as UserGameDetail['status'];
}

function mapUserGame(ug: {
  id: string; userId: string; gameId: string; status: string;
  playtimeByPlatform: unknown; lastPlayedAt: Date | null; notes: string | null;
  rating: number | null; addedAt: Date; updatedAt: Date;
  game: {
    id: string; igdbId: number; title: string; developer: string | null;
    releaseYear: number | null; genres: string[]; coverUrl: string | null;
    hltbData: {
      id: string; gameId: string; mainStory: number | null;
      mainExtras: number | null; completionist: number | null; fetchedAt: Date;
    } | null;
  };
}): UserGameDetail {
  return {
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
    status: fromPrismaStatus(ug.status),
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
  };
}

const gamesQuerySchema = z.object({
  status: z.enum(['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist']).optional(),
  platform: z.string().max(10).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(['lastPlayed', 'title', 'playtime']).default('lastPlayed'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(2000).default(50),
});

// GET /api/games
router.get('/games', requireUser, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  const parsed = gamesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }
  const { status, platform, q, sort, page: pageNum, limit: limitNum } = parsed.data;

  const where = {
    userId,
    ...(status ? { status: toPrismaStatus(status) } : {}),
    ...(q ? { game: { title: { contains: q, mode: 'insensitive' as const } } } : {}),
  };

  const orderBy =
    sort === 'title'     ? { game: { title: 'asc' as const } } :
    sort === 'playtime'  ? { updatedAt: 'desc' as const } :
                           { lastPlayedAt: 'desc' as const };

  const [games, total] = await Promise.all([
    prisma.userGame.findMany({
      where,
      include: { game: { include: { hltbData: true } } },
      orderBy,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.userGame.count({ where }),
  ]);

  let filtered = games.map(mapUserGame);

  if (platform) {
    filtered = filtered.filter(ug =>
      platform.toUpperCase() in ug.playtimeByPlatform,
    );
  }

  const body: GameListResponse = {
    games: filtered,
    total,
    page: pageNum,
    limit: limitNum,
    hasMore: pageNum * limitNum < total,
  };

  res.json(body);
});

// GET /api/games/counts — per-status counts without pagination
router.get('/games/counts', requireUser, async (req: Request, res: Response): Promise<void> => {
  const groups = await prisma.userGame.groupBy({
    by: ['status'],
    where: { userId: req.userId },
    _count: { status: true },
  });
  const counts: Partial<Record<string, number>> = {};
  for (const g of groups) {
    const key = g.status === 'OnHold' ? 'On Hold' : g.status;
    counts[key] = g._count.status;
  }
  res.json({ counts });
});

// GET /api/games/:id
router.get('/games/:id', requireUser, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const userId = req.userId;

  const ug = await prisma.userGame.findFirst({
    where: { id, userId },
    include: { game: { include: { hltbData: true } } },
  });

  if (!ug) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json(mapUserGame(ug));
});

const patchSchema = z.object({
  status: z.enum(['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist']).optional(),
  notes: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
});

// PATCH /api/games/:id
router.patch('/games/:id', requireUser, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const userId = req.userId;

  const parsed = patchSchema.safeParse(req.body as PatchGameBody);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.userGame.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const updateData: {
    status?: PrismaGameStatus;
    notes?: string | null;
    rating?: number | null;
  } = {};
  if (parsed.data.status !== undefined) updateData.status = toPrismaStatus(parsed.data.status);
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.rating !== undefined) updateData.rating = parsed.data.rating;

  const updated = await prisma.userGame.update({
    where: { id },
    data: updateData,
    include: { game: { include: { hltbData: true } } },
  });

  // Trigger background HLTB refresh when a game moves to Playing or Backlog and has no HLTB data yet
  if (
    updateData.status &&
    (updateData.status === 'Playing' || updateData.status === 'Backlog') &&
    !updated.game.hltbData
  ) {
    triggerHltbBackground(updated.game.id, updated.game.title, updated.game.steamAppId);
  }

  res.json(mapUserGame(updated));
});

export default router;
