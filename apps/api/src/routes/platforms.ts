import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import type { PlatformCode as PrismaCode, GameStatus as PrismaGameStatus } from '@hoard/db';
import { requireUser } from '../middleware/user';
import type { PlatformStatusResponse, PlatformDetail, ManualAddBody } from '@hoard/types';
import { syncSteamLibrary } from '../services/platforms/steam';
import { syncPsnLibrary } from '../services/platforms/psn';
import { runSync } from '../services/syncRunner';

const router = Router();

const PLATFORM_NAMES: Record<string, string> = {
  ST: 'Steam',
  PS: 'PlayStation Network',
  XB: 'Xbox',
  GG: 'GOG',
  NT: 'Nintendo',
  EP: 'Epic Games',
};

// GET /api/platforms/status
router.get('/platforms/status', requireUser, async (req: Request, res: Response): Promise<void> => {
  const [platforms, rawCounts] = await Promise.all([
    prisma.platform.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.$queryRaw<Array<{ code: string; count: number }>>`
      SELECT p.code::text AS code, COUNT(ug.id)::int AS count
      FROM "Platform" p
      LEFT JOIN "UserGame" ug
        ON ug."userId" = p."userId"
        AND ug."playtimeByPlatform" ? p.code::text
      WHERE p."userId" = ${req.userId}
      GROUP BY p.code
    `,
  ]);

  const countByCode = Object.fromEntries(rawCounts.map((r) => [r.code, r.count]));

  const result: PlatformDetail[] = platforms.map((p) => ({
    id: p.id,
    userId: p.userId,
    code: p.code as PlatformDetail['code'],
    name: PLATFORM_NAMES[p.code] ?? p.code,
    syncable: p.syncable,
    connected: true,
    syncStatus: p.syncStatus as PlatformDetail['syncStatus'],
    lastSyncAt: p.lastSyncAt?.toISOString() ?? null,
    gameCount: countByCode[p.code] ?? null,
    who: (p.credentials as Record<string, string> | null)?.['username'] ?? null,
  }));

  const body: PlatformStatusResponse = { platforms: result };
  res.json(body);
});

// POST /api/platforms/:code/sync
router.post('/platforms/:code/sync', requireUser, async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string | undefined)?.toUpperCase() as PrismaCode | undefined;
  const validCodes: PrismaCode[] = ['ST', 'PS', 'XB', 'GG'];
  if (!code || !validCodes.includes(code)) {
    res.status(400).json({ error: 'Invalid or unsupported platform code' });
    return;
  }

  const platform = await prisma.platform.findUnique({
    where: { userId_code: { userId: req.userId, code } },
  });
  if (!platform) {
    res.status(404).json({ error: 'Platform not connected' });
    return;
  }
  if (!platform.syncable) {
    res.status(422).json({ error: 'Platform does not support sync' });
    return;
  }

  // Mark as syncing
  await prisma.platform.update({
    where: { id: platform.id },
    data: { syncStatus: 'syncing' },
  });

  // Fire-and-forget sync; respond immediately
  void (async () => {
    try {
      let syncedGames: Awaited<ReturnType<typeof syncSteamLibrary>> = [];

      if (code === 'ST') {
        const creds = platform.credentials as { steamId?: string } | null;
        if (!creds?.steamId) throw new Error('Steam credentials missing');
        syncedGames = await syncSteamLibrary({ steamId: creds.steamId });
      } else if (code === 'PS') {
        const creds = platform.credentials as { npsso?: string } | null;
        if (!creds?.npsso) throw new Error('PSN credentials missing');
        syncedGames = await syncPsnLibrary({ npssoToken: creds.npsso });
      }
      // XB, GG — stubs return [] until fully implemented

      if (syncedGames.length > 0) {
        await runSync(platform.userId, syncedGames);
      }

      await prisma.platform.update({
        where: { id: platform.id },
        data: { syncStatus: 'ok', lastSyncAt: new Date() },
      });
    } catch (err) {
      console.error(`[sync] ${code} error:`, err);
      await prisma.platform.update({
        where: { id: platform.id },
        data: { syncStatus: 'error' },
      });
    }
  })();

  res.json({ ok: true, status: 'syncing' });
});

// POST /api/platforms/psn/connect — save NPSSO token
router.post('/platforms/psn/connect', requireUser, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ npsso: z.string().length(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'NPSSO token must be exactly 64 characters' });
    return;
  }

  try {
    const upserted = await prisma.platform.upsert({
      where: { userId_code: { userId: req.userId, code: 'PS' } },
      update: { credentials: { npsso: parsed.data.npsso }, syncStatus: 'ok', lastSyncAt: new Date() },
      create: {
        userId: req.userId,
        code: 'PS',
        syncable: true,
        credentials: { npsso: parsed.data.npsso },
        syncStatus: 'ok',
        lastSyncAt: new Date(),
      },
    });
    res.json({ ok: true, platformId: upserted.id });
  } catch (err) {
    console.error('[psn/connect] db error:', err);
    res.status(500).json({ error: 'Failed to save PSN token — database error' });
  }
});

// POST /api/platforms/xbox/connect — save OpenXBL API key
router.post('/platforms/xbox/connect', requireUser, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ apiKey: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid API key' });
    return;
  }

  try {
    const upserted = await prisma.platform.upsert({
      where: { userId_code: { userId: req.userId, code: 'XB' } },
      update: { credentials: { apiKey: parsed.data.apiKey }, syncStatus: 'ok' },
      create: {
        userId: req.userId,
        code: 'XB',
        syncable: true,
        credentials: { apiKey: parsed.data.apiKey },
        syncStatus: 'ok',
      },
    });
    res.json({ ok: true, platformId: upserted.id });
  } catch (err) {
    console.error('[xbox/connect] db error:', err);
    res.status(500).json({ error: 'Failed to save Xbox API key — database error' });
  }
});

// DELETE /api/platforms/:code — disconnect a platform
router.delete('/platforms/:code', requireUser, async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string | undefined)?.toUpperCase() as PrismaCode | undefined;
  if (!code) {
    res.status(400).json({ error: 'Invalid platform code' });
    return;
  }

  const deleted = await prisma.platform.deleteMany({
    where: { userId: req.userId, code },
  });

  if (deleted.count === 0) {
    res.status(404).json({ error: 'Platform not found' });
    return;
  }

  res.json({ ok: true });
});

// POST /api/games/manual — manually add a game
router.post('/games/manual', requireUser, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    igdbId: z.number().int().positive(),
    platformLabel: z.string().min(1).max(50),
    status: z.enum(['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist']),
    title: z.string().min(1).max(300),
    developer: z.string().optional(),
    coverUrl: z.string().url().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { igdbId, platformLabel, status, title, developer, coverUrl } = parsed.data;

  const game = await prisma.game.upsert({
    where: { igdbId },
    update: {},
    create: {
      igdbId,
      title,
      ...(developer ? { developer } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    },
  });

  const prismaStatus = (status === 'On Hold' ? 'OnHold' : status) as PrismaGameStatus;

  const userGame = await prisma.userGame.upsert({
    where: { userId_gameId: { userId: req.userId, gameId: game.id } },
    update: { status: prismaStatus },
    create: {
      userId: req.userId,
      gameId: game.id,
      status: prismaStatus,
      playtimeByPlatform: { [platformLabel]: 0 },
    },
    include: { game: { include: { hltbData: true } } },
  });

  res.status(201).json({
    id: userGame.id,
    igdbId: game.igdbId,
    title: game.title,
    gameId: game.id,
    userId: req.userId,
    platformLabel,
    status,
  } satisfies ManualAddBody & { id: string; gameId: string; userId: string });
});

export default router;
