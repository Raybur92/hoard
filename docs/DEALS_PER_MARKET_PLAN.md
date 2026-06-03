# Per-market deals sync — plan

**Status:** ✅ Shipped 2026-06-03 (commit `309496c`). See CLAUDE.md Recent
Fixes entry for landing notes. This file is preserved for the design
rationale + operational recipe (pgbouncer-safe migration apply) in case
the same pattern is needed for future schema additions.

## Problem

The `/deals` page currently surfaces prices in **one market only** — the admin's
(`pickMarket()` in `apps/api/src/services/deals/syncDeals.ts` and the two
console orchestrators). The Settings → Account market picker stores
`User.marketCode` and round-trips it on `/api/deals` responses, but it has
**no effect on actual prices** — every beta user sees Andrea's AT pricing
regardless of what they set.

For closed-beta scale (4-6 EU users) the cents-level difference is small;
once the user base spans non-EU markets the discrepancy becomes material.

## Solution sketch

Store deals **per market** in the DB; orchestrators sync each distinct active
market; route filters by user's market.

### Schema changes

```prisma
model Deal {
  // existing fields...
  marketCode String  // NEW: ISO 3166-1 alpha-2, NOT NULL
  // CHANGED: was @@unique([gameId, shopId])
  @@unique([gameId, shopId, marketCode])
}

model PriceSnapshot {
  // existing fields...
  marketCode String  // NEW: same per-market keying so trend detection is per-market
  @@index([gameId, shopId, marketCode, snapshotAt])  // for the trending-down query
}

// Bundle stays GLOBAL — ITAD bundles aren't market-scoped.
```

### Migration

1. Hand-written SQL (pgbouncer makes `prisma migrate dev` hang — use the
   documented `prisma db execute --file ...` + Node `$executeRaw` recipe).
2. `ALTER TABLE "Deal" ADD COLUMN "marketCode" VARCHAR NOT NULL DEFAULT 'AT';`
   then `ALTER COLUMN "marketCode" DROP DEFAULT;` after backfill.
3. Same for `PriceSnapshot`.
4. Drop old unique constraint, add new composite unique.
5. Update `_prisma_migrations` row via Node script (the `migrate resolve`
   pattern has been hanging too lately).

### Orchestrator changes

- New helper `getDistinctActiveMarkets(): Promise<string[]>` —
  `SELECT DISTINCT "marketCode" FROM "User" WHERE "marketCode" IS NOT NULL`.
  If empty, fall back to `['US']` (or whatever default; admin's market is fine).
- `syncDealsForGames` already accepts `marketCode` arg — wrap the call site
  in a `for (const m of markets)` loop.
- `syncAllNintendoDeals` and `syncAllPsnDeals` — same pattern; loop over
  markets, each iteration calls the per-game inner loop with that market's
  locale. Bundles stays single-call (global).
- All `prisma.deal.upsert` / `priceSnapshot.create` calls thread `marketCode`.
- The "stale row cleanup" branches that call `prisma.deal.deleteMany` must
  scope deletion to the current market, NOT all markets.

### Route changes

- `apps/api/src/routes/deals.ts` — add `where: { marketCode: effective }` to
  the `prisma.deal.findMany` call.
- `effective = user.marketCode ?? adminMarketCode` (lookup admin once);
  preserves current behavior for users who haven't set their market yet.

### Cron

- No changes needed to `apps/api/src/cron/deals-refresh.ts` — the
  orchestrators handle market iteration internally.
- Total run time: N × current (~70 min). For closed beta likely 2-3 markets
  max → 2-3.5 hours. Still well within Railway hobby plan's daily compute.
- Sequential markets, not parallel — PSN scraping's 2.5s/game throttle
  shouldn't double-rate against Sony.

### Tests

- Existing route tests: update fixtures to include `marketCode: 'US'` on
  Deal rows; assert the route filters correctly.
- New test: user with `marketCode='IT'` sees only `marketCode: 'IT'` Deal
  rows; user without marketCode falls back to admin's market.
- Orchestrator tests: assert `marketCode` is written on every upsert call.

### UX

- No frontend changes required — the market picker already exists in
  Settings and the response shape already carries `marketCode`. Once
  per-market data is in the DB, users with different settings naturally
  see different deals.

## Estimated effort

1.5-2.5 hours focused work. Single PR. Migration apply is the riskiest
operational step (pgbouncer hang potential).

## Sticky property for the implementor

The existing PSN/Nintendo orchestrators already accept market-derived
locale internally — they're closer to per-market-ready than the ITAD
sync is. The bulk of the change is in `syncDeals.ts` (ITAD) and the
schema + migration. Test fixture updates will be the longest tail.

## Why deferred

Today's session (2026-06-02..03) shipped:
- Storefront allow-list broadening (Blizzard / EA Store / Ubisoft Store
  + GMG (as GreenManGaming) / Fanatical / GamesPlanet ×4)
- ITAD `/service/shops/v1` integration via explicit `shops` query param
- PSN picker tightening (prefix-match, `bundle` DLC keyword, removed
  DLC fallback)
- `/admin/itad/shops` diagnostic endpoint
- Daily Railway cron service for deals-refresh (still needs
  `NODE_ENV=production` removed from the cron service env vars)

That was a big iteration loop; Andrea explicitly deferred per-market
work to a clean day. Pick up when convenient.
