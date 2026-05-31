import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import type { GameStatus as PrismaGameStatus } from '@hoard/db';
import { z } from 'zod';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import type { GameListResponse, PatchGameBody, ShelvesResponse, GameStatus } from '@hoard/types';
import { fetchHltbWithFallback } from '../services/hltb';
import { getGame, getReleaseDetails, getGameDetailExtras, getTimeToBeat } from '../services/igdb';
import { mapUserGame } from '../lib/mappers';
import { logEvent } from '../services/userEvents';
import { detectGameDetailState } from '../lib/gameDetailState';
import { routeAffiliateUrl } from '../services/deals/affiliate';
import type { GameDetailResponse, GameDetailGameInfo, GameDealsResponse, DealRow } from '@hoard/types';

function triggerHltbBackground(gameId: string, title: string, steamAppId: number | null | undefined, igdbId: number): void {
  void (async () => {
    // IGDB time_to_beat fallback — fires only after the HLTB Steam-ID path
    // misses inside fetchHltbWithFallback. Background trigger so the extra
    // /game_time_to_beats round-trip is fine.
    let timeToBeat: Awaited<ReturnType<typeof getTimeToBeat>> = null;
    try {
      timeToBeat = await getTimeToBeat(igdbId);
    } catch { /* IGDB unreachable / rate-limited — fall through with null */ }
    const result = await fetchHltbWithFallback(title, steamAppId, timeToBeat);
    if (!result) return;
    if (result.hltbId || result.gogAppId) {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          ...(result.hltbId ? { hltbId: result.hltbId } : {}),
          ...(result.gogAppId ? { gogAppId: result.gogAppId } : {}),
        },
      });
    }
    await prisma.hltbData.upsert({
      where: { gameId },
      update: { mainStory: result.mainStory, mainExtras: result.mainExtras, completionist: result.completionist, source: result.source, fetchedAt: new Date() },
      create: { gameId, mainStory: result.mainStory, mainExtras: result.mainExtras, completionist: result.completionist, source: result.source },
    });
  })();
}

const router = Router();

function toPrismaStatus(s: string): PrismaGameStatus {
  return (s === 'On Hold' ? 'OnHold' : s) as PrismaGameStatus;
}

const gamesQuerySchema = z.object({
  status: z.enum(['Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist']).optional(),
  platform: z.string().max(10).optional(),
  // B-IGDB-3 — IGDB-tag triple as composable secondary filters. All three
  // intersect with the primary status lens AND with each other. Length cap
  // matches the longest IGDB value seen in the wild (~40 chars: "Open World").
  genre: z.string().max(50).optional(),
  theme: z.string().max(50).optional(),
  perspective: z.string().max(50).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(['lastPlayed', 'title', 'playtime']).default('lastPlayed'),
  page: z.coerce.number().int().min(1).default(1),
  // Max bumped 500 → 5000 → 50000 (2026-05-31) — the 5000 cap was still
  // arbitrary; 50000 is effectively unbounded for any realistic personal
  // library while keeping a sanity guard against malicious clients. The
  // Library single-shelf view passes 50000 so the entire shelf loads and
  // the chip-strip count matches the sidebar's truthful per-status count.
  // Default stays at 50 for callers that want a small slice (search overlay,
  // etc.). If someone ever has more than 50k games in a single shelf, this
  // cap is the least of their problems.
  limit: z.coerce.number().int().min(1).max(50000).default(50),
});

// GET /api/games
router.get('/games', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  const parsed = gamesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }
  const { status, platform, genre, theme, perspective, q, sort, page: pageNum, limit: limitNum } = parsed.data;

  // B-IGDB-3 — Game filter assembly. Multiple game.* conditions (title +
  // tag arrays) need to compose under the same `game:` projection. Build
  // it conditionally so we don't generate a `game: {}` clause when no
  // game-scoped filter is active.
  const gameFilter = {
    ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(genre ? { genres: { has: genre } } : {}),
    ...(theme ? { themes: { has: theme } } : {}),
    ...(perspective ? { playerPerspectives: { has: perspective } } : {}),
  };
  const where = {
    userId,
    ...(status ? { status: toPrismaStatus(status) } : {}),
    ...(Object.keys(gameFilter).length > 0 ? { game: gameFilter } : {}),
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
router.get('/games/counts', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
  res.set('Cache-Control', 'private, max-age=10');
  res.json({ counts });
});

// B-IGDB-3b2 — GET /api/games/lens-index returns every IGDB-tag value
// (genre / theme / perspective) present in the user's library with the
// number of UserGames carrying it. Used by:
//   - Library overview's browse-by panel (top-N + "show all" inline expand)
//   - /library/by-genre/:slug etc. routes for slug → canonical-name resolution
//
// Sorted by count desc, ties broken by name asc — matches the client-side
// pickTopTags helper so a "top 5" sliced server-side or client-side yield
// the same set. Wishlist UserGames included so the panel surfaces
// "wishlist-only" tag values too; the lens routes already constrain via
// the unified /api/games filter when the user drills into a value.
router.get('/games/lens-index', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const rows = await prisma.userGame.findMany({
    where: { userId },
    select: { game: { select: { genres: true, themes: true, playerPerspectives: true } } },
  });
  const genre = new Map<string, number>();
  const theme = new Map<string, number>();
  const perspective = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.game.genres) genre.set(t, (genre.get(t) ?? 0) + 1);
    for (const t of r.game.themes) theme.set(t, (theme.get(t) ?? 0) + 1);
    for (const t of r.game.playerPerspectives) perspective.set(t, (perspective.get(t) ?? 0) + 1);
  }
  const toSorted = (m: Map<string, number>) =>
    [...m.entries()]
      .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName))
      .map(([name, count]) => ({ name, count }));
  res.set('Cache-Control', 'private, max-age=30');
  res.json({
    genre: toSorted(genre),
    theme: toSorted(theme),
    perspective: toSorted(perspective),
  });
});

const SHELF_STATUSES: PrismaGameStatus[] = ['Playing', 'Backlog', 'Completed', 'OnHold', 'Dropped', 'Wishlist'];
const shelvesQuerySchema = z.object({
  perStatus: z.coerce.number().int().min(1).max(50).default(12),
});

// GET /api/games/shelves — top N games per status + counts in one round trip.
// Replaces the previous Library Desktop pattern of fetching ?limit=2000 and
// grouping client-side. Per-status payload size is bounded by `perStatus`.
router.get('/games/shelves', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const parsed = shelvesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query params' });
    return;
  }
  const { perStatus } = parsed.data;
  const userId = req.userId;

  // F1-PR2 audit punch-list (SURFACE.md §13.7) per CM12 + CM13. The
  // Wishlist shelf rows + count widen to include UserGames where
  // wishlistedPlatforms is non-empty (per-platform wishlist binding
  // without global status=Wishlist — the GTA case). Other shelves
  // keep their narrow status= filter. Wishlist gets a dedicated query
  // with the OR condition because Prisma can't easily mix OR into
  // a groupBy.
  const [perShelfRows, wishlistRows, wishlistCount, countGroups] = await Promise.all([
    Promise.all(
      SHELF_STATUSES.filter((s) => s !== 'Wishlist').map((status) =>
        prisma.userGame.findMany({
          where: { userId, status },
          orderBy: { lastPlayedAt: 'desc' },
          take: perStatus,
          include: { game: { include: { hltbData: true } } },
        }),
      ),
    ),
    prisma.userGame.findMany({
      where: {
        userId,
        OR: [
          { status: 'Wishlist' },
          { wishlistedPlatforms: { isEmpty: false } },
        ],
      },
      orderBy: { addedAt: 'desc' },
      take: perStatus,
      include: { game: { include: { hltbData: true } } },
    }),
    prisma.userGame.count({
      where: {
        userId,
        OR: [
          { status: 'Wishlist' },
          { wishlistedPlatforms: { isEmpty: false } },
        ],
      },
    }),
    prisma.userGame.groupBy({ by: ['status'], where: { userId }, _count: { status: true } }),
  ]);

  const shelves: ShelvesResponse['shelves'] = {
    Playing: [], Backlog: [], Completed: [], 'On Hold': [], Dropped: [], Wishlist: [],
  };
  const nonWishlistStatuses = SHELF_STATUSES.filter((s) => s !== 'Wishlist');
  nonWishlistStatuses.forEach((status, i) => {
    const key: GameStatus = status === 'OnHold' ? 'On Hold' : status as GameStatus;
    shelves[key] = (perShelfRows[i] ?? []).map(mapUserGame);
  });
  shelves.Wishlist = wishlistRows.map(mapUserGame);

  const counts: Partial<Record<GameStatus, number>> = {};
  for (const g of countGroups) {
    const key: GameStatus = (g.status === 'OnHold' ? 'On Hold' : g.status) as GameStatus;
    counts[key] = g._count.status;
  }
  // Override Wishlist count with the widened total (groupBy only sees
  // status='Wishlist'; wishlistCount() picks up the wishlistedPlatforms-only
  // case too).
  counts.Wishlist = wishlistCount;

  const body: ShelvesResponse = { shelves, counts };
  res.json(body);
});

// GET /api/games/by-igdb/:igdbId
//
// GD-PR1 — GameDetail v2 unified endpoint. Returns the state-classified
// payload powering the new /game/:igdbId route. State detection rules
// live in `lib/gameDetailState.ts` (testable in isolation).
//
// Rich IGDB fields (synopsis, full releaseDate, platforms, category) are
// fetched lazily via `getReleaseDetails` (24h server-side cache). If IGDB
// is unreachable, falls back to Game-row data only — the page degrades
// gracefully rather than 503'ing.
//
// 404 when no Game row exists for the IGDB id. The "user wants to view an
// IGDB game we've never seen" case is GD-PR2 scope (lazy Game-row create).
router.get('/games/by-igdb/:igdbId', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const igdbId = Number(req.params['igdbId']);
  if (!Number.isInteger(igdbId) || igdbId < 1) {
    res.status(400).json({ error: 'Invalid igdbId' });
    return;
  }

  const game = await prisma.game.findUnique({ where: { igdbId } });
  if (!game) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // UserGame lookup happens separately so we can return the existing
  // UserGameDetail shape (with nested `game.hltbData`) untouched for
  // the S3/S4 dispatcher path.
  const userGameRow = await prisma.userGame.findFirst({
    where: { userId: req.userId, gameId: game.id },
    include: { game: { include: { hltbData: true } } },
  });
  const userGame = userGameRow ? mapUserGame(userGameRow) : null;

  // Lazy IGDB fetches — both degrade gracefully on failure. Both are
  // cached server-side for 24h so repeat visits are essentially free.
  // Running in parallel keeps the page load fast even on cold cache.
  let igdb: Awaited<ReturnType<typeof getReleaseDetails>> = null;
  let extras: Awaited<ReturnType<typeof getGameDetailExtras>> = null;
  try {
    [igdb, extras] = await Promise.all([
      getReleaseDetails(igdbId).catch(() => null),
      getGameDetailExtras(igdbId).catch(() => null),
    ]);
  } catch {
    // Both .catch() above swallow per-call failures; this outer catch
    // is a belt-and-suspenders defense against Promise.all internals.
    igdb = null;
    extras = null;
  }

  const releaseDate = igdb?.releaseDate ? new Date(igdb.releaseDate) : null;
  const status = userGame ? userGame.status : null;
  const state = detectGameDetailState(status, releaseDate, new Date());

  const gameInfo: GameDetailGameInfo = {
    id: game.id,
    igdbId: game.igdbId,
    title: game.title,
    developer: game.developer,
    releaseYear: game.releaseYear,
    releaseDate: igdb?.releaseDate ?? null,
    platforms: igdb?.platforms ?? [],
    genres: game.genres,
    themes: game.themes,
    playerPerspectives: game.playerPerspectives,
    coverUrl: game.coverUrl,
    heroImageUrl: game.heroImageUrl,
    synopsis: igdb?.synopsis ?? null,
    category: igdb?.category ?? null,
    steamAppId: game.steamAppId,
    gogAppId: game.gogAppId,
    psnConceptId: game.psnConceptId,
    xboxTitleId: game.xboxTitleId,
    epicCatalogItemId: game.epicCatalogItemId,
    nintendoTitleId: game.nintendoTitleId,
    itchGameId: game.itchGameId,
    hltbId: game.hltbId,
    releaseDates: extras?.releaseDates ?? [],
    screenshotIds: extras?.screenshotIds ?? [],
    videoIds: extras?.videoIds ?? [],
  };

  const body: GameDetailResponse = {
    state,
    igdbId,
    game: gameInfo,
    userGame,
  };
  res.json(body);
});

// GET /api/games/by-igdb/:igdbId/deals
//
// GD-PR1 — Option A single-game deals endpoint for the S1 price-offers
// card. Returns the user's market deals for one Game; affiliate URLs are
// pre-rewritten server-side per the DEALS-PR1 router. Empty `deals`
// array (not 404) when no active deals exist; 404 only when no Game row
// exists.
router.get('/games/by-igdb/:igdbId/deals', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const igdbId = Number(req.params['igdbId']);
  if (!Number.isInteger(igdbId) || igdbId < 1) {
    res.status(400).json({ error: 'Invalid igdbId' });
    return;
  }

  const game = await prisma.game.findUnique({
    where: { igdbId },
    select: { id: true, igdbId: true, title: true, coverUrl: true, heroImageUrl: true },
  });
  if (!game) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { marketCode: true },
  });
  const marketCode = user?.marketCode ?? 'US';

  // `isWishlisted` mirrors CM12 semantics — UserGame.status='Wishlist'
  // OR a non-empty wishlistedPlatforms entry. Single boolean per game,
  // same shape as /api/deals so the frontend can render the wishlist
  // chip uniformly.
  const userGame = await prisma.userGame.findFirst({
    where: { userId: req.userId, gameId: game.id },
    select: { status: true, wishlistedPlatforms: true },
  });
  const isWishlisted = userGame
    ? userGame.status === 'Wishlist' || userGame.wishlistedPlatforms.length > 0
    : false;

  const dealRows = await prisma.deal.findMany({
    where: { gameId: game.id },
    orderBy: [{ discountPct: 'desc' }, { currentPrice: 'asc' }],
  });

  const deals: DealRow[] = dealRows.map((d) => ({
    id: d.id,
    gameId: d.gameId,
    gameIgdbId: game.igdbId,
    gameTitle: game.title,
    gameCoverUrl: game.coverUrl,
    gameHeroImageUrl: game.heroImageUrl,
    shopId: d.shopId,
    shopName: d.shopName,
    isReseller: d.isReseller,
    currentPrice: d.currentPrice,
    originalPrice: d.originalPrice,
    currency: d.currency,
    discountPct: d.discountPct,
    dealUrl: routeAffiliateUrl(d.shopName, d.dealUrl),
    voucher: d.voucher,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    storeLow: d.storeLow,
    isHistoricalLow: d.isHistoricalLow,
    isTrendingDown: d.isTrendingDown,
    isWishlisted,
  }));

  const body: GameDealsResponse = { igdbId, marketCode, deals };
  res.json(body);
});

// GET /api/games/usergame/:id/igdb-id
//
// GD-PR1 — old-URL redirect resolver. The `/game/:userGameId` URL stays
// working during the transition window per OQ-GD-1; the React Router
// dispatcher calls this endpoint to map a cuid to the canonical
// `/game/:igdbId` URL, then `navigate(replace: true)` flips the address
// bar. User-scoped — only resolves UserGames owned by the requester.
router.get('/games/usergame/:id/igdb-id', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const ug = await prisma.userGame.findFirst({
    where: { id, userId: req.userId },
    select: { game: { select: { igdbId: true } } },
  });
  if (!ug) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ igdbId: ug.game.igdbId });
});

// GET /api/games/:id
router.get('/games/:id', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
router.patch('/games/:id', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
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
    triggerHltbBackground(updated.game.id, updated.game.title, updated.game.steamAppId, updated.game.igdbId);
  }

  res.json(mapUserGame(updated));
});

// POST /api/games/:id/remap — repoint an existing UserGame at a different
// IGDB game. Used to fix sync mismatches the smart matcher couldn't catch
// (e.g. "Slay the Spire 2" picked instead of "Slay the Spire" — same
// platform, just a wrong sequel) and to absorb future drift. Preserves all
// user-data fields on the UserGame: notes / rating / status / playtime /
// addedAt / lastPlayedAt. Only `gameId` is rewritten.
//
// Collision case: if the user already has a DIFFERENT UserGame for the
// target Game, plain remap returns 409 with the conflict info so the
// client can offer a merge UI. With `merge: true`, the source UserGame is
// merged INTO the existing target one (max-per-platform playtime,
// max(lastPlayedAt), min(addedAt), source's status/notes/rating wins if
// non-default) and then deleted. Whole merge is one transaction.
const remapSchema = z.object({
  igdbId: z.number().int().positive(),
  merge: z.boolean().optional(),
});

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

router.post('/games/:id/remap', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const userId = req.userId;

  const parsed = remapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const existing = await prisma.userGame.findFirst({
    where: { id, userId },
    include: { game: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // No-op: client picked the same game that's already there.
  if (existing.game.igdbId === parsed.data.igdbId) {
    const refetched = await prisma.userGame.findFirst({
      where: { id, userId },
      include: { game: { include: { hltbData: true } } },
    });
    if (!refetched) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(mapUserGame(refetched));
    return;
  }

  // Pull the new IGDB record. If IGDB doesn't know the id, refuse — better
  // a 422 than rewriting the UserGame to point at a Game row we can't
  // populate metadata for.
  const igdb = await getGame(parsed.data.igdbId).catch(() => null);
  if (!igdb) {
    res.status(422).json({ error: 'IGDB lookup failed for that id' });
    return;
  }

  // Upsert Game by igdbId. Two possibilities:
  //   1. Another UserGame already references this igdbId — we reuse that
  //      Game row.
  //   2. Nobody references it yet — we create it from the IGDB payload.
  // Both lead to the same gameId we'll point the UserGame at.
  const newGame = await prisma.game.upsert({
    where: { igdbId: igdb.igdbId },
    update: {
      // Refresh metadata in case IGDB has updated since the row was created.
      title: igdb.title,
      developer: igdb.developer,
      releaseYear: igdb.releaseYear,
      genres: igdb.genres,
      // B-IGDB-3 — IGDB-tag triple. `igdb` is an IgdbSearchResult.
      themes: igdb.themes,
      playerPerspectives: igdb.playerPerspectives,
      coverUrl: igdb.coverUrl,
      heroImageUrl: igdb.heroImageUrl,
    },
    create: {
      igdbId: igdb.igdbId,
      title: igdb.title,
      developer: igdb.developer,
      releaseYear: igdb.releaseYear,
      genres: igdb.genres,
      themes: igdb.themes,
      playerPerspectives: igdb.playerPerspectives,
      coverUrl: igdb.coverUrl,
      heroImageUrl: igdb.heroImageUrl,
    },
  });

  // Block accidental collisions: if the user already owns the target game
  // under a DIFFERENT UserGame row, we'd be creating a duplicate. The
  // unique constraint @@unique([userId, gameId]) on UserGame would throw,
  // but a 409 + merge flow is friendlier. Includes the game so we can
  // return the conflicting title to the client for a useful prompt.
  const collision = await prisma.userGame.findFirst({
    where: { userId, gameId: newGame.id, NOT: { id } },
    include: { game: true },
  });

  if (collision) {
    if (parsed.data.merge) {
      // Merge source (`existing` / id) INTO target (`collision` / collision.id).
      // The kept UserGame is the target — its `id` survives, the source row
      // is deleted. We prefer the SOURCE's user-data fields when they're
      // non-default since a remap usually reflects the user's recent
      // interaction with the wrong-titled entry; the target may have been
      // an untouched auto-sync entry from another platform.
      const sourcePt = (existing.playtimeByPlatform ?? {}) as Record<string, number>;
      const targetPt = (collision.playtimeByPlatform ?? {}) as Record<string, number>;
      const mergedPlaytime: Record<string, number> = { ...targetPt };
      for (const [k, v] of Object.entries(sourcePt)) {
        mergedPlaytime[k] = Math.max(mergedPlaytime[k] ?? 0, v);
      }

      const sourceStatus = existing.status;
      const targetStatus = collision.status;
      const sourceNotes  = existing.notes;
      const targetNotes  = collision.notes;
      const sourceRating = existing.rating;
      const targetRating = collision.rating;

      const merged = await prisma.$transaction(async (tx) => {
        const updated = await tx.userGame.update({
          where: { id: collision.id },
          data: {
            playtimeByPlatform: mergedPlaytime,
            lastPlayedAt: maxDate(existing.lastPlayedAt, collision.lastPlayedAt),
            addedAt: minDate(existing.addedAt, collision.addedAt),
            status: sourceStatus !== 'Backlog' ? sourceStatus : targetStatus,
            notes: sourceNotes ?? targetNotes,
            rating: sourceRating ?? targetRating,
          },
          include: { game: { include: { hltbData: true } } },
        });
        await tx.userGame.delete({ where: { id } });
        return updated;
      });

      // TL1.2 remap.used — merged collision path. `merged: true` records
      // the user took the merge offer; from + to IGDB ids identify the
      // rebinding for review.
      await logEvent(userId, 'remap.used', {
        fromIgdbId: existing.game.igdbId,
        toIgdbId: igdb.igdbId,
        merged: true,
      });
      res.json(mapUserGame(merged));
      return;
    }

    res.status(409).json({
      error: 'You already have this game in your library under another row.',
      conflictUserGameId: collision.id,
      conflictTitle: collision.game.title,
    });
    return;
  }

  const updated = await prisma.userGame.update({
    where: { id },
    data: { gameId: newGame.id },
    include: { game: { include: { hltbData: true } } },
  });

  // Trigger background HLTB fetch for the (possibly new) Game row if it
  // doesn't already have HLTB data. Same pattern used by the manual-add
  // and runSync flows.
  if (!updated.game.hltbData) {
    triggerHltbBackground(updated.game.id, updated.game.title, updated.game.steamAppId, updated.game.igdbId);
  }

  // TL1.2 remap.used — non-collision happy path. `merged: false`
  // distinguishes from the merge branch above.
  await logEvent(userId, 'remap.used', {
    fromIgdbId: existing.game.igdbId,
    toIgdbId: igdb.igdbId,
    merged: false,
  });

  res.json(mapUserGame(updated));
});

// DELETE /api/games/:id/wishlist-platforms/:code — F1-PR2 / CM12
//
// Removes a single platform code from UserGame.wishlistedPlatforms. The
// only mutation path exposed for the array in PR2 — the corresponding
// add-affordance lives in the manual-add modal (sub-unit #1) and a
// future GameDetail collector flow. Idempotent: removing a code that
// isn't present returns 200 with the unchanged record (covers the
// double-tap case cleanly).
router.delete(
  '/games/:id/wishlist-platforms/:code',
  requireUser,
  requireActive,
  async (req: Request, res: Response): Promise<void> => {
    const { id, code } = req.params as { id: string; code: string };
    const userId = req.userId;

    if (!code || code.length === 0 || code.length > 32) {
      res.status(400).json({ error: 'Invalid platform code' });
      return;
    }

    const existing = await prisma.userGame.findFirst({
      where: { id, userId },
      select: { id: true, wishlistedPlatforms: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const next = existing.wishlistedPlatforms.filter((c) => c !== code);
    // Skip the write entirely when nothing would change — saves a round
    // trip on rapid double-taps and keeps `updatedAt` honest.
    if (next.length === existing.wishlistedPlatforms.length) {
      const unchanged = await prisma.userGame.findFirst({
        where: { id, userId },
        include: { game: { include: { hltbData: true } } },
      });
      if (!unchanged) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(mapUserGame(unchanged));
      return;
    }

    const updated = await prisma.userGame.update({
      where: { id },
      data: { wishlistedPlatforms: next },
      include: { game: { include: { hltbData: true } } },
    });

    res.json(mapUserGame(updated));
  },
);

export default router;
