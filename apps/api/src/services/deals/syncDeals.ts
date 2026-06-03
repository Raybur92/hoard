/**
 * DEALS-PR1 — Deals sync orchestrator.
 *
 * Pulled in by:
 *   - Nightly cron job (`scripts/cron-deals-sync.ts`) — runs once daily
 *     for the full library across all users.
 *   - Admin manual refresh endpoint (`POST /api/admin/deals/refresh`)
 *     — same code path, triggered by an admin button.
 *
 * Pipeline per game:
 *   1. Resolve ITAD game ID — prefer steamAppId lookup, fall back to
 *      title lookup. Persist the ITAD ID on Game.metadata.itadId so
 *      future syncs skip the lookup.
 *   2. Fetch current prices per market (chunked to ITAD's 200-per-batch
 *      limit).
 *   3. Filter shops to in-scope (Tier-1 first-party + Tier-2 allow-list).
 *   4. Upsert `Deal` rows per (gameId, shopId) — one row per active
 *      deal; rows for shops with no current discount are removed
 *      (`upsert: replaceCurrent: false` is more accurate via delete-old
 *      + insert-new).
 *   5. Write `PriceSnapshot` rows for every shop returned (one per
 *      game per shop per day — bounded by daily cron run).
 *
 * Console coverage caveat (OQ-DEALS-3): ITAD's PSN/Xbox/Nintendo data
 * is sparser than PC. We silently skip games ITAD doesn't know rather
 * than erroring.
 */

import { prisma } from '@hoard/db';
import {
  isItadConfigured,
  ItadClientError,
  getPricesForGames,
  getShops,
  lookupItadIdsByTitles,
  lookupItadIdsBySteamAppIds,
  type ItadGamePrices,
} from '../itad';
import { isReseller, isShopInScope } from './storefronts';

/**
 * Cached per-process. ITAD's shop catalog is stable enough that one call
 * per orchestrator run is fine; the prisma+route worker re-imports on
 * restart, refreshing the cache.
 *
 * Without an explicit `shops` query parameter, ITAD's `/games/prices/v3`
 * returns its default popular-shops subset (typically Steam / GOG /
 * Epic / Humble Store for PC titles) — which EXCLUDES every Tier-2
 * reseller in our allow-list (GMG / Kinguin / CDKeys / Humble Bundle /
 * Instant Gaming). Resolving the full allow-list to shop IDs here +
 * passing them explicitly broadens coverage to match the storefront
 * taxonomy in storefronts.ts.
 *
 * Fail-soft: if `/shops/v1` errors, fall back to `[]` (no shops param)
 * so the orchestrator continues with ITAD's default subset. Better to
 * have partial coverage than zero.
 */
let allowedShopIdsCache: number[] | null = null;
async function getAllowedShopIds(): Promise<number[]> {
  if (allowedShopIdsCache !== null) return allowedShopIdsCache;
  try {
    const shops = await getShops();
    allowedShopIdsCache = shops
      .filter((s) => isShopInScope(s.title))
      .map((s) => s.id);
    console.log(
      `[deals-sync] /shops/v1 → ${shops.length} total, ${allowedShopIdsCache.length} in allow-list`,
    );
  } catch (err) {
    console.error(
      '[deals-sync] /shops/v1 failed — falling back to ITAD default subset:',
      err instanceof Error ? err.message : err,
    );
    allowedShopIdsCache = [];
  }
  return allowedShopIdsCache;
}

const PRICES_BATCH_SIZE = 200;
const ITAD_REQ_DELAY_MS = 350; // ~3 req/s under ITAD's free-tier budget

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface SyncDealsResult {
  scanned: number;
  resolved: number;
  dealsUpserted: number;
  snapshotsCreated: number;
  failed: number;
  skipped: number;
}

/**
 * Resolve ITAD game IDs for the given Game rows. Caches the result on
 * Game.metadata.itadId so future syncs skip the lookup.
 *
 * Strategy:
 *   1. Check Game.metadata.itadId — use it if cached.
 *   2. For games with steamAppId, batch-lookup by appid (sequential
 *      requests — ITAD's `/lookup/id/shop/61/v1` is GET-only).
 *   3. For remaining games (no steamAppId, no cached ID), bulk-lookup
 *      by title.
 */
async function resolveItadIds(
  games: { id: string; title: string; steamAppId: number | null; metadata: unknown }[],
): Promise<Map<string, string>> {
  const idsByGame = new Map<string, string>();
  const titleLookupNeeded: { gameId: string; title: string }[] = [];
  const steamGamesToLookup: { gameId: string; appId: number; metadata: unknown }[] = [];

  // Step 1: read cache. Games with a cached itadId on metadata skip
  // both Steam + title lookup.
  for (const g of games) {
    const cached = readCachedItadId(g.metadata);
    if (cached) {
      idsByGame.set(g.id, cached);
      continue;
    }
    if (g.steamAppId) {
      steamGamesToLookup.push({ gameId: g.id, appId: g.steamAppId, metadata: g.metadata });
    } else {
      titleLookupNeeded.push({ gameId: g.id, title: g.title });
    }
  }

  // Step 2: bulk Steam-appid lookup. ITAD's `/lookup/id/shop/61/v1`
  // accepts an array body; one HTTP call resolves the whole batch.
  // For very large libraries, chunk to keep request bodies sane (1000
  // appids per call is well within limits).
  const STEAM_BATCH = 500;
  for (let i = 0; i < steamGamesToLookup.length; i += STEAM_BATCH) {
    const batch = steamGamesToLookup.slice(i, i + STEAM_BATCH);
    const appIds = batch.map((b) => b.appId);
    try {
      const map = await lookupItadIdsBySteamAppIds(appIds);
      for (const entry of batch) {
        const itadId = map.get(entry.appId);
        if (itadId) {
          idsByGame.set(entry.gameId, itadId);
          await persistItadId(entry.gameId, entry.metadata, itadId);
        } else {
          // Steam appid present but ITAD doesn't have a mapping (most
          // common for delisted or never-on-ITAD games). Fall through
          // to title lookup as a backup.
          titleLookupNeeded.push({
            gameId: entry.gameId,
            title: games.find((g) => g.id === entry.gameId)?.title ?? '',
          });
        }
      }
    } catch (err) {
      // Whole-batch failure — push all to title-lookup fallback. Don't
      // block the rest of the sync on a single network blip.
      console.error('[deals-sync] Steam batch lookup failed:', err instanceof Error ? err.message : err);
      for (const entry of batch) {
        titleLookupNeeded.push({
          gameId: entry.gameId,
          title: games.find((g) => g.id === entry.gameId)?.title ?? '',
        });
      }
    }
    await sleep(ITAD_REQ_DELAY_MS);
  }

  // Step 3: bulk title lookup for remaining games. ITAD's
  // `/lookup/id/title/v1` accepts an array of titles in one POST and
  // returns a {title: uuid|null} map — same shape as the Steam batch.
  // Chunked to keep request bodies sane (500 titles per call is well
  // within limits).
  const TITLE_BATCH = 500;
  // Deduplicate titles across multiple Games with the same title (rare
  // but possible — different platforms' versions of the same game can
  // share a title); maintain a title→list-of-gameIds map so a single
  // resolved itadId fans out to every Game with that title.
  const titleToGameIds = new Map<string, string[]>();
  for (const entry of titleLookupNeeded) {
    if (!entry.title) continue;
    const existing = titleToGameIds.get(entry.title) ?? [];
    existing.push(entry.gameId);
    titleToGameIds.set(entry.title, existing);
  }
  const uniqueTitles = [...titleToGameIds.keys()];
  for (let i = 0; i < uniqueTitles.length; i += TITLE_BATCH) {
    const batch = uniqueTitles.slice(i, i + TITLE_BATCH);
    try {
      const map = await lookupItadIdsByTitles(batch);
      for (const title of batch) {
        const itadId = map.get(title);
        if (!itadId) continue;
        const gameIds = titleToGameIds.get(title) ?? [];
        for (const gameId of gameIds) {
          idsByGame.set(gameId, itadId);
          const game = games.find((g) => g.id === gameId);
          if (game) await persistItadId(gameId, game.metadata, itadId);
        }
      }
    } catch (err) {
      console.error('[deals-sync] Title batch lookup failed:', err instanceof Error ? err.message : err);
      if (!(err instanceof ItadClientError)) throw err;
    }
    await sleep(ITAD_REQ_DELAY_MS);
  }

  return idsByGame;
}

function readCachedItadId(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const m = metadata as { itadId?: unknown };
  return typeof m.itadId === 'string' ? m.itadId : null;
}

async function persistItadId(gameId: string, currentMetadata: unknown, itadId: string): Promise<void> {
  const base = typeof currentMetadata === 'object' && currentMetadata !== null ? currentMetadata : {};
  await prisma.game.update({
    where: { id: gameId },
    data: { metadata: { ...base, itadId } },
  });
}

/**
 * Apply per-game ITAD response to the DB:
 *   - Upsert in-scope Deals
 *   - Insert today's PriceSnapshot for every shop (including in-scope
 *     ones with no current discount — captures the baseline price)
 *   - Delete stale Deals (rows for shops not in the latest response)
 *
 * Returns the number of (dealsUpserted, snapshotsCreated) for tallying.
 */
/**
 * Computes the "trending down" flag for a (gameId, shopId): ≥2 distinct
 * price drops within the trailing 30 days (OQ-DEALS-13 default
 * threshold; tunable via TRENDING_DOWN_DROPS / TRENDING_DOWN_DAYS env
 * vars). Queries PriceSnapshot — must be called AFTER the latest
 * snapshot has been inserted so the current price is included.
 */
const TRENDING_DOWN_DROPS = Number(process.env['TRENDING_DOWN_DROPS'] ?? 2);
const TRENDING_DOWN_DAYS = Number(process.env['TRENDING_DOWN_DAYS'] ?? 30);

async function computeTrendingDown(gameId: string, shopId: string): Promise<boolean> {
  const since = new Date(Date.now() - TRENDING_DOWN_DAYS * 24 * 60 * 60 * 1000);
  const snapshots = await prisma.priceSnapshot.findMany({
    where: { gameId, shopId, snapshotAt: { gte: since } },
    orderBy: { snapshotAt: 'asc' },
    select: { price: true },
  });
  if (snapshots.length < TRENDING_DOWN_DROPS + 1) return false;
  let drops = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]!.price;
    const curr = snapshots[i]!.price;
    if (curr < prev) drops++;
  }
  return drops >= TRENDING_DOWN_DROPS;
}

async function applyPriceData(gameId: string, prices: ItadGamePrices): Promise<{ deals: number; snapshots: number }> {
  let dealsUpserted = 0;
  let snapshotsCreated = 0;
  const seenShopIds = new Set<string>();

  for (const deal of prices.deals) {
    const shopName = deal.shop.name;
    if (!isShopInScope(shopName)) continue;
    const shopIdStr = String(deal.shop.id);
    seenShopIds.add(shopIdStr);

    const currentPrice = deal.price.amount;
    const originalPrice = deal.regular.amount;
    const storeLow = deal.storeLow?.amount ?? null;
    const isHistoricalLow = storeLow !== null && currentPrice <= storeLow;
    const expiresAt = deal.expiry ? new Date(deal.expiry) : null;
    const discountPct = Math.round(deal.cut ?? 0);

    // Persist snapshot for EVERY shop (current price, regardless of
    // discount). Bounded growth via 90-day prune cron.
    await prisma.priceSnapshot.create({
      data: {
        gameId,
        shopId: shopIdStr,
        price: currentPrice,
        currency: deal.price.currency,
      },
    });
    snapshotsCreated++;

    // Only upsert Deal when there's an actual discount. If cut === 0
    // we'd have a "deal" that isn't a deal — keep `Deal` semantics
    // tied to active discounts.
    if (discountPct > 0) {
      const isTrendingDown = await computeTrendingDown(gameId, shopIdStr);
      await prisma.deal.upsert({
        where: { gameId_shopId: { gameId, shopId: shopIdStr } },
        update: {
          shopName,
          isReseller: isReseller(shopName),
          currentPrice,
          originalPrice,
          currency: deal.price.currency,
          discountPct,
          dealUrl: deal.url,
          voucher: deal.voucher ?? null,
          expiresAt,
          storeLow,
          isHistoricalLow,
          isTrendingDown,
          fetchedAt: new Date(),
        },
        create: {
          gameId,
          shopId: shopIdStr,
          shopName,
          isReseller: isReseller(shopName),
          currentPrice,
          originalPrice,
          currency: deal.price.currency,
          discountPct,
          dealUrl: deal.url,
          voucher: deal.voucher ?? null,
          expiresAt,
          storeLow,
          isHistoricalLow,
          isTrendingDown,
        },
      });
      dealsUpserted++;
    }
  }

  // Delete Deal rows for shops not in this response (they're no longer
  // on sale). The (gameId, shopId) unique index makes the targeted
  // delete cheap.
  const existing = await prisma.deal.findMany({
    where: { gameId },
    select: { shopId: true },
  });
  const stale = existing.filter((e) => !seenShopIds.has(e.shopId));
  if (stale.length > 0) {
    await prisma.deal.deleteMany({
      where: { gameId, shopId: { in: stale.map((s) => s.shopId) } },
    });
  }

  return { deals: dealsUpserted, snapshots: snapshotsCreated };
}

/**
 * Run the full sync for a slice of Games. Used by both the cron and
 * the admin manual refresh. `marketCode` defaults to `'US'` when the
 * user-context value is null (the cron processes all users; per-game
 * pricing-per-user would explode the call budget — see OQ-DEALS-3
 * acceptance of single-market sync for the v1 ship).
 *
 * Caller controls scope (which games to sync); the function handles
 * resolution, fetching, and persistence.
 */
export async function syncDealsForGames(
  gameIds: string[],
  marketCode: string = 'US',
): Promise<SyncDealsResult> {
  const result: SyncDealsResult = {
    scanned: gameIds.length,
    resolved: 0,
    dealsUpserted: 0,
    snapshotsCreated: 0,
    failed: 0,
    skipped: 0,
  };
  if (!isItadConfigured()) {
    console.log('[deals-sync] ITAD_API_KEY not set — skipping');
    result.skipped = gameIds.length;
    return result;
  }
  if (gameIds.length === 0) return result;

  const games = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, title: true, steamAppId: true, metadata: true },
  });

  const itadIdMap = await resolveItadIds(games);
  result.resolved = itadIdMap.size;

  // Build the inverse map (itadId → gameId) so we can attribute the
  // price response back to our games.
  const gameIdByItadId = new Map<string, string>();
  for (const [gameId, itadId] of itadIdMap) gameIdByItadId.set(itadId, gameId);

  const itadIds = [...itadIdMap.values()];
  const allowedShopIds = await getAllowedShopIds();
  for (let i = 0; i < itadIds.length; i += PRICES_BATCH_SIZE) {
    const batch = itadIds.slice(i, i + PRICES_BATCH_SIZE);
    try {
      const prices = await getPricesForGames(batch, marketCode, allowedShopIds);
      for (const p of prices) {
        const gameId = gameIdByItadId.get(p.id);
        if (!gameId) continue;
        try {
          const { deals, snapshots } = await applyPriceData(gameId, p);
          result.dealsUpserted += deals;
          result.snapshotsCreated += snapshots;
        } catch (err) {
          result.failed++;
          console.error(`[deals-sync] applyPriceData(${gameId}) failed:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      result.failed += batch.length;
      console.error(`[deals-sync] prices batch failed:`, err instanceof Error ? err.message : err);
    }
    await sleep(ITAD_REQ_DELAY_MS);
  }

  return result;
}

/**
 * Resolves the set of Games to sync for a given user — every game in
 * their library (UserGame) regardless of status. The Deal table is
 * already-owned-excluded at QUERY TIME, not at sync time — we sync
 * data for all owned + wishlisted titles, and the `/api/deals` route
 * applies the per-user owned-vs-wishlist exclusion when assembling
 * the response.
 */
export async function gameIdsForUser(userId: string): Promise<string[]> {
  const rows = await prisma.userGame.findMany({
    where: { userId },
    select: { gameId: true },
  });
  return [...new Set(rows.map((r) => r.gameId))];
}

/**
 * The full nightly sync — every game across every user. Used by the
 * cron entry point + admin manual refresh.
 *
 * For market selection: ITAD's prices endpoint requires a country code
 * and prices vary by region. For v1 we use a single-market sync per
 * OQ-DEALS-3 — preferring the admin user's marketCode (most likely
 * Andrea's `AT`), falling back to any user with marketCode set, falling
 * back to `'US'` when no user has configured one. Future enhancement
 * (DEALS-PR4 or later): per-market sync when the user-base grows
 * across regions.
 */
export async function syncAllDeals(): Promise<SyncDealsResult> {
  const rows = await prisma.userGame.findMany({
    distinct: ['gameId'],
    select: { gameId: true },
  });
  const gameIds = rows.map((r) => r.gameId);
  // Pick the market: admin's first, any user's marketCode second, US default.
  const adminUser = await prisma.user.findFirst({
    where: { isAdmin: true, marketCode: { not: null } },
    select: { marketCode: true },
  });
  let marketCode = adminUser?.marketCode ?? null;
  if (!marketCode) {
    const anyUser = await prisma.user.findFirst({
      where: { marketCode: { not: null } },
      select: { marketCode: true },
    });
    marketCode = anyUser?.marketCode ?? null;
  }
  return syncDealsForGames(gameIds, marketCode ?? 'US');
}
