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

export async function syncAllPsnDeals(): Promise<SyncPsnResult> {
  const result: SyncPsnResult = { scanned: 0, fetched: 0, upserted: 0, cleared: 0, failed: 0 };

  const market = await pickMarket();
  const locale = marketToLocale(market);
  if (!locale) {
    console.log('[psn-deals] no user with a PSN-supported market; skipping');
    return result;
  }

  // DEALS-PR2.5+ — broader scope: every Game tagged as PS4 or PS5 by IGDB
  // that is in any user's library OR wishlist. Mirror of the Nintendo
  // broadening earlier today; same rationale — surface PSN deals on
  // every PS-available game on the user's radar, regardless of which
  // platform they own it on. The `/api/deals` route's CM12 filter then
  // hides games the user already owns (on any platform), so PSN deals
  // surface for cross-platform-ownership cases (own on Steam, PS deal
  // is interesting).
  //
  // Previously this query required `psnConceptId: { not: null }`, which
  // restricted to games the user had already synced from their actual
  // PSN library. Those games are all "owned" by definition (status !=
  // Wishlist), so CM12 hid every PSN deal — the surface was effectively
  // dead from a discovery standpoint.
  //
  // Title-based scraping handles the lookup either way: getPsnPrice
  // searches PSN's store by title and picks the closest match. No
  // exact-ID fast path (Sony's concept page doesn't embed prices).
  const games = await prisma.game.findMany({
    where: {
      platforms: { hasSome: ['PlayStation 4', 'PlayStation 5'] },
      userGames: { some: {} },
    },
    select: { id: true, title: true, psnConceptId: true },
  });
  result.scanned = games.length;
  if (games.length === 0) return result;
  console.log(`[psn-deals] scanning ${games.length} games (locale=${locale})`);

  for (const g of games) {
    const titleQuery = g.title;
    try {
      // Sony's /concept/<id> pages don't embed prices (load via client-
      // side API calls); the /search/<title> page does. We use Game.title
      // as the search query + title-similarity matching in getPsnPrice
      // to pick the right product from the results.
      const price = await getPsnPrice(titleQuery, locale);
      await sleep(REQ_DELAY_MS);
      if (!price) {
        // Picker returned null (no candidate passed the Jaccard threshold).
        // Clear any stale Deal row left over from a previous looser-picker
        // run so the UI doesn't keep showing a wrong-game match for this
        // gameId. Pre-2026-06-02 this was `continue` — which let stale
        // bad-match rows haunt the DB forever.
        await prisma.deal.deleteMany({
          where: { gameId: g.id, shopId: String(PSN_SHOP_ID) },
        });
        continue;
      }
      result.fetched++;

      if (price.hasDiscount) {
        const dealKey = { gameId_shopId: { gameId: g.id, shopId: String(PSN_SHOP_ID) } };
        await prisma.deal.upsert({
          where: dealKey,
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
        // Sale ended (or never on sale) — clear any stale Deal row.
        const cleared = await prisma.deal.deleteMany({
          where: { gameId: g.id, shopId: String(PSN_SHOP_ID) },
        });
        if (cleared.count > 0) result.cleared++;
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof PsnScrapeError ? err.message : err instanceof Error ? err.message : String(err);
      console.error(`[psn-deals] ${g.title}: ${msg}`);
      await sleep(REQ_DELAY_MS);
    }
  }

  console.log(`[psn-deals] done: scanned=${result.scanned} fetched=${result.fetched} upserted=${result.upserted} cleared=${result.cleared} failed=${result.failed}`);
  return result;
}
