// I3 of the invite-codes workstream (docs/INVITE_CODES_PLAN.md).
// Admin surface for managing invite codes and seeing who has signed up.
// Every route on this router stacks: requireUser → requireActive →
// requireAdmin. Non-admin requests get 404 with the canonical
// `{ error: 'Not found' }` body so the surface stays invisible.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@hoard/db';
import { requireUser } from '../middleware/user';
import { requireActive } from '../middleware/active';
import { requireAdmin } from '../middleware/admin';
import { generateCode } from '../lib/inviteCodes';
import { displayIdentity } from '../lib/displayIdentity';
import { mapFeedbackWithUser, mapUserEventWithUser } from '../lib/mappers';
import type {
  AdminUser,
  AdminInviteCode,
  FeedbackListResponse,
  PlatformCode,
  UserEventListResponse,
} from '@hoard/types';

const router = Router();

// Scope the admin gating to /admin/* paths only. Without the path prefix,
// router-level middleware runs on every request that enters this router
// — including ones that don't match any of its routes — which means the
// requireAdmin 404 would intercept unrelated non-admin requests that
// happen to fall through to this router before hitting a sibling
// router mounted at the same `/api` prefix. F1.2 of the feedback
// workstream surfaced this when POST /api/feedback (a non-admin route)
// was 404'd here before reaching feedbackRouter.
router.use('/admin', requireUser, requireActive, requireAdmin);

// GET /api/admin/users
//
// Sort order: pending access-requests first (by accessRequestedAt desc
// — "freshest knock at the door first"), then everyone else by
// createdAt desc. The two-segment sort lets the UI render the
// "PENDING ACCESS REQUESTS" panel directly off the top of the list
// without a second query.
router.get('/admin/users', async (_req: Request, res: Response): Promise<void> => {
  const rows = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      steamId: true,
      createdAt: true,
      status: true,
      isAdmin: true,
      hasRequestedAccess: true,
      accessRequestMessage: true,
      accessRequestedAt: true,
      redeemedInviteCode: { select: { code: true, usedAt: true } },
      platforms: { select: { code: true } },
      // Two extra _count aggregates per row (per A-D11). At v1 scale
      // (8-20 closed-beta users) this is a cheap addition — Prisma
      // emits a sub-SELECT that's index-friendly via the existing
      // (userId, …) indexes on UserGame and WishlistRelease. Worth
      // revisiting at v2 scale (~200+ users) where a denormalized
      // counter on User or an aggregated query becomes more attractive.
      _count: { select: { userGames: true, wishlists: true } },
    },
  });

  const mapped: AdminUser[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    displayIdentity: displayIdentity({ email: u.email, name: u.name, steamId: u.steamId }),
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    status: u.status,
    isAdmin: u.isAdmin,
    hasRequestedAccess: u.hasRequestedAccess,
    accessRequestMessage: u.accessRequestMessage,
    accessRequestedAt: u.accessRequestedAt?.toISOString() ?? null,
    redeemedCode: u.redeemedInviteCode
      ? {
          code: u.redeemedInviteCode.code,
          usedAt: u.redeemedInviteCode.usedAt?.toISOString() ?? '',
        }
      : null,
    platforms: {
      count: u.platforms.length,
      codes: u.platforms.map((p) => p.code as PlatformCode),
    },
    gamesCount: u._count.userGames,
    wishlistCount: u._count.wishlists,
  }));

  // Two-segment sort — pending requests first, then by join date.
  mapped.sort((a, b) => {
    const aPending = a.hasRequestedAccess && a.status === 'PENDING_INVITE';
    const bPending = b.hasRequestedAccess && b.status === 'PENDING_INVITE';
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    if (aPending && bPending) {
      const aT = a.accessRequestedAt ? Date.parse(a.accessRequestedAt) : 0;
      const bT = b.accessRequestedAt ? Date.parse(b.accessRequestedAt) : 0;
      return bT - aT;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  res.json({ users: mapped });
});

// GET /api/admin/invite-codes
//
// Sort order: unused first (the admin's working set), then used codes
// most-recently-redeemed first. Used codes are kept in the response
// for audit (who redeemed what when), not just hidden after redemption.
router.get('/admin/invite-codes', async (_req: Request, res: Response): Promise<void> => {
  const rows = await prisma.inviteCode.findMany({
    include: {
      usedBy: { select: { id: true, email: true, name: true, steamId: true } },
    },
  });

  const mapped: AdminInviteCode[] = rows.map((c) => ({
    id: c.id,
    code: c.code,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
    usedAt: c.usedAt?.toISOString() ?? null,
    usedBy: c.usedBy
      ? {
          id: c.usedBy.id,
          email: c.usedBy.email,
          displayIdentity: displayIdentity({ email: c.usedBy.email, name: c.usedBy.name, steamId: c.usedBy.steamId }),
        }
      : null,
  }));

  mapped.sort((a, b) => {
    if (!a.usedAt && b.usedAt) return -1;
    if (a.usedAt && !b.usedAt) return 1;
    if (a.usedAt && b.usedAt) return Date.parse(b.usedAt) - Date.parse(a.usedAt);
    // Both unused — most-recently-created first.
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  res.json({ codes: mapped });
});

// POST /api/admin/invite-codes
//
// Generates a new code. Optional 100-char note (admin-only,
// stored alongside the code so the admin can remember who it's for).
// Retries up to 5 times on the unique-constraint collision (P2002) —
// 32^8 ≈ 1.1T keyspace makes 5 collisions a near-impossibility, so
// hitting the cap means a real bug worth surfacing.
const createCodeSchema = z.object({
  note: z.string().max(100).optional(),
});

router.post('/admin/invite-codes', async (req: Request, res: Response): Promise<void> => {
  const parsed = createCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { note } = parsed.data;

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      const created = await prisma.inviteCode.create({
        data: { code, ...(note !== undefined ? { note } : {}) },
      });
      const body: AdminInviteCode = {
        id: created.id,
        code: created.code,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
        usedAt: null,
        usedBy: null,
      };
      res.status(201).json({ code: body });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Collision on the unique `code` index — try again with a
        // fresh random code.
        continue;
      }
      throw err;
    }
  }

  // Fell through MAX_ATTEMPTS without minting a unique code. This is
  // statistically improbable (probability ~10^-46 per attempt for 50
  // existing codes); if it ever happens, a real bug is at play.
  console.error('[admin] invite-code generator hit max collision retries — investigate');
  res.status(500).json({ error: 'Failed to generate a unique invite code' });
});

// DELETE /api/admin/invite-codes/:id
//
// Allowed only when the code is unused. Used codes can't be revoked
// because the user is already ACTIVE — there's nothing to roll back
// here (status flip lives on the User row, not the code).
router.delete('/admin/invite-codes/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const existing = await prisma.inviteCode.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (existing.usedById) {
    res.status(409).json({ error: 'CODE_ALREADY_USED' });
    return;
  }

  await prisma.inviteCode.delete({ where: { id } });
  res.status(204).send();
});

// DELETE /api/admin/users/:id
//
// Hard-delete with FK cascade (per A-D1 in docs/ADMIN_POLISH_PLAN.md).
// The single prisma.user.delete() call cascades through Platform /
// UserGame / WishlistRelease / PlatformLog (via Platform's cascade
// chain); InviteCode.usedById flips to NULL via the FK's ON DELETE
// SET NULL behaviour (commit 1 of A1 made this explicit in the schema).
//
// Self-protection (per A-D2): admin cannot delete their own row. The
// frontend already hides the [delete] button on the admin's own row;
// this is the server-side belt-and-suspenders that closes the
// URL-typing path. 400 (not 403/404) because it's a client-side
// programming error, not a security gate — non-admins never reach
// this route at all (requireAdmin returns 404 first).
//
// Active sessions of the deleted user invalidate naturally (per A-D12):
// requireActive does prisma.user.findUnique() on every gated request
// and returns 401 when the User row is gone. No JWT-blacklist or
// session-table cleanup needed — the natural-401 property held in
// the pre-coding audit (every req.user consumer is downstream of a
// DB lookup; the 4 requireUser-only routes do their own internal
// lookups).
router.delete('/admin/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  // Self-protection. req.user.id is populated by requireActive earlier
  // in the chain; the path id is the deletion target.
  if (req.user && req.user.id === id) {
    res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
    return;
  }

  // Existence check: 404 with the canonical project body for
  // consistency with the other admin routes (and with how the I-D15
  // 404-not-403 invisibility story extends to "not found" cases too).
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  await prisma.user.delete({ where: { id } });
  res.status(204).send();
});

/* ── Feedback (F1.2 of docs/FEEDBACK_PLAN.md) ── */

// GET /api/admin/feedback
//
// Cursor-paginated chronological feed of user feedback. No server-side
// `unreadOnly` filter in v1 per Andrea 2026-05-13 — client-side filter
// is sufficient at cohort size, and paginating + filtering on a mutable
// field (read) opens a skip-rows edge case not worth defending against
// for a feature with no demand. Index [read, createdAt(sort:Desc)]
// stays — already paid for; v2 reintroduction is route-handler-only.
// See docs/FEEDBACK_PLAN.md §4 deferred.
const FEEDBACK_PAGE_SIZE = 50;

router.get('/admin/feedback', async (req: Request, res: Response): Promise<void> => {
  const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;

  const rows = await prisma.feedback.findMany({
    take: FEEDBACK_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    // Secondary sort by id stabilises the cursor when multiple rows
    // share the same createdAt (same-millisecond writes). Matches the
    // platformLog precedent — don't drop it thinking it's redundant;
    // the cursor would skip rows on boundaries.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      user: { select: { id: true, email: true, name: true, steamId: true } },
    },
  });

  const hasMore = rows.length > FEEDBACK_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, FEEDBACK_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? last.id : null;

  // unreadCount is total-across-all-pages, not page-scoped.
  // Cheap at cohort size; lets the admin chip stay accurate
  // while paginating. Don't fold it into the page query under
  // perf pressure — the chip would silently drift.
  const unreadCount = await prisma.feedback.count({ where: { read: false } });

  const body: FeedbackListResponse = {
    items: pageRows.map((f) => mapFeedbackWithUser(f)),
    nextCursor,
    unreadCount,
  };
  res.json(body);
});

// PATCH /api/admin/feedback/:id
//
// Toggles the `read` flag. Returns 200 + the updated FeedbackWithUser
// so the admin UI can swap the row in place without re-fetching. 404
// with the canonical body if the row is gone.
const patchFeedbackSchema = z.object({
  read: z.boolean(),
});

router.patch('/admin/feedback/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = patchFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { id } = req.params as { id: string };

  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const updated = await prisma.feedback.update({
    where: { id },
    data: { read: parsed.data.read },
    include: {
      user: { select: { id: true, email: true, name: true, steamId: true } },
    },
  });

  res.json(mapFeedbackWithUser(updated));
});

// DELETE /api/admin/feedback/:id
//
// Hard-delete a feedback row. Returns 204 on success, 404 with the
// canonical body if the row is gone. Mirrors `DELETE /api/admin/users/:id`
// shape — admin-only via the router-level requireAdmin middleware,
// no cascade concerns (Feedback rows don't FK out to anything).
//
// Bundled into the admin-IA redesign workstream (2026-05-29) — feedback
// triage gains a [delete] affordance alongside the existing
// [mark read]/[mark unread] toggle.
router.delete('/admin/feedback/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  const existing = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  await prisma.feedback.delete({ where: { id } });
  res.status(204).end();
});

/* ── Deals (DEALS-PR1 / docs/PAGES_PLAN.md §8) ────────────────── */

// POST /api/admin/deals/refresh
//
// Manual nightly-sync-equivalent trigger. Fires the same orchestrator
// the cron uses, but runs ad-hoc when an admin wants to refresh.
// Returns the summary counters from the sync run, or a structured
// error body when sync fails (instead of letting the error bubble up
// to a 500-with-no-body that's impossible to debug client-side).
//
// Long-running — can take minutes for large libraries; admin should
// expect a slow response.
router.post('/admin/deals/refresh', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Lazy import keeps the cold-start of admin routes light when the
    // deals service hasn't been touched yet.
    const { syncAllDeals } = await import('../services/deals/syncDeals');
    const { syncAllBundles } = await import('../services/deals/syncBundles');
    const { syncAllNintendoDeals } = await import('../services/deals/syncNintendoDeals');
    const { syncAllPsnDeals } = await import('../services/deals/syncPsnDeals');
    const result = await syncAllDeals();
    // DEALS-PR2 — also refresh bundles alongside deals. Single global
    // pull from ITAD; bundles are not user-scoped.
    const bundleResult = await syncAllBundles();
    // DEALS-PR2.5 — Nintendo eShop + PSN console-storefront coverage.
    // Each runs sequentially after the ITAD sync (which populates the
    // Game.{nintendoTitleId, psnConceptId} columns these orchestrators
    // depend on). Per-source failure is caught + logged internally; the
    // overall refresh returns successfully even if one source fails.
    const nintendoResult = await syncAllNintendoDeals();
    const psnResult = await syncAllPsnDeals();
    res.json({
      ok: true,
      ...result,
      bundles: bundleResult,
      nintendo: nintendoResult,
      psn: psnResult,
    });
  } catch (err) {
    console.error('[admin/deals/refresh] sync failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    res.status(500).json({ ok: false, error: message, stack });
  }
});

// GET /api/admin/deals/status
//
// Cheap row counters for Deal + PriceSnapshot so we can see if an
// in-flight refresh is actually making progress vs. stuck.
router.get('/admin/deals/status', async (_req: Request, res: Response): Promise<void> => {
  const [dealsTotal, snapshotsTotal, lastDeal, lastSnapshot] = await Promise.all([
    prisma.deal.count(),
    prisma.priceSnapshot.count(),
    prisma.deal.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } }),
    prisma.priceSnapshot.findFirst({ orderBy: { snapshotAt: 'desc' }, select: { snapshotAt: true } }),
  ]);
  res.json({
    dealsTotal,
    snapshotsTotal,
    lastDealFetchedAt: lastDeal?.fetchedAt ?? null,
    lastSnapshotAt: lastSnapshot?.snapshotAt ?? null,
  });
});

// GET /api/admin/deals/shops
//
// Per-shop row count over the entire Deal table. Diagnostic — answers
// "are GMG / Kinguin / CDKeys / PlayStation Store deals actually
// landing in the DB after the orchestrators run, or are they being
// excluded upstream by the storefront classifier / not finding any
// active discounts?"
router.get('/admin/deals/shops', async (_req: Request, res: Response): Promise<void> => {
  const rows = await prisma.deal.groupBy({
    by: ['shopName'],
    _count: { _all: true },
    orderBy: { _count: { shopName: 'desc' } },
  });
  res.json({
    total: rows.reduce((sum, r) => sum + r._count._all, 0),
    shops: rows.map((r) => ({ shopName: r.shopName, count: r._count._all })),
  });
});

// GET /api/admin/itad/shops
//
// Diagnostic — fetches ITAD's full shop catalog (/service/shops/v1)
// and annotates each entry with our storefront classification. Used
// to verify whether Tier-2 resellers in our allow-list are absent
// from ITAD's catalog (coverage gap) or present under different
// names than we expect (allow-list-name mismatch).
router.get('/admin/itad/shops', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { getShops } = await import('../services/itad');
    const { classifyShop } = await import('../services/deals/storefronts');
    const shops = await getShops();
    const annotated = shops.map((s) => ({
      id: s.id,
      title: s.title,
      classification: classifyShop(s.title),
    }));
    res.json({
      total: shops.length,
      counts: {
        firstParty: annotated.filter((s) => s.classification === 'first-party').length,
        reseller: annotated.filter((s) => s.classification === 'reseller').length,
        excluded: annotated.filter((s) => s.classification === 'excluded').length,
      },
      firstParty: annotated.filter((s) => s.classification === 'first-party'),
      reseller: annotated.filter((s) => s.classification === 'reseller'),
      excluded: annotated.filter((s) => s.classification === 'excluded'),
    });
  } catch (err) {
    console.error('[admin/itad/shops] failed:', err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/admin/deals/probe-psn?title=Astro%20Bot&market=AT
//
// Diagnostic — fetches PSN's anonymous search page for a title, parses
// __NEXT_DATA__, and dumps the structure of the first few Product /
// Concept nodes so we can see where Sony actually stores the SKU id
// (the test fixture has `id` at the Product node level, but production
// data appears to differ — every deal URL falls back to /search/).
router.get('/admin/deals/probe-psn', async (req: Request, res: Response): Promise<void> => {
  try {
    const title = typeof req.query['title'] === 'string' ? req.query['title'] : 'Astro Bot';
    const market = typeof req.query['market'] === 'string' ? req.query['market'] : 'AT';
    const { marketToLocale } = await import('../services/psnPrices');
    const locale = marketToLocale(market) ?? 'en-us';

    const url = `https://store.playstation.com/${locale}/search/${encodeURIComponent(title)}`;
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!fetchRes.ok) {
      res.status(502).json({ ok: false, error: `PSN ${url} → ${fetchRes.status}` });
      return;
    }
    const html = await fetchRes.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      res.status(502).json({ ok: false, error: 'no __NEXT_DATA__ in response' });
      return;
    }
    const data = JSON.parse(match[1]!);

    // Walk recursively, collect Product/Concept nodes with their full key shape.
    interface ProductSample { path: string; __typename: string; allKeys: string[]; name?: unknown; id?: unknown; idFieldCandidates: Record<string, unknown> }
    const products: ProductSample[] = [];
    function walk(o: unknown, path: string, depth: number): void {
      if (depth > 14 || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        for (let i = 0; i < o.length; i++) walk(o[i], `${path}[${i}]`, depth + 1);
        return;
      }
      const obj = o as Record<string, unknown>;
      const tn = obj['__typename'];
      if (typeof tn === 'string' && (tn === 'Product' || tn === 'Concept')) {
        const allKeys = Object.keys(obj);
        // Collect every key whose value looks like an id (string with hyphens, ALL CAPS / digits).
        const idFieldCandidates: Record<string, unknown> = {};
        for (const k of allKeys) {
          const v = obj[k];
          if (typeof v === 'string' && /^[A-Z]{2}\d{4}-/.test(v)) idFieldCandidates[k] = v;
          else if (typeof k === 'string' && /id|sku|cid|concept|np/i.test(k) && (typeof v === 'string' || typeof v === 'number')) {
            idFieldCandidates[k] = v;
          }
        }
        // Also peek inside `price` for skuId-like fields.
        const price = obj['price'];
        if (price && typeof price === 'object' && !Array.isArray(price)) {
          const p = price as Record<string, unknown>;
          for (const k of Object.keys(p)) {
            if (/id|sku/i.test(k)) idFieldCandidates[`price.${k}`] = p[k];
          }
        }
        products.push({ path, __typename: tn, allKeys, name: obj['name'], id: obj['id'], idFieldCandidates });
      }
      for (const k of Object.keys(obj)) walk(obj[k], `${path}.${k}`, depth + 1);
    }
    walk(data, '$', 0);

    // Find the FIRST Product node and dump its full content (not just key list)
    // so we can see what `price` actually looks like — __typename, basePrice
    // shape, whether it's an inline object or an Apollo __ref, etc.
    let fullFirstProduct: unknown = null;
    function findFirst(o: unknown, depth: number): boolean {
      if (depth > 14 || !o || typeof o !== 'object') return false;
      if (Array.isArray(o)) {
        for (const v of o) if (findFirst(v, depth + 1)) return true;
        return false;
      }
      const obj = o as Record<string, unknown>;
      if (obj['__typename'] === 'Product') {
        fullFirstProduct = obj;
        return true;
      }
      for (const k of Object.keys(obj)) if (findFirst(obj[k], depth + 1)) return true;
      return false;
    }
    findFirst(data, 0);

    res.json({
      ok: true,
      url,
      market,
      locale,
      totalProductsFound: products.length,
      first3: products.slice(0, 3),
      // All products, lightweight shape — used for picker diagnosis.
      allProductsLite: products.map((p) => ({ name: p.name, id: p.id, __typename: p.__typename })),
      fullFirstProduct,
    });
  } catch (err) {
    console.error('[admin/deals/probe-psn] failed:', err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/admin/deals/probe?title=Cyberpunk%202077&market=AT
//
// Diagnostic probe — resolves one game to its ITAD id and dumps the raw
// /games/prices/v3 response so we can see what shops + prices came back
// before classification filters touch them. Used to diagnose 0-deals
// outcomes (is ITAD silent? is the allow-list too narrow? wrong market?).
router.get('/admin/deals/probe', async (req: Request, res: Response): Promise<void> => {
  try {
    const title = typeof req.query['title'] === 'string' ? req.query['title'] : null;
    const appIdStr = typeof req.query['appId'] === 'string' ? req.query['appId'] : null;
    const market = (typeof req.query['market'] === 'string' ? req.query['market'] : null) ?? 'US';
    if (!title && !appIdStr) {
      res.status(400).json({ ok: false, error: 'pass ?title= or ?appId=' });
      return;
    }
    const { lookupItadIdsByTitles, lookupItadIdsBySteamAppIds, getPricesForGames, getShops } = await import('../services/itad');
    const { classifyShop, isShopInScope } = await import('../services/deals/storefronts');
    let itadId: string | null = null;
    if (appIdStr) {
      const map = await lookupItadIdsBySteamAppIds([Number(appIdStr)]);
      itadId = map.get(Number(appIdStr)) ?? null;
    } else if (title) {
      const map = await lookupItadIdsByTitles([title]);
      itadId = map.get(title) ?? null;
    }
    if (!itadId) {
      res.json({ ok: true, found: false, market, query: { title, appId: appIdStr } });
      return;
    }
    const prices = await getPricesForGames([itadId], market);
    const annotated = prices.flatMap((g) => g.deals.map((d) => ({
      shopName: d.shop.name,
      shopId: d.shop.id,
      classification: classifyShop(d.shop.name),
      price: d.price.amount,
      currency: d.price.currency,
      regular: d.regular.amount,
      cut: d.cut,
      url: d.url,
    })));
    res.json({
      ok: true,
      found: true,
      market,
      itadId,
      shopsReturned: annotated.length,
      inScope: annotated.filter((d) => d.classification !== 'excluded').length,
      onSale: annotated.filter((d) => d.cut > 0).length,
      deals: annotated,
    });
  } catch (err) {
    console.error('[admin/deals/probe] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

/* ── Events / Telemetry (TL1.3 of docs/TELEMETRY_PLAN.md) ────── */

// GET /api/admin/events
//
// Cursor-paginated chronological feed of user-events. Optional
// `?userId=` and `?event=` filters slice per user or per event-class
// (e.g. `?event=sync.first` to see every first-sync across all users).
// No mutation surface, no read-state — events are immutable per TL-D10.
//
// Mounts under the admin router's existing `/admin`-prefix middleware
// (F1.2 router-prefix fix), so no new auth wiring needed here.
const EVENT_PAGE_SIZE = 50;

const eventsQuerySchema = z.object({
  cursor: z.string().optional(),
  userId: z.string().optional(),
  event: z.string().optional(),
});

router.get('/admin/events', async (req: Request, res: Response): Promise<void> => {
  const parsed = eventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  const { cursor, userId, event } = parsed.data;

  const where = {
    ...(userId ? { userId } : {}),
    ...(event ? { event } : {}),
  };

  const rows = await prisma.userEvent.findMany({
    take: EVENT_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    // Secondary sort by id stabilises the cursor when multiple rows
    // share the same createdAt (same-millisecond writes). Matches the
    // platformLog precedent + F1.4's feedback list — don't drop it
    // thinking it's redundant; the cursor would skip rows on boundaries.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      user: { select: { id: true, email: true, name: true, steamId: true } },
    },
  });

  const hasMore = rows.length > EVENT_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, EVENT_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? last.id : null;

  const body: UserEventListResponse = {
    items: pageRows.map((e) => mapUserEventWithUser(e)),
    nextCursor,
  };
  res.json(body);
});

export default router;
