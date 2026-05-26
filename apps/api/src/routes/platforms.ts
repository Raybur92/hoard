import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@hoard/db';
import type { PlatformCode as PrismaCode, GameStatus as PrismaGameStatus } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import type { PlatformStatusResponse, PlatformDetail, PlatformLogResponse, PlatformLogEntry } from '@hoard/types';
import { mapUserGame } from '../lib/mappers';
import { promoteWishlistOnOwnership } from '../lib/promoteWishlist';
import { getReleaseDetails } from '../services/igdb';
import { syncSteamLibrary, getSteamWishlist } from '../services/platforms/steam';
import { syncPsnLibrary, getPsnTrophyTitles } from '../services/platforms/psn';
import { syncXboxLibrary } from '../services/platforms/xbox';
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
      } else if (code === 'XB') {
        // Xbox sync via OpenXBL. `apiKey` was persisted by
        // POST /api/platforms/xbox/connect at line 446. syncXboxLibrary
        // throws on missing key / non-2xx / malformed JSON / network
        // error — the outer try/catch logs the failure as
        // `library.failed` (mirroring trophies/achievements pattern)
        // without taking down the whole sync flow.
        const creds = platform.credentials as { apiKey?: string } | null;
        if (!creds?.apiKey) throw new Error('Xbox credentials missing');
        syncedGames = await syncXboxLibrary({ apiKey: creds.apiKey });

        // TEMP DIAGNOSTIC (2026-05-26 round 2) — Accept-Language fix
        // landed (sync timing jumped from ~1s to ~3s, real network call
        // is happening) but syncedGames still came back empty. Re-grab
        // the raw response when titles=0 so we can see what shape
        // OpenXBL is returning. Self-clears once we have a non-empty
        // sync — this branch only runs on the "still broken" path.
        if (syncedGames.length === 0) {
          try {
            const debugRes = await fetch('https://xbl.io/api/v2/player/titleHistory', {
              headers: {
                'X-Authorization': creds.apiKey,
                Accept: 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            });
            const debugText = await debugRes.text();
            await logPlatform(
              platform.id, platform.userId, 'info',
              'sync.debug',
              `openxbl status=${debugRes.status} body=${debugText.slice(0, 1500)}`,
            );
          } catch (err) {
            await logPlatform(
              platform.id, platform.userId, 'warn',
              'sync.debug',
              `openxbl debug fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
      // GG — stub returns [] until fully implemented (next sub-unit
      // after Xbox sync stabilises).

      if (syncedGames.length > 0) {
        const r = await runSync(platform.userId, syncedGames);
        gamesImported = r.imported;
        await logPlatform(
          platform.id, platform.userId, 'info',
          'library.imported',
          `library: ${r.imported} imported, ${r.skipped} skipped`,
          { imported: r.imported, skipped: r.skipped },
        );
      } else if (code === 'GG') {
        // XB no longer falls through here — it has real sync support.
        // An empty XB result is "user has no games", not "sync not
        // implemented", and should look like a normal zero-game sync.
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
// F1-PR2 (2026-05-22) added collector-metadata fields (mediaType /
// condition / region / wishlistedPlatforms). F1-PR3 (2026-05-23) added
// optional manualPlaytimeMinutes from the [+ more details] panel.
//
// F1-PR5 (2026-05-23) replaces the naive overwrite-on-update upsert with
// the full CM12 + CM13 conflict matrix per docs/INTERACTION_FLOW.md §3.2.
// Six rows summarised:
//   1. No existing row + new owned        → create with playtime on P
//   2. No existing row + new wishlist     → create status=Wishlist, empty playtime
//   3. Existing, P already in playtime, new owned    → no-op on playtime, status from new
//   4. Existing, P not in playtime, new owned        → merge P into playtime, status from new
//   5. Existing status=Wishlist, new owned (ANY P)   → CM13 auto-promote via promoteWishlistOnOwnership(); user's status pick is overridden by the policy (OnHold if total playtime > 0, else Backlog)
//   6. Existing status ≠ Wishlist, new wishlist      → no-op on status (respect user's library decision)
//
// wishlistedPlatforms is NEVER auto-populated here — per CM13 it's a
// GameDetail-only collector affordance. The endpoint accepts an explicit
// wishlistedPlatforms field for future use, but no flow in F1 sets it.
//
// Response is the full mapUserGame() shape (UserGameDetail) so the
// frontend success summary can carry the userGameId into F1-PR6's
// [+ rate / note] deep-link without a refetch.
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
  const newIsWishlist = prismaStatus === 'Wishlist';

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
  // the legacy `0`. Wishlist creates carry no platform (per CM13 the
  // platform binding only happens on owned-status creation).
  const incomingPlaytime = manualPlaytimeMinutes ?? 0;

  // F1-PR5 conflict matrix begins here. Fetch the existing UserGame
  // first so we can branch on the 6 rows. findUnique on the composite
  // unique key is the single SQL round-trip we need for this.
  const existing = await prisma.userGame.findUnique({
    where: { userId_gameId: { userId: req.userId, gameId: game.id } },
  });

  let userGame: Prisma.UserGameGetPayload<{ include: { game: { include: { hltbData: true } } } }>;

  if (!existing) {
    // Rows 1 + 2 — no existing row.
    //
    // F1-PR5 OQ-F1-5 — when row 2 fires (status=Wishlist), also create
    // a WishlistRelease atomically so the Releases page wishlist feed
    // + hero countdown + agenda surfaces pick this game up. Mirrors the
    // wishlist-toggle endpoint pattern (decision #29).
    //
    // IGDB lookup is best-effort: if getReleaseDetails returns null
    // (game not in IGDB or release date missing) or throws (IGDB
    // unreachable / rate-limited), we degrade gracefully and skip the
    // WishlistRelease — the user still gets their UserGame(Wishlist)
    // row; the Releases page just won't surface it until a future
    // path populates the release row.
    const userGameCreatePayload = {
      userId: req.userId,
      gameId: game.id,
      status: prismaStatus,
      // Wishlist creates carry empty playtime per CM13; owned creates
      // seed the picked platform with the (optional) manual playtime.
      playtimeByPlatform: newIsWishlist ? {} : { [platformLabel]: incomingPlaytime },
      ...optionalFields,
    };

    if (newIsWishlist) {
      // Try IGDB release details before opening the transaction so a slow
      // IGDB call doesn't hold a DB transaction open longer than needed.
      let igdbRelease: Awaited<ReturnType<typeof getReleaseDetails>> = null;
      try {
        igdbRelease = await getReleaseDetails(igdbId);
      } catch {
        igdbRelease = null;
      }

      if (igdbRelease) {
        userGame = await prisma.$transaction(async (tx) => {
          const ug = await tx.userGame.create({
            data: userGameCreatePayload,
            include: { game: { include: { hltbData: true } } },
          });
          await tx.wishlistRelease.create({
            data: {
              userId: req.userId,
              igdbId,
              title: igdbRelease!.title,
              developer: igdbRelease!.developer,
              releaseDate: igdbRelease!.releaseDate ? new Date(igdbRelease!.releaseDate) : null,
              releaseDateCategory: igdbRelease!.releaseDateCategory,
              platforms: igdbRelease!.platforms,
              genres: igdbRelease!.genres,
              coverUrl: igdbRelease!.coverUrl,
              synopsis: igdbRelease!.synopsis,
              hype: igdbRelease!.hype,
              category: igdbRelease!.category,
            },
          });
          return ug;
        });
      } else {
        // IGDB lookup failed/empty — UserGame still gets created; Releases
        // page just won't surface this row.
        userGame = await prisma.userGame.create({
          data: userGameCreatePayload,
          include: { game: { include: { hltbData: true } } },
        });
      }
    } else {
      // Row 1 — owned create. No WishlistRelease.
      userGame = await prisma.userGame.create({
        data: userGameCreatePayload,
        include: { game: { include: { hltbData: true } } },
      });
    }
  } else {
    // Rows 3–6 — merge into existing row per the matrix.
    const existingPlaytime = (existing.playtimeByPlatform ?? {}) as Record<string, number>;

    // Compute the merged playtime first — only changes on owned input.
    let nextPlaytime: Record<string, number> = existingPlaytime;
    let touchedPlaytime = false;
    if (!newIsWishlist && !(platformLabel in existingPlaytime)) {
      // Row 4 — add the new platform. Row 3 (P already in playtime) is
      // a no-op on the playtime field, so we skip the write entirely.
      nextPlaytime = { ...existingPlaytime, [platformLabel]: incomingPlaytime };
      touchedPlaytime = true;
    }

    // Compute the next status per CM13 + the matrix.
    let nextStatus: PrismaGameStatus | undefined;
    if (newIsWishlist) {
      // Row 6 (existing ≠ Wishlist + new=wishlist) → no-op on status.
      // Row 5b (existing=Wishlist + new=Wishlist) → also no-op.
      nextStatus = undefined;
    } else if (existing.status === 'Wishlist') {
      // Row 5 — CM13 auto-promote. The user's status pick is
      // overridden by the policy; the new status reflects whether
      // there's any playtime evidence post-merge. Use the merged
      // playtime so manualPlaytimeMinutes flows in correctly.
      const totalMergedPlaytime = Object.values(nextPlaytime).reduce<number>(
        (sum, m) => sum + (m ?? 0), 0,
      );
      nextStatus = promoteWishlistOnOwnership(existing.status, totalMergedPlaytime);
    } else {
      // Rows 3 + 4 — existing is a library row, new is owned. User's
      // explicit status pick wins (they may be bumping Backlog → Playing
      // on a re-add).
      nextStatus = prismaStatus;
    }

    userGame = await prisma.userGame.update({
      where: { id: existing.id },
      data: {
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(touchedPlaytime ? { playtimeByPlatform: nextPlaytime } : {}),
        ...optionalFields,
      },
      include: { game: { include: { hltbData: true } } },
    });
  }

  // 201 on net-new UserGame, 200 when we merged into an existing row.
  // The full UserGameDetail shape lets the frontend P5 summary build
  // F1-PR6's [+ rate / note] deep-link directly off the response.
  res.status(existing ? 200 : 201).json(mapUserGame(userGame));
});

export default router;
