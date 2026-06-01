/**
 * DEALS-PR1 — `/api/deals` route.
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
  const ownedGameIds = new Set<string>();
  for (const ug of userGames) {
    if (ug.status === 'Wishlist' || (ug.wishlistedPlatforms?.length ?? 0) > 0) {
      wishlistGameIds.add(ug.gameId);
    }
    if (ug.status !== 'Wishlist') {
      // "owned" in the deals sense means "have a UserGame other than
      // pure Wishlist status." Even Backlog/Completed/Dropped count
      // as "owned" because the user has acquired the game.
      ownedGameIds.add(ug.gameId);
    }
  }

  // Fetch all current deals for the user's wishlist + owned-platforms
  // universe. For DEALS-PR1, "broader feed" = deals on games the user
  // doesn't yet own (across all platforms). Later refinements can
  // narrow to "on user's owned platforms" once platform-tagging on
  // ITAD shops is wired through.
  const relevantGameIds = new Set<string>([...wishlistGameIds, ...ownedGameIds]);
  const deals = await prisma.deal.findMany({
    where: { gameId: { in: [...relevantGameIds] } },
    include: {
      game: { select: { id: true, igdbId: true, title: true, coverUrl: true, heroImageUrl: true } },
    },
    orderBy: { discountPct: 'desc' },
  });

  // Apply CM12 rule:
  //   owned → skip unless wishlisted
  //   wishlisted → keep
  //   neither → keep (broader feed)
  const wishlistRows: DealRow[] = [];
  const broaderRows: DealRow[] = [];
  for (const d of deals) {
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { marketCode: true },
  });

  // DEALS-PR2 — bundles relevant to the user. Pull ITAD ids off the
  // user's library + wishlist games (cached on Game.metadata.itadId
  // during the DEALS-PR1 sync). Intersect against Bundle.itadGameIds
  // (GIN-indexed). One Prisma query each: small + cheap.
  const userGameRows = await prisma.game.findMany({
    where: { id: { in: [...relevantGameIds] } },
    select: { id: true, title: true, metadata: true },
  });
  const itadIdToTitle = new Map<string, string>();
  for (const g of userGameRows) {
    const meta = g.metadata as unknown;
    if (typeof meta === 'object' && meta !== null) {
      const m = meta as { itadId?: unknown };
      if (typeof m.itadId === 'string') itadIdToTitle.set(m.itadId, g.title);
    }
  }
  const userItadIds = [...itadIdToTitle.keys()];
  let bundleRows: typeof body.bundles = [];
  if (userItadIds.length > 0) {
    const now = new Date();
    const bundles = await prisma.bundle.findMany({
      where: {
        itadGameIds: { hasSome: userItadIds },
        // Exclude bundles past their expiry (when ITAD supplied one).
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { expiresAt: 'asc' },
    });
    bundleRows = bundles.map((b) => ({
      id: b.id,
      shopName: b.shopName,
      title: b.title,
      url: b.url,
      expiresAt: b.expiresAt?.toISOString() ?? null,
      gameCount: b.gameCount,
      matchingTitles: b.itadGameIds
        .map((id) => itadIdToTitle.get(id))
        .filter((t): t is string => Boolean(t)),
    }));
  }

  const latestSync = deals[0]?.fetchedAt ?? null;
  const body: DealsResponse = {
    topWishlistDeal,
    wishlistDeals,
    broaderFeed: broaderRows,
    marketCode: user?.marketCode ?? null,
    lastSyncedAt: latestSync?.toISOString() ?? null,
    bundles: bundleRows,
  };
  res.set('Cache-Control', 'private, max-age=60');
  res.json(body);
});

export default router;
