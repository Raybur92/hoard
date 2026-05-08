import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import type { PlatformCode as PrismaCode, GameStatus as PrismaGameStatus } from '@hoard/db';
import { requireUser } from '../middleware/user';
import type { PlatformStatusResponse, PlatformDetail, ManualAddBody } from '@hoard/types';
import { syncSteamLibrary, getSteamWishlist } from '../services/platforms/steam';
import { syncPsnLibrary, getPsnTrophyTitles } from '../services/platforms/psn';
import { triggerSteamAchievementsBackground } from '../services/platforms/steamAchievements';
import { runSync } from '../services/syncRunner';
import { applyPsnTrophyAggregates } from '../services/trophies';
import { applySteamWishlistImport } from '../services/wishlistImport';

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
    syncFrequency: p.syncFrequency as PlatformDetail['syncFrequency'],
    lastSyncAt: p.lastSyncAt?.toISOString() ?? null,
    gameCount: countByCode[p.code] ?? null,
    who: (p.credentials as Record<string, string> | null)?.['username'] ?? null,
  }));

  const body: PlatformStatusResponse = { platforms: result };
  res.set('Cache-Control', 'private, max-age=30');
  res.json(body);
});

// GET /api/platforms/:code/credentials — return the user's revealable
// credential field for the platform. Used by the [reveal] button on
// PlatformDetail's auth tab so the user can verify what's stored. Not
// cached client-side, fetched on-demand only. Auth-required.
//
// Response shape varies per platform:
//   PS → { npsso: string | null }
//   ST → { steamId: string | null }
//   XB → { apiKey: string | null }
//   Others (GG/NT/EP) → 404 (no credentials, or not yet implemented).
router.get('/platforms/:code/credentials', requireUser, async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string | undefined)?.toUpperCase() as PrismaCode | undefined;
  const validCodes: PrismaCode[] = ['ST', 'PS', 'XB'];
  if (!code || !validCodes.includes(code)) {
    res.status(404).json({ error: 'No revealable credentials for this platform' });
    return;
  }

  const platform = await prisma.platform.findUnique({
    where: { userId_code: { userId: req.userId, code } },
  });
  if (!platform) {
    res.status(404).json({ error: 'Platform not connected' });
    return;
  }

  const creds = platform.credentials as Record<string, string> | null;
  if (!creds) {
    res.status(404).json({ error: 'No credentials stored' });
    return;
  }

  // Never cache — credentials should not sit in browser cache.
  res.set('Cache-Control', 'no-store');

  if (code === 'PS') {
    res.json({ npsso: creds['npsso'] ?? null });
    return;
  }
  if (code === 'ST') {
    res.json({ steamId: creds['steamId'] ?? null });
    return;
  }
  if (code === 'XB') {
    res.json({ apiKey: creds['apiKey'] ?? null });
    return;
  }
});

// PATCH /api/platforms/:code — update per-platform settings (currently
// just `syncFrequency`). Returns the updated `PlatformDetail`-shaped row
// so the client can swap state without a refetch.
router.patch('/platforms/:code', requireUser, async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string | undefined)?.toUpperCase() as PrismaCode | undefined;
  const validCodes: PrismaCode[] = ['ST', 'PS', 'XB', 'GG', 'NT', 'EP'];
  if (!code || !validCodes.includes(code)) {
    res.status(400).json({ error: 'Invalid platform code' });
    return;
  }

  const schema = z.object({
    syncFrequency: z.enum(['FIVE_MIN', 'FIFTEEN_MIN', 'HOURLY', 'MANUAL']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  // No-op body: respond with the current row instead of a 400. Lets the
  // client send `{}` to refresh state without special-casing.
  const platform = await prisma.platform.findUnique({
    where: { userId_code: { userId: req.userId, code } },
  });
  if (!platform) {
    res.status(404).json({ error: 'Platform not connected' });
    return;
  }

  const updated = parsed.data.syncFrequency
    ? await prisma.platform.update({
        where: { id: platform.id },
        data: { syncFrequency: parsed.data.syncFrequency },
      })
    : platform;

  res.json({
    id: updated.id,
    userId: updated.userId,
    code: updated.code as PlatformDetail['code'],
    name: PLATFORM_NAMES[updated.code] ?? updated.code,
    syncable: updated.syncable,
    connected: true,
    syncStatus: updated.syncStatus as PlatformDetail['syncStatus'],
    syncFrequency: updated.syncFrequency as PlatformDetail['syncFrequency'],
    lastSyncAt: updated.lastSyncAt?.toISOString() ?? null,
    gameCount: null,
    who: (updated.credentials as Record<string, string> | null)?.['username'] ?? null,
  } satisfies PlatformDetail);
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
      // Captured for the inline trophy fetch (PSN) and background
      // achievement fetch (Steam) below — same creds, no need to re-read.
      let psnNpsso: string | null = null;
      let steamId: string | null = null;

      if (code === 'ST') {
        const creds = platform.credentials as { steamId?: string } | null;
        if (!creds?.steamId) throw new Error('Steam credentials missing');
        steamId = creds.steamId;
        syncedGames = await syncSteamLibrary({ steamId });
      } else if (code === 'PS') {
        const creds = platform.credentials as { npsso?: string } | null;
        if (!creds?.npsso) throw new Error('PSN credentials missing');
        psnNpsso = creds.npsso;
        syncedGames = await syncPsnLibrary({ npssoToken: psnNpsso });
      }
      // XB, GG — stubs return [] until fully implemented

      if (syncedGames.length > 0) {
        await runSync(platform.userId, syncedGames);
      }

      // T2 — pull PSN trophy aggregates after the library import. T-D4:
      // PSN's `getUserTitles` is one paginated call for the whole library
      // (unlike Steam's per-game achievement fetch in T3, which goes on
      // the background queue). Failure here doesn't fail the whole sync —
      // the library import already succeeded; trophy data backfills on
      // the next sync.
      if (code === 'PS' && psnNpsso) {
        try {
          const trophyTitles = await getPsnTrophyTitles(psnNpsso);
          const result = await applyPsnTrophyAggregates(platform.userId, trophyTitles);
          console.log(`[sync PS] trophies: matched=${result.matched} autoCompleted=${result.autoCompleted} missed=${result.missed}`);
        } catch (err) {
          console.error(`[sync PS] trophy fetch failed (library import succeeded):`, err);
        }
      }

      await prisma.platform.update({
        where: { id: platform.id },
        data: { syncStatus: 'ok', lastSyncAt: new Date() },
      });

      // T3 — background pass over every Steam-platformed UserGame to fetch
      // achievement aggregates. Throttled at ~3 req/s, so a 1000-game
      // library takes ~5 minutes. We mark the platform `ok` BEFORE this
      // starts so the user's UI flips to "synced" immediately; achievement
      // data trickles in over the next few minutes. Same pattern as HLTB.
      // Fire-and-forget — failures are logged inside the orchestrator.
      //
      // Bundled with Steam's wishlist import (2026-05-08): public-profile
      // caveat is the same as for achievements — silent skip if private.
      // Wishlist import is a single endpoint call + per-item IGDB resolves;
      // an order of magnitude smaller than the achievement pass, so we
      // run it inside the same fire-and-forget block.
      if (code === 'ST' && steamId) {
        const sid = steamId;
        const uid = platform.userId;
        void (async () => {
          try {
            const wishlistItems = await getSteamWishlist(sid);
            if (wishlistItems.length > 0) {
              const r = await applySteamWishlistImport(uid, wishlistItems);
              console.log(`[sync ST] wishlist: candidates=${r.candidates} imported=${r.imported} alreadyHad=${r.alreadyHad} unresolved=${r.unresolved} errors=${r.errors}`);
            }
          } catch (err) {
            console.error(`[sync ST] wishlist import failed:`, err);
          }

          try {
            const r = await triggerSteamAchievementsBackground(uid, sid);
            console.log(`[sync ST] achievements: candidates=${r.candidates} fetched=${r.fetched} skipped=${r.skipped} autoCompleted=${r.autoCompleted} errors=${r.errors}`);
          } catch (err) {
            console.error(`[sync ST] achievement background pass failed:`, err);
          }
        })();
      }
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
