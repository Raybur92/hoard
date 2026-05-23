import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import type { PlatformCode as PrismaCode, GameStatus as PrismaGameStatus } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import type { PlatformStatusResponse, PlatformDetail, ManualAddBody, PlatformLogResponse, PlatformLogEntry } from '@hoard/types';
import { syncSteamLibrary, getSteamWishlist } from '../services/platforms/steam';
import { syncPsnLibrary, getPsnTrophyTitles } from '../services/platforms/psn';
import { triggerSteamAchievementsBackground } from '../services/platforms/steamAchievements';
import { runSync } from '../services/syncRunner';
import { applyPsnTrophyAggregates } from '../services/trophies';
import { applySteamWishlistImport } from '../services/wishlistImport';
import { logPlatform } from '../services/platformLog';
import { logEvent } from '../services/userEvents';

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
router.get('/platforms/status', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
router.get('/platforms/:code/credentials', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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

// GET /api/platforms/:code/log — cursor-paginated activity feed for the
// platform. Backs the Log tab on PlatformDetail. Sorted by `createdAt DESC`
// with `id DESC` as the tiebreaker for stable order across entries written
// in the same millisecond. Capped at 50 entries per page.
router.get('/platforms/:code/log', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const code = (req.params['code'] as string | undefined)?.toUpperCase() as PrismaCode | undefined;
  const validCodes: PrismaCode[] = ['ST', 'PS', 'XB', 'GG', 'NT', 'EP'];
  if (!code || !validCodes.includes(code)) {
    res.status(400).json({ error: 'Invalid platform code' });
    return;
  }

  const platform = await prisma.platform.findUnique({
    where: { userId_code: { userId: req.userId, code } },
  });
  if (!platform) {
    res.status(404).json({ error: 'Platform not connected' });
    return;
  }

  const cursor = req.query['cursor'] as string | undefined;
  const PAGE = 50;

  const entries = await prisma.platformLog.findMany({
    where: { platformId: platform.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const mapped: PlatformLogEntry[] = entries.map((e) => ({
    id: e.id,
    level: e.level as PlatformLogEntry['level'],
    event: e.event,
    message: e.message,
    details: (e.details as Record<string, unknown> | null) ?? null,
    createdAt: e.createdAt.toISOString(),
  }));

  // If we got a full page, the next cursor is the last entry's id. Anything
  // smaller than PAGE means we drained the table.
  const nextCursor = entries.length === PAGE ? entries[entries.length - 1]!.id : null;

  const body: PlatformLogResponse = { entries: mapped, nextCursor };
  res.json(body);
});

// PATCH /api/platforms/:code — update per-platform settings (currently
// just `syncFrequency`). Returns the updated `PlatformDetail`-shaped row
// so the client can swap state without a refetch.
router.patch('/platforms/:code', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
router.post('/platforms/:code/sync', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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

  // TL1.2 sync.first detection — capture pre-sync state into a local
  // variable BEFORE we touch Platform.lastSyncAt. The natural mistake
  // would be reading platform.lastSyncAt later in the handler, by which
  // point the post-sync `prisma.platform.update({ lastSyncAt: new Date() })`
  // has already nulled the null. Local capture pins the "was this the
  // first sync?" answer at the right moment.
  const wasFirstSync = platform.lastSyncAt === null;

  // Mark as syncing
  await prisma.platform.update({
    where: { id: platform.id },
    data: { syncStatus: 'syncing' },
  });

  // Fire-and-forget sync; respond immediately
  void (async () => {
    // PR B — every sync touchpoint emits a log entry the user can see on
    // the Log tab. Logging failures never fail the sync (logPlatform
    // swallows its own errors).
    const startedAt = Date.now();
    let gamesImported = 0;
    await logPlatform(platform.id, platform.userId, 'info', 'sync.started', `// ${code} sync started`);

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
        const r = await runSync(platform.userId, syncedGames);
        gamesImported = r.imported;
        await logPlatform(
          platform.id, platform.userId, 'info',
          'library.imported',
          `library: ${r.imported} imported, ${r.skipped} skipped`,
          { imported: r.imported, skipped: r.skipped },
        );
      } else if (code === 'XB' || code === 'GG') {
        await logPlatform(
          platform.id, platform.userId, 'warn',
          'library.unsupported',
          `library sync not implemented for ${code} yet`,
        );
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
          await logPlatform(
            platform.id, platform.userId, 'info',
            'trophies.applied',
            `trophies: ${result.matched} matched, ${result.autoCompleted} auto-completed, ${result.missed} missed`,
            result,
          );
        } catch (err) {
          console.error(`[sync PS] trophy fetch failed (library import succeeded):`, err);
          await logPlatform(
            platform.id, platform.userId, 'warn',
            'trophies.failed',
            'trophy fetch failed — library import still succeeded',
          );
        }
      }

      await prisma.platform.update({
        where: { id: platform.id },
        data: { syncStatus: 'ok', lastSyncAt: new Date() },
      });
      const durationS = ((Date.now() - startedAt) / 1000).toFixed(1);
      await logPlatform(
        platform.id, platform.userId, 'info',
        'sync.ok',
        `sync ok in ${durationS}s`,
        { durationMs: Date.now() - startedAt },
      );

      // TL1.2 sync.first — write only on the first successful sync per
      // user+platform. `wasFirstSync` was captured before the platform
      // update above flipped lastSyncAt from null to NOW(). Race-prone
      // (two concurrent sync requests could both observe null and both
      // write) per the §3.4 note — not a correctness problem; dedupe
      // in admin view if it ever happens.
      if (wasFirstSync) {
        await logEvent(platform.userId, 'sync.first', { code, gamesImported });
      }

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
        const pid = platform.id;
        void (async () => {
          try {
            const wishlistItems = await getSteamWishlist(sid);
            if (wishlistItems.length > 0) {
              const r = await applySteamWishlistImport(uid, wishlistItems);
              await logPlatform(
                pid, uid, 'info',
                'wishlist.imported',
                `wishlist: ${r.imported} imported, ${r.alreadyHad} already had, ${r.unresolved} unresolved`,
                r,
              );
            }
          } catch (err) {
            console.error(`[sync ST] wishlist import failed:`, err);
            await logPlatform(pid, uid, 'warn', 'wishlist.failed', 'wishlist import failed');
          }

          try {
            const r = await triggerSteamAchievementsBackground(uid, sid);
            await logPlatform(
              pid, uid, 'info',
              'achievements.applied',
              `achievements: ${r.fetched} fetched, ${r.skipped} skipped, ${r.autoCompleted} auto-completed, ${r.errors} errors`,
              r,
            );
          } catch (err) {
            console.error(`[sync ST] achievement background pass failed:`, err);
            await logPlatform(pid, uid, 'warn', 'achievements.failed', 'achievement background pass failed');
          }
        })();
      }
    } catch (err) {
      console.error(`[sync] ${code} error:`, err);
      await prisma.platform.update({
        where: { id: platform.id },
        data: { syncStatus: 'error' },
      });
      await logPlatform(
        platform.id, platform.userId, 'error',
        'sync.error',
        `sync failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  })();

  res.json({ ok: true, status: 'syncing' });
});

// POST /api/platforms/psn/connect — save NPSSO token
router.post('/platforms/psn/connect', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
    // TL1.2 platform.connected — fires for both fresh-attach and
    // re-attach (token refresh). Plan §3.4 doesn't distinguish.
    await logEvent(req.userId, 'platform.connected', { code: 'PS' });
    res.json({ ok: true, platformId: upserted.id });
  } catch (err) {
    console.error('[psn/connect] db error:', err);
    res.status(500).json({ error: 'Failed to save PSN token — database error' });
  }
});

// POST /api/platforms/xbox/connect — save OpenXBL API key
router.post('/platforms/xbox/connect', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
    // TL1.2 platform.connected — fires for both fresh-attach and re-attach.
    await logEvent(req.userId, 'platform.connected', { code: 'XB' });
    res.json({ ok: true, platformId: upserted.id });
  } catch (err) {
    console.error('[xbox/connect] db error:', err);
    res.status(500).json({ error: 'Failed to save Xbox API key — database error' });
  }
});

// DELETE /api/platforms/:code — disconnect a platform
router.delete('/platforms/:code', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
//
// F1-PR2 (2026-05-22) extends the schema with collector-metadata fields
// from the new modal: mediaType, condition, region, wishlistedPlatforms.
// All are optional — when omitted, the corresponding UserGame columns
// stay at their schema defaults (null for mediaType/condition/region,
// empty array for wishlistedPlatforms).
//
// F1-PR3 (2026-05-23) adds optional manualPlaytimeMinutes from the
// `[+ more details]` panel. When provided, the value seeds
// playtimeByPlatform[platformLabel] on create instead of the legacy
// `0` default. Update path is unchanged for playtime — the full
// silent-merge matrix lands in F1-PR5; for now manual playtime is
// strictly first-write (synced rows never get clobbered).
//
// The upsert still does the minimal status-overwrite-on-update path
// inherited from before F1 (the full conflict matrix per CM12 + CM13
// lands in F1-PR5). For F1-PR2/PR3 the new fields just flow through
// to the row when present.
router.post('/games/manual', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    igdbId: z.number().int().positive(),
    platformLabel: z.string().min(1).max(50),
    status: z.enum(['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist']),
    title: z.string().min(1).max(300),
    developer: z.string().optional(),
    coverUrl: z.string().url().optional(),
    // F1-PR2 collector-metadata fields (all optional; null/undefined → field stays at schema default)
    mediaType: z.enum(['DIGITAL', 'PHYSICAL']).optional(),
    condition: z.enum(['LOOSE', 'CIB', 'SEALED', 'REPLICA', 'GRADED']).optional(),
    region: z.enum(['NTSC_U', 'NTSC_J', 'PAL', 'OTHER']).optional(),
    wishlistedPlatforms: z.array(z.string().min(1).max(50)).max(20).optional(),
    // F1-PR3 manual playtime — bounded at 10000 hours (600000 min) which
    // is well above the highest credible single-game count and well below
    // anything that signals a data-entry mistake worth surfacing. Decimal
    // values rejected — the modal only emits whole minutes.
    manualPlaytimeMinutes: z.number().int().min(0).max(600000).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { igdbId, platformLabel, status, title, developer, coverUrl, mediaType, condition, region, wishlistedPlatforms, manualPlaytimeMinutes } = parsed.data;

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

  // Optional-field passthrough — only included in the upsert payload when
  // the request actually provided them. Avoids accidentally overwriting an
  // existing value with undefined.
  const optionalFields = {
    ...(mediaType !== undefined          ? { mediaType }          : {}),
    ...(condition !== undefined          ? { condition }          : {}),
    ...(region !== undefined             ? { region }             : {}),
    ...(wishlistedPlatforms !== undefined ? { wishlistedPlatforms } : {}),
  };

  // Seed playtime from manualPlaytimeMinutes when present; fall back to
  // the legacy `0` so existing callers / older clients keep working.
  const initialPlaytime = manualPlaytimeMinutes ?? 0;

  const userGame = await prisma.userGame.upsert({
    where: { userId_gameId: { userId: req.userId, gameId: game.id } },
    update: { status: prismaStatus, ...optionalFields },
    create: {
      userId: req.userId,
      gameId: game.id,
      status: prismaStatus,
      playtimeByPlatform: { [platformLabel]: initialPlaytime },
      ...optionalFields,
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
