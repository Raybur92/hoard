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
import { getNintendoPrice, getNintendoPriceByTitle, marketToLocale, NintendoClientError, nintendoStoreUrl } from '../nintendoPrices';
import { getDistinctActiveMarkets } from './syncDeals';

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

async function syncNintendoDealsForMarket(market: string): Promise<SyncNintendoResult> {
  const result: SyncNintendoResult = { scanned: 0, fetched: 0, upserted: 0, cleared: 0, failed: 0 };
  const locale = marketToLocale(market);
  if (!locale) {
    console.log(`[nintendo-deals] market=${market} not supported; skipping`);
    return result;
  }

  // DEALS-PR2.5+ — broader scope: every Game in any user's library OR
  // wishlist that IGDB tags as available on Switch. Same Game pool
  // regardless of market (Game.platforms is global); only the locale
  // / currency changes per market.
  const games = await prisma.game.findMany({
    where: {
      platforms: { hasSome: ['Nintendo Switch', 'Nintendo Switch 2'] },
      userGames: { some: {} },
    },
    select: { id: true, title: true, nintendoTitleId: true },
  });
  result.scanned = games.length;
  if (games.length === 0) return result;
  console.log(`[nintendo-deals] market=${market} (locale=${locale}) — scanning ${games.length} Switch games`);

  for (const g of games) {
    try {
      const price = g.nintendoTitleId
        ? await getNintendoPrice(g.nintendoTitleId, locale)
        : await getNintendoPriceByTitle(g.title, locale);
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
        await prisma.deal.upsert({
          where: { gameId_shopId_marketCode: { gameId: g.id, shopId: String(NINTENDO_SHOP_ID), marketCode: market } },
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
            marketCode: market,
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
        // Not on sale — clear THIS market's Nintendo Deal row only.
        const cleared = await prisma.deal.deleteMany({
          where: { gameId: g.id, shopId: String(NINTENDO_SHOP_ID), marketCode: market },
        });
        if (cleared.count > 0) result.cleared++;
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof NintendoClientError ? err.message : err instanceof Error ? err.message : String(err);
      const lookupBy = g.nintendoTitleId ? `titleId=${g.nintendoTitleId}` : `title="${g.title}"`;
      console.error(`[nintendo-deals] ${g.title} (${lookupBy}, market=${market}): ${msg}`);
      await sleep(REQ_DELAY_MS);
    }
  }

  console.log(`[nintendo-deals] market=${market} done: scanned=${result.scanned} fetched=${result.fetched} upserted=${result.upserted} cleared=${result.cleared} failed=${result.failed}`);
  return result;
}

/**
 * DEALS-PR4 2026-06-03 — per-market Nintendo sync. Loops over every
 * distinct active user market (admin's at minimum). Same Game pool
 * is queried each iteration, just with a different Nintendo locale +
 * currency. Each market's Deal rows are isolated via the new composite
 * unique index (gameId, shopId, marketCode).
 */
export async function syncAllNintendoDeals(): Promise<SyncNintendoResult> {
  const markets = await getDistinctActiveMarkets();
  console.log(`[nintendo-deals] markets to sync: ${markets.join(', ')}`);
  const combined: SyncNintendoResult = { scanned: 0, fetched: 0, upserted: 0, cleared: 0, failed: 0 };
  for (const m of markets) {
    const r = await syncNintendoDealsForMarket(m);
    combined.scanned = Math.max(combined.scanned, r.scanned); // same pool each market
    combined.fetched += r.fetched;
    combined.upserted += r.upserted;
    combined.cleared += r.cleared;
    combined.failed += r.failed;
  }
  return combined;
}
