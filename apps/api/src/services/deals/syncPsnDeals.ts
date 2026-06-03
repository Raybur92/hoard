/**
 * DEALS-PR2.5 — PlayStation Store deals sync orchestrator.
 *
 * Mirrors syncNintendoDeals.ts: per-game lookup via stable platform ID
 * (Game.psnConceptId), per-locale URL pattern, upsert Deal rows for
 * discounted titles + clear stale ones when sales end.
 *
 * Polite throttle: 1 req per 2.5 seconds per the DEALS-PR2.5 plan D5
 * (HTML pages are larger than JSON APIs; want to be polite).
 */

import { prisma } from '@hoard/db';
import { getPsnPrice, marketToLocale, PsnScrapeError } from '../psnPrices';
import { getDistinctActiveMarkets } from './syncDeals';

const PSN_SHOP_NAME = 'PlayStation Store';
// Synthetic shopId; PSN isn't on ITAD so it has no ITAD shop id.
// -2 distinguishes from Nintendo's -1.
const PSN_SHOP_ID = -2;
const REQ_DELAY_MS = 2500; // ~24 games/min — safe for ~150-game PSN libraries

export interface SyncPsnResult {
  scanned: number;
  fetched: number;
  upserted: number;
  cleared: number;
  failed: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function syncPsnDealsForMarket(market: string): Promise<SyncPsnResult> {
  const result: SyncPsnResult = { scanned: 0, fetched: 0, upserted: 0, cleared: 0, failed: 0 };
  const locale = marketToLocale(market);
  if (!locale) {
    console.log(`[psn-deals] market=${market} not supported; skipping`);
    return result;
  }

  // DEALS-PR2.5+ — broader scope: every Game tagged as PS4 or PS5 by IGDB
  // that is in any user's library OR wishlist. Same Game pool regardless
  // of market; locale + currency vary.
  const games = await prisma.game.findMany({
    where: {
      platforms: { hasSome: ['PlayStation 4', 'PlayStation 5'] },
      userGames: { some: {} },
    },
    select: { id: true, title: true, psnConceptId: true },
  });
  result.scanned = games.length;
  if (games.length === 0) return result;
  console.log(`[psn-deals] market=${market} (locale=${locale}) — scanning ${games.length} games`);

  for (const g of games) {
    const titleQuery = g.title;
    try {
      const price = await getPsnPrice(titleQuery, locale);
      await sleep(REQ_DELAY_MS);
      if (!price) {
        // Picker returned null — clear THIS market's stale Deal row.
        await prisma.deal.deleteMany({
          where: { gameId: g.id, shopId: String(PSN_SHOP_ID), marketCode: market },
        });
        continue;
      }
      result.fetched++;

      if (price.hasDiscount) {
        await prisma.deal.upsert({
          where: { gameId_shopId_marketCode: { gameId: g.id, shopId: String(PSN_SHOP_ID), marketCode: market } },
          update: {
            shopName: PSN_SHOP_NAME,
            isReseller: false,
            currentPrice: price.current,
            originalPrice: price.regular,
            currency: price.currency,
            discountPct: price.discountPct,
            dealUrl: price.url,
            storeLow: null,
            isHistoricalLow: false,
            fetchedAt: new Date(),
          },
          create: {
            gameId: g.id,
            shopId: String(PSN_SHOP_ID),
            shopName: PSN_SHOP_NAME,
            marketCode: market,
            isReseller: false,
            currentPrice: price.current,
            originalPrice: price.regular,
            currency: price.currency,
            discountPct: price.discountPct,
            dealUrl: price.url,
            storeLow: null,
            isHistoricalLow: false,
            isTrendingDown: false,
          },
        });
        result.upserted++;
      } else {
        // Sale ended — clear THIS market's row only.
        const cleared = await prisma.deal.deleteMany({
          where: { gameId: g.id, shopId: String(PSN_SHOP_ID), marketCode: market },
        });
        if (cleared.count > 0) result.cleared++;
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof PsnScrapeError ? err.message : err instanceof Error ? err.message : String(err);
      console.error(`[psn-deals] ${g.title} (market=${market}): ${msg}`);
      await sleep(REQ_DELAY_MS);
    }
  }

  console.log(`[psn-deals] market=${market} done: scanned=${result.scanned} fetched=${result.fetched} upserted=${result.upserted} cleared=${result.cleared} failed=${result.failed}`);
  return result;
}

/**
 * DEALS-PR4 2026-06-03 — per-market PSN sync. Loops over every distinct
 * active user market (admin's at minimum). Same Game pool each iteration,
 * different locale + currency. Each market's Deal rows are isolated
 * via the composite unique index (gameId, shopId, marketCode).
 */
export async function syncAllPsnDeals(): Promise<SyncPsnResult> {
  const markets = await getDistinctActiveMarkets();
  console.log(`[psn-deals] markets to sync: ${markets.join(', ')}`);
  const combined: SyncPsnResult = { scanned: 0, fetched: 0, upserted: 0, cleared: 0, failed: 0 };
  for (const m of markets) {
    const r = await syncPsnDealsForMarket(m);
    combined.scanned = Math.max(combined.scanned, r.scanned);
    combined.fetched += r.fetched;
    combined.upserted += r.upserted;
    combined.cleared += r.cleared;
    combined.failed += r.failed;
  }
  return combined;
}
