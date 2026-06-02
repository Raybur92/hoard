# DEALS-PR2.5 — console storefronts (PSN + Nintendo + Xbox)

Andrea 2026-06-02: "There are still all the other official stores missing.
We have only GOG, Epic, and Steam right now." Probe (`scripts/probe-deal-coverage.ts`)
clarified we actually have **5** PC storefronts via ITAD (Steam, GOG, Epic,
Humble Store, Microsoft Store PC) — but the three console-side stores
(PSN, Nintendo eShop, Xbox console) are entirely absent.

ITAD is **structurally PC-only** (probe-deal-coverage.ts confirmed zero
PSN/Nintendo entries even for console-exclusive titles ported to PC).
gg.deals' API was checked — also aggregate-only, no per-store breakdown
(probe-gg-prices-only.ts).

A federated **deep research probe** (`scripts/probe-deep-research.ts`,
`scripts/probe-ms-catalog.ts`, `scripts/probe-psn-search-page.ts`,
`scripts/probe-psn-concept-page.ts`) found viable paths for all three
console storefronts.

## 1. Final findings

| Storefront | Data source | Status | Notes |
|---|---|---|---|
| Steam · GOG · Epic · Humble Store · Microsoft Store (PC) | ITAD | ✅ shipped | DEALS-PR1 |
| **Xbox console** | **`displaycatalog.mp.microsoft.com/v7.0/products`** | 🟢 verified | Anonymous public API; returns `DisplaySkuAvailabilities[].Availabilities[].OrderManagementData.Price.{ListPrice, MSRP, CurrencyCode}` per market |
| **Nintendo eShop** | **`search.nintendo-europe.com/<locale>/select`** | 🟢 verified | Solr-backed; returns `price_regular_f` + `price_lowest_f` + `price_discount_percentage_f` + `price_has_discount_b`; keyed by `application_id_s` matching our `Game.nintendoTitleId` |
| **PSN** | **`store.playstation.com/<locale>/concept/<id>` page + `__NEXT_DATA__` scrape** | 🟢 verified | Anonymous HTML fetch; embedded Next.js JSON contains `basePrice` / `discountedPrice` / `discountText`; per-locale URL paths give native currency; keyed by `Game.psnConceptId` we already capture |

### What we ruled out

- **gg.deals API** (probe-gg-prices-only.ts): aggregate-only (`currentRetail` + `currentKeyshops` numbers, no per-store breakdown). Confirmed via email-verified key. `/v1/offers/` and `/v1/stores/` paths return 404 (no per-store endpoint exists). Useful as a SUPPLEMENTARY data source for "lowest somewhere" anchor but doesn't solve the per-store visibility we want.
- **PSN GraphQL persisted queries** (probe-deep-research.ts): zero `sha256Hash` matches in `store.playstation.com` home page source — Sony moved persisted-query hashes out of the static HTML. Scraping them now requires navigating dynamic JS bundles. Brittle multi-day work, fragile.
- **PSN legacy Chihiro / valkyrie REST APIs**: 404 (deprecated).
- **DekuDeals**: no public API (404).
- **PSPrices**: Cloudflare-walled (403).
- **Reddit r/GameDeals JSON**: now requires authentication (403).
- **Nintendo Americas Algolia**: anon key couldn't be extracted from the nintendo.com US store page source (they obfuscate harder now).

### Key insight (worth recording)

For all three console storefronts, the **user-facing browsing surface** is more accessible than the formal API surface. Sony's GraphQL is locked, but their search page works fine. Microsoft's Display Catalog is public because xbox.com itself uses it client-side. Nintendo's Solr endpoint powers their own eShop browse pages. Pattern: when official APIs are gated, the consumer-website-backing data layer is often a viable integration path.

## 2. Locked decisions

### DEALS-PR2.5-D1 — Three independent integrations, one PR.
All three console storefronts ship together in a single PR. Each has its own service module + sync orchestrator. Wired into `POST /api/admin/deals/refresh` alongside ITAD + bundles.

### DEALS-PR2.5-D2 — Reuse the existing `Deal` table.
All three sources persist their deals in the existing `Deal` table with `shopName` set to `'PlayStation Store'` / `'Nintendo eShop'` / `'Xbox Store'`. The storefront classifier (`storefronts.ts`) already classifies these as `'first-party'`. No schema change. The per-shop filter chip + bundles section + alerts strip + all existing UI continues to work unchanged.

### DEALS-PR2.5-D3 — Join by stable platform IDs we already capture.
- **Nintendo**: `application_id_s` ↔ `Game.nintendoTitleId` (16-char hex applicationId, populated by M3 Nintendo sync)
- **Xbox**: `xboxTitleId` → **`bigId` via Microsoft Display Catalog `alternateIds` lookup** (extra resolver step; cache the bigId on `Game.metadata.xboxBigId` so subsequent syncs skip the lookup)
- **PSN**: `concept` URL keyed by `Game.psnConceptId` (numeric concept id, populated by N-series PSN sync)

Games without the relevant platform ID populated get no deals from that source. Acceptable — the platform sync paths populate these IDs for every game on that platform.

### DEALS-PR2.5-D4 — Per-source locale mapping.
Each source has its own locale-URL pattern:

| Hoard `marketCode` | Nintendo Solr path | PSN concept path | MS Display Catalog `market` |
|---|---|---|---|
| AT | `/en/` (Austria fronts EUR) | `/en-at/` | AT |
| DE | `/de/` | `/de-de/` | DE |
| IT | `/it/` | `/it-it/` | IT |
| FR | `/fr/` | `/fr-fr/` | FR |
| ES | `/es/` | `/es-es/` | ES |
| GB | `/en-gb/` | `/en-gb/` | GB |
| US | (skip — NA endpoint different) | `/en-us/` | US |
| Others | skip | skip | skip |

Unmapped markets → skip that source for that user. No-op, not an error.

### DEALS-PR2.5-D5 — Per-source throttling.
- **Nintendo Solr**: 1 req/s polite default (no documented rate limit; Switch libraries are small <100 games per user; full sync <2min)
- **PSN concept pages**: 1 req every 2-3s (HTML pages, want to be polite; per-user PSN library typically ~150 games)
- **Microsoft Display Catalog**: documented soft limit ~600/hour; 1 req/s polite default; supports batch via `bigIds=ID1,ID2,...` (up to ~10 per request) — use batching to stay well under limit

All three: failure modes (network / unexpected response shape) caught + logged + treated as zero-result. Graceful degradation. Run alongside ITAD + bundles in the same `POST /api/admin/deals/refresh` handler.

### DEALS-PR2.5-D6 — PSN scrape: defensive parser.
HTML scraping is fragile if Sony reshuffles their Next.js page structure. Defense pattern:
- Extract `__NEXT_DATA__` script tag content
- JSON.parse with try/catch
- Recursive walk to find any `{ __typename: 'SkuPrice', basePrice, discountedPrice, ... }` objects (not relying on a specific path)
- If we find zero price nodes → log + treat as no-result (Sony shape change)
- A standing test pins a sample HTML response (capture once, replay in tests) so a runtime parser break fires a unit-test failure before it hits production

This is the only piece with real fragility risk. Mitigation: monitor sync logs for "PSN: 0 prices extracted" spikes that don't match historical patterns.

### DEALS-PR2.5-D7 — One-shot `bigId` backfill (Xbox).
Resolving `xboxTitleId → bigId` requires a Microsoft Display Catalog lookup per Game. For Andrea's library, that's a ~hundred queries. Run as a one-shot script (`scripts/backfill-xbox-bigids.ts`) post-deploy, cache result on `Game.metadata.xboxBigId`. Subsequent syncs read the cached value.

If the lookup ever fails (game removed from MS catalog, etc), skip that Game silently. Acceptable.

## 3. PR breakdown (single PR)

### Files created
- `apps/api/src/services/nintendoPrices.ts` — Solr client + per-game query helper
- `apps/api/src/services/psnPrices.ts` — `__NEXT_DATA__` scraper + price extractor
- `apps/api/src/services/xboxPrices.ts` — Display Catalog client + bigId resolver
- `apps/api/src/services/deals/syncNintendoDeals.ts` — orchestrator
- `apps/api/src/services/deals/syncPsnDeals.ts` — orchestrator
- `apps/api/src/services/deals/syncXboxDeals.ts` — orchestrator
- `scripts/backfill-xbox-bigids.ts` — one-shot resolver
- Tests per orchestrator (~6-8 per source = ~20 new tests total)

### Files modified
- `apps/api/src/routes/admin.ts` — extend `/admin/deals/refresh` to fire all 3 new orchestrators sequentially after ITAD + bundles
- `apps/api/src/services/deals/storefronts.ts` — verify `nintendo eshop` / `playstation store` / `xbox store` all in TIER_1 (already there per earlier check)
- `CLAUDE.md` Known Gaps — strike through the "PSN coverage" gap; record the federated approach as the resolved pattern

### Operational tasks (Andrea-owned, post-deploy)
1. Run `npx tsx scripts/backfill-xbox-bigids.ts --dry-run` then for real (~few minutes)
2. Run `POST /api/admin/deals/refresh` once to populate the three new sources
3. Eyeball `/deals` to verify PSN / Nintendo / Xbox deal rows appear with correct prices
4. Per-shop filter chip strip should now show 8 shops instead of 5

## 4. Sticky properties for future contributors

- **PSN HTML scrape is the only fragile piece.** If we ever see Sony shape changes, the parser needs updating. The defensive recursive-find pattern is forgiving (doesn't depend on specific paths), but a complete redesign of their page structure would break it. Worst case: lose PSN coverage temporarily until parser is repaired. PC + Nintendo + Xbox keep working.

- **All three sources read from public, anonymous endpoints.** No API keys, no auth headers, no rate-limit-bypass tricks. We're using the same data layer their own websites use. Polite throttling + graceful degradation is the contract.

- **One-shot bigId resolver runs once per game.** Cached on `Game.metadata.xboxBigId`. Future syncs read cache. If a game is added to the user's Xbox library later, the next sync run captures its `xboxTitleId` (already wired via M-series), then the FIRST deal-sync touching that game triggers a one-off bigId lookup before its price query.

- **Andrea's market is AT.** Currently the only user. If we ever onboard non-AT users:
  - Nintendo Solr: per the D4 table; markets outside that table skip silently
  - PSN: same per-locale URL pattern, just need to add the mapping
  - Xbox: `market=XX` parameter takes any ISO 3166 country code; should work everywhere Microsoft sells games

## 5. Phase status

| Sub-task | Status | Notes |
|---|---|---|
| Nintendo eShop integration | Done 2026-06-02 | Solr endpoint; join by nintendoTitleId; 8 tests pass |
| PSN integration | Done 2026-06-02 | Concept-page __NEXT_DATA__ scrape; join by psnConceptId; 14 tests pass (incl. sample-HTML snapshot for Sony-shape-change canary) |
| Xbox integration | **Dropped from this PR (2026-06-02)** | Mid-implementation probe revealed Microsoft Display Catalog requires `bigIds` — there's no anonymous resolver from `xboxTitleId → bigId`. `xbox.com/Search` doesn't embed structured JSON like PSN does (search results render client-side via separate JS bundles + Xbox-auth Display Catalog calls). Three remaining paths (drop, fuzzy regex match, manual mapping) — Andrea chose drop. Microsoft Store PC already covers the same digital catalog at similar prices via ITAD (123 deals tracked); Xbox console-side adds marginal value for the shrinking pool of Xbox-exclusive titles. Documented as Known Gap with revisit conditions. |
| `/admin/deals/refresh` orchestrator wire | Done | Sequential after ITAD + bundles; per-source counters returned in response |
| Doc closeouts | Done | Plan + Known Gap (Xbox revisit) + commit |
