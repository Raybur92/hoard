/**
 * DEALS-PR2 — bundle sync orchestrator.
 *
 * Fetches the full active-bundle list from ITAD's `/bundles/v1` endpoint
 * once per sync cycle. Upserts each into the `Bundle` table; deletes any
 * stored bundle whose `itadBundleId` no longer appears in the response
 * (bundles ended). Flattens per-tier game lists into `itadGameIds[]` so
 * the route can intersection-filter against user libraries efficiently
 * (GIN index on the column).
 *
 * No per-user logic here — bundles are global. The `/api/deals` route
 * intersects them with the requesting user's library + wishlist at
 * read time.
 */

import { prisma } from '@hoard/db';
import type { Prisma } from '@hoard/db';
import { getBundles, isItadConfigured, ItadClientError } from '../itad';
import type { ItadBundle } from '../itad';
import { routeAffiliateUrl } from './affiliate';

export interface SyncBundlesResult {
  fetched: number;
  upserted: number;
  removed: number;
  failed: number;
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function flattenItadGameIds(bundle: ItadBundle): string[] {
  const ids = new Set<string>();
  for (const tier of bundle.tiers ?? []) {
    for (const game of tier.games ?? []) {
      if (game.id && game.type === 'game') ids.add(game.id);
    }
  }
  return Array.from(ids);
}

export async function syncAllBundles(): Promise<SyncBundlesResult> {
  if (!isItadConfigured()) {
    return { fetched: 0, upserted: 0, removed: 0, failed: 0 };
  }
  let bundles: ItadBundle[];
  try {
    bundles = await getBundles();
  } catch (e) {
    if (e instanceof ItadClientError) {
      console.warn('[bundles-sync] ITAD bundles fetch failed:', e.message);
      return { fetched: 0, upserted: 0, removed: 0, failed: 0 };
    }
    throw e;
  }

  const seen = new Set<number>();
  let upserted = 0;
  let failed = 0;
  for (const b of bundles) {
    try {
      // Affiliate-route the buy URL server-side per the DEALS-PR1
      // pattern so the frontend never sees raw URLs.
      const routedUrl = routeAffiliateUrl(b.page.name, b.url);
      await prisma.bundle.upsert({
        where: { itadBundleId: b.id },
        update: {
          title: b.title,
          shopId: b.page.shopId,
          shopName: b.page.name,
          url: routedUrl,
          detailsUrl: b.details ?? null,
          publishedAt: parseDate(b.publish),
          expiresAt: parseDate(b.expiry),
          isMature: b.isMature ?? false,
          gameCount: b.counts?.games ?? 0,
          mediaCount: b.counts?.media ?? 0,
          tiers: (b.tiers ?? []) as unknown as Prisma.InputJsonValue,
          itadGameIds: flattenItadGameIds(b),
        },
        create: {
          itadBundleId: b.id,
          title: b.title,
          shopId: b.page.shopId,
          shopName: b.page.name,
          url: routedUrl,
          detailsUrl: b.details ?? null,
          publishedAt: parseDate(b.publish),
          expiresAt: parseDate(b.expiry),
          isMature: b.isMature ?? false,
          gameCount: b.counts?.games ?? 0,
          mediaCount: b.counts?.media ?? 0,
          tiers: (b.tiers ?? []) as unknown as Prisma.InputJsonValue,
          itadGameIds: flattenItadGameIds(b),
        },
      });
      seen.add(b.id);
      upserted++;
    } catch (e) {
      failed++;
      console.error(`[bundles-sync] failed upserting bundle ${b.id}:`, e instanceof Error ? e.message : e);
    }
  }

  // Remove stored bundles ITAD no longer returns (sale ended).
  const removed = await prisma.bundle.deleteMany({
    where: { itadBundleId: { notIn: Array.from(seen) } },
  });

  return {
    fetched: bundles.length,
    upserted,
    removed: removed.count,
    failed,
  };
}
