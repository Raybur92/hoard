/**
 * DEALS-PR2.5 — Nintendo eShop deals sync orchestrator.
 *
 * Iterates over every Game with a non-null `nintendoTitleId` that has
 * at least one UserGame attached (anyone has it on Switch); queries
 * Nintendo Europe's Solr endpoint per game; upserts a Deal row when
 * the title is on sale OR when we don't already have a Deal row for
 * that (Game, shopName='Nintendo eShop') pair.
 *
 * Polite throttle: 1 req/s per the DEALS-PR2.5 plan D5.
 *
 * Failure modes (network blip, Solr shape change) caught + logged +
 * treated as zero-result for that game. Run continues for the rest of
 * the library.
 */

import { prisma } from '@hoard/db';
import { getNintendoPrice, marketToLocale, NintendoClientError, nintendoStoreUrl } from '../nintendoPrices';

const NINTENDO_SHOP_NAME = 'Nintendo eShop';
// Synthetic shopId; Nintendo isn't on ITAD so it has no ITAD shop id.
// Distinct from any ITAD shopId (which are positive integers up to ~70).
const NINTENDO_SHOP_ID = -1;
const REQ_DELAY_MS = 1000; // 1 req/s polite default

export interface SyncNintendoResult {
  scanned: number;     // candidate games considered
  fetched: number;     // games where Nintendo returned a doc
  upserted: number;    // Deal rows upserted
  cleared: number;     // existing Deal rows removed (game no longer on sale)
  failed: number;      // per-game errors
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Pick the dominant market for the sync run. Same heuristic as
 * `syncAllDeals` — admin's marketCode preferred, fall through to any
 * user's, then null (skip Nintendo entirely if no European user).
 */
async function pickMarket(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { isAdmin: true, marketCode: { not: null } },
    select: { marketCode: true },
  });
  if (admin?.marketCode) return admin.marketCode;
  const any = await prisma.user.findFirst({
    where: { marketCode: { not: null } },
    select: { marketCode: true },
  });
  return any?.marketCode ?? null;
}

export async function syncAllNintendoDeals(): Promise<SyncNintendoResult> {
  const result: SyncNintendoResult = { scanned: 0, fetched: 0, upserted: 0, cleared: 0, failed: 0 };

  const market = await pickMarket();
  const locale = marketToLocale(market);
  if (!locale) {
    console.log('[nintendo-deals] no user with a Nintendo-supported market; skipping');
    return result;
  }

  // Scope: Games with nintendoTitleId AND at least one UserGame. We
  // include `distinct` indirectly by querying Game rows (no UserGame
  // join) — every Game.nintendoTitleId is shared across all users that
  // own that game on Switch.
  const games = await prisma.game.findMany({
    where: {
      nintendoTitleId: { not: null },
      userGames: { some: {} },
    },
    select: { id: true, title: true, nintendoTitleId: true },
  });
  result.scanned = games.length;
  if (games.length === 0) return result;
  console.log(`[nintendo-deals] scanning ${games.length} games (locale=${locale})`);

  for (const g of games) {
    const titleId = g.nintendoTitleId!;
    try {
      const price = await getNintendoPrice(titleId, locale);
      await sleep(REQ_DELAY_MS);
      if (!price) {
        // Nintendo returned nothing — game not on the index for this
        // locale. Skip without clearing existing Deal rows (they may
        // be from an earlier successful fetch and still valid).
        continue;
      }
      result.fetched++;

      if (price.hasDiscount) {
        const url = nintendoStoreUrl(locale, price.title);
        const dealKey = { gameId_shopId: { gameId: g.id, shopId: String(NINTENDO_SHOP_ID) } };
        await prisma.deal.upsert({
          where: dealKey,
          update: {
            shopName: NINTENDO_SHOP_NAME,
            isReseller: false,
            currentPrice: price.current,
            originalPrice: price.regular,
            currency: price.currency,
            discountPct: price.discountPct,
            dealUrl: url,
            storeLow: price.historicalLow,
            isHistoricalLow: price.current <= price.historicalLow + 0.01,
            fetchedAt: new Date(),
          },
          create: {
            gameId: g.id,
            shopId: String(NINTENDO_SHOP_ID),
            shopName: NINTENDO_SHOP_NAME,
            isReseller: false,
            currentPrice: price.current,
            originalPrice: price.regular,
            currency: price.currency,
            discountPct: price.discountPct,
            dealUrl: url,
            storeLow: price.historicalLow,
            isHistoricalLow: price.current <= price.historicalLow + 0.01,
            isTrendingDown: false,
          },
        });
        result.upserted++;
      } else {
        // Not on sale — clear any existing Nintendo Deal row so the UI
        // doesn't show a stale "on sale" indicator after the sale ends.
        const cleared = await prisma.deal.deleteMany({
          where: { gameId: g.id, shopId: String(NINTENDO_SHOP_ID) },
        });
        if (cleared.count > 0) result.cleared++;
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof NintendoClientError ? err.message : err instanceof Error ? err.message : String(err);
      console.error(`[nintendo-deals] ${g.title} (titleId=${titleId}): ${msg}`);
      // Don't abort the loop; one failure shouldn't block the rest.
      await sleep(REQ_DELAY_MS);
    }
  }

  console.log(`[nintendo-deals] done: scanned=${result.scanned} fetched=${result.fetched} upserted=${result.upserted} cleared=${result.cleared} failed=${result.failed}`);
  return result;
}
