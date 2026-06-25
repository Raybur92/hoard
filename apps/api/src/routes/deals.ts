/**
 * DEALS-PR1 — `/api/deals` route. 2026-06-25 redeploy.
 *
 * Returns the per-user payload for the Library OVERVIEW deals page:
 *   - topWishlistDeal: highest-discount wishlist deal (hero card)
 *   - wishlistDeals: full wishlist-deals list, sorted by discount desc
 *   - broaderFeed: non-wishlist deals on the user's owned platforms,
 *     excluding games the user already owns (CM12 per-platform wishlist
 *     rule: own on PSN, wishlist on Switch → Switch deal IS shown)
 *
 * Already-owned exclusion is applied at QUERY assembly time, not at
 * sync time — the same Deal rows feed every user, with per-user
 * filtering on read. CM12 per-platform wishlist (UserGame.
 * wishlistedPlatforms) is the key signal.
 *
 * Deal URLs are affiliate-routed BEFORE the response is sent (so the
 * frontend doesn't see the raw URL). Resellers without an affiliate
 * env var get unrewritten URLs — identical UX.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import { routeAffiliateUrl } from '../services/deals/affiliate';
import { isShopRelevantForMarket } from '../services/deals/storefronts';
import type { DealsResponse, DealRow } from '@hoard/types';

const router = Router();

interface DealJoined {
  id: string;
  gameId: string;
  shopId: string;
  shopName: string;
  isReseller: boolean;
  currentPrice: number;
  originalPrice: number | null;
  currency: string;
  discountPct: number;
  dealUrl: string;
  voucher: string | null;
  expiresAt: Date | null;
  storeLow: number | null;
  isHistoricalLow: boolean;
  isTrendingDown: boolean;
  fetchedAt: Date;
  game: {
    id: string;
    igdbId: number;
    title: string;
    coverUrl: string | null;
    heroImageUrl: string | null;
  };
}

function dealToRow(d: DealJoined, isWishlisted: boolean): DealRow {
  return {
    id: d.id,
    gameId: d.gameId,
    gameIgdbId: d.game.igdbId,
    gameTitle: d.game.title,
    gameCoverUrl: d.game.coverUrl,
    gameHeroImageUrl: d.game.heroImageUrl,
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
  };
}

router.get('/deals', requireUser, requireActive, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  // Pull every UserGame for the user with the shape we need to apply
  // CM12 + already-owned exclusion. status='Wishlist' OR non-empty
  // wishlistedPlatforms → counts as wishlisted; otherwise → owned.
  const userGames = await prisma.userGame.findMany({
    where: { userId },
    select: {
      gameId: true,
      status: true,
      wishlistedPlatforms: true,
    },
  });
  const wishlistGameIds = new Set<string>();
  const pureWishlistGameIds = new Set<string>(); // status === 'Wishlist' only — used for bundle matching
  const ownedGameIds = new Set<string>();
  for (const ug of userGames) {
    if (ug.status === 'Wishlist' || (ug.wishlistedPlatforms?.length ?? 0) > 0) {
      wishlistGameIds.add(ug.gameId);
    }
    if (ug.status === 'Wishlist') {
      pureWishlistGameIds.add(ug.gameId);
    }
    if (ug.status !== 'Wishlist') {
      // "owned" in the deals sense means "have a UserGame other than
      // pure Wishlist status." Even Backlog/Completed/Dropped count
      // as "owned" because the user has acquired the game.
      ownedGameIds.add(ug.gameId);
    }
  }

  // Fetch every current deal in the DB FOR THIS USER'S MARKET. CM12
  // below filters per-user.
  //
  // DEALS-PR4 2026-06-03 — added per-market filtering. Each Deal row
  // is keyed by (gameId, shopId, marketCode); we surface only rows
  // priced in the viewer's market. Falls back to admin's market when
  // the viewer hasn't set theirs (preserves the previous v1 behavior
  // for users who haven't configured Settings → Account → Market).
  //
  // DEALS-PR2.5 — previously this query was scoped to `gameId IN
  // (user's library + wishlist)` which prevented deals on games the
  // user had no UserGame for from EVER surfacing. Dropped that scope;
  // the route now returns:
  //   - deals on games the user has wishlisted → wishlistDeals
  //   - deals on games no user has on radar yet → broaderFeed
  //   - deals on games the user owns (status != Wishlist) → suppressed
  //     via CM12 below.
  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: { marketCode: true },
  });
  let effectiveMarket = viewer?.marketCode ?? null;
  if (!effectiveMarket) {
    const admin = await prisma.user.findFirst({
      where: { isAdmin: true, marketCode: { not: null } },
      select: { marketCode: true },
    });
    effectiveMarket = admin?.marketCode ?? 'US';
  }
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: {
      marketCode: effectiveMarket,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      game: { select: { id: true, igdbId: true, title: true, coverUrl: true, heroImageUrl: true } },
    },
    orderBy: { discountPct: 'desc' },
  });

  // Apply CM12 rule:
  //   owned → skip (you have it; deal noise)
  //   wishlisted → keep (you want it)
  //   neither → keep (broader discovery; you might want it)
  // Wishlist ≠ ownership.
  //
  // Also filter region-locked storefronts: any Deal rows that were
  // persisted before the market-restricted-shop filter was added
  // (e.g. GamesPlanet UK for an AT user) are silently excluded here.
  // The sync-time filter handles new rows; this guards against stale DB
  // rows until the next sync cleans them up.
  const wishlistRows: DealRow[] = [];
  const broaderRows: DealRow[] = [];
  for (const d of deals) {
    if (!isShopRelevantForMarket(d.shopName, effectiveMarket)) continue;
    const isWishlisted = wishlistGameIds.has(d.gameId);
    const isOwned = ownedGameIds.has(d.gameId);
    if (isOwned && !isWishlisted) continue;
    const row = dealToRow(d, isWishlisted);
    if (isWishlisted) wishlistRows.push(row);
    else broaderRows.push(row);
  }
  // Hero = highest discount on the wishlist; deduplicate (one card per
  // gameId across all shops by picking the BEST deal across shops).
  const wishlistByGame = new Map<string, DealRow>();
  for (const r of wishlistRows) {
    const existing = wishlistByGame.get(r.gameId);
    if (!existing || r.discountPct > existing.discountPct) wishlistByGame.set(r.gameId, r);
  }
  const wishlistDeduped = [...wishlistByGame.values()].sort((a, b) => b.discountPct - a.discountPct);
  const topWishlistDeal = wishlistDeduped[0] ?? null;
  // Don't show top as a duplicate in the list below
  const wishlistDeals = topWishlistDeal
    ? wishlistDeduped.filter((d) => d.id !== topWishlistDeal.id)
    : wishlistDeduped;

  // Reuse the viewer lookup from the per-market filter above instead of
  // re-querying. The response's `marketCode` field reflects the user's
  // saved preference (null when not set) — distinct from `effectiveMarket`
  // which is the resolved market used for filtering.

  // Bundles — show ALL active bundles, but highlight wishlist matches.
  // The relevance signal for a bundle is "it contains a game you WANT"
  // (wishlist), not "a game you already own" — owning a game in a bundle
  // tells you nothing useful. Build the ITAD id map from wishlist-only
  // games; bundles with wishlist matches sort first.
  // Bundle matching uses ONLY pure-Wishlist games (status === 'Wishlist').
  // Games owned on one platform but cross-platform-wishlisted (wishlistedPlatforms)
  // are excluded — the user already has the game and the bundle can't help them
  // get something they don't have. Using the broader wishlistGameIds set here
  // was causing false-positive amber highlights on bundles.
  const wishlistGameRows = pureWishlistGameIds.size > 0
    ? await prisma.game.findMany({
        where: { id: { in: [...pureWishlistGameIds] } },
        select: { id: true, title: true, metadata: true },
      })
    : [];
  const wishlistItadIdToTitle = new Map<string, string>();
  for (const g of wishlistGameRows) {
    const meta = g.metadata as unknown;
    if (typeof meta === 'object' && meta !== null) {
      const m = meta as { itadId?: unknown };
      if (typeof m.itadId === 'string') wishlistItadIdToTitle.set(m.itadId, g.title);
    }
  }
  const allActiveBundles = await prisma.bundle.findMany({
    where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { expiresAt: 'asc' },
  });
  const bundleRows = allActiveBundles
    .map((b) => ({
      id: b.id,
      shopName: b.shopName,
      title: b.title,
      url: b.url,
      expiresAt: b.expiresAt?.toISOString() ?? null,
      gameCount: b.gameCount,
      matchingTitles: b.itadGameIds
        .map((id) => wishlistItadIdToTitle.get(id))
        .filter((t): t is string => Boolean(t)),
    }))
    // Wishlist-matching bundles first (desc by match count), then soonest-expiry.
    .sort((a, b) => {
      if (b.matchingTitles.length !== a.matchingTitles.length)
        return b.matchingTitles.length - a.matchingTitles.length;
      if (!a.expiresAt && !b.expiresAt) return 0;
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    });

  const latestSync = deals[0]?.fetchedAt ?? null;
  const body: DealsResponse = {
    topWishlistDeal,
    wishlistDeals,
    broaderFeed: broaderRows,
    marketCode: viewer?.marketCode ?? null,
    lastSyncedAt: latestSync?.toISOString() ?? null,
    bundles: bundleRows,
  };
  res.set('Cache-Control', 'private, max-age=60');
  res.json(body);
});

export default router;
