# Sync expansion — M-series plan

Bring auto-sync to the three platforms currently classified as manual-only: **itch.io**, **Epic Games Store**, and **Nintendo Switch**. Closes the gap left by Hard Rule #6 ("Nintendo and Epic are manual-only"). Hard Rule #6 is amended as a consequence of this workstream (see M-D1 below).

Single workstream banner, 4 PRs sequenced by risk + complexity: **M0 per-platform achievements → M1 itch.io → M2 Epic → M3 Nintendo**. Stop-and-confirm cadence between PRs per CLAUDE.md Hard Rule #10 — each PR ships fully (code + tests + doc closeouts) before the next opens.

M0 is a foundational data-model fix that must ship before the new platforms are added: Steam achievements and PSN trophies are entirely different sets per game (Cyberpunk: 44 Steam vs 45 PSN — different lists, not aliased), and the existing flat columns on `UserGame` flap on every sync cycle for cross-platform games (whichever sync fired last wins). Adding more platforms on top of that schema would compound the problem.

---

## 0. Sources

- Deep research dispatch (2026-05-27 session) — feasibility audit covering Nintendo / Epic / itch.io / Battle.net / EA / Ubisoft / Rockstar / Amazon / Humble. Verdict table archived in CLAUDE.md session transcript.
- `apps/api/src/services/platforms/gog.ts` — closest reference pattern: 3rd-party OAuth-shaped flow + identity-equality refresh + username capture + library pagination.
- `apps/api/src/services/platforms/psn.ts` — closest reference for token-paste UX (NPSSO) + concept-id stable resolution + cleanPsnTitle pattern.
- `apps/api/src/services/platforms/xbox.ts` — closest reference for API-key-paste UX (single long-lived secret).
- `apps/api/src/services/igdb.ts` — `getGameByExternalUid(urlPattern, uid)` helper from N-FIX. Reused for all 3 new platforms.
- `apps/api/src/services/syncRunner.ts` — IGDB resolution order: platform-id → title-search → localization fallback.
- `apps/web/src/components/screens/GogGuidedFlowDesktop.tsx` + `PsnGuidedFlowDesktop.tsx` — guided-flow precedents (5-step paste-token UI). Each new platform gets its own desktop + mobile guided flow following this pattern.
- `kinnay/NintendoClients` wiki — Parental Controls + Switch 2 endpoint reference. M3 implementation reads from this; does NOT pull `nxapi` as a dependency (see M-D2).
- IGDB `external_games` schema migration (N-FIX, 2026-05-27) — URL-pattern matching beats `category` enum filter. Same pattern applies for itch / Epic / Nintendo URL prefixes.

---

## 1. Locked decisions

**M-D1 — Hard Rule #6 amendment.** The CLAUDE.md rule "Nintendo and Epic are manual-only. No OAuth, no sync endpoints for these platforms. Do not build scrapers" is REPLACED by: "Manual-add via IGDB search + `platformLabel` remains the fallback for any platform not yet auto-synced (currently: none — all 7 platforms support sync after M-series). Add new sync paths via the M-series pattern: hand-rolled HTTP client + token-paste guided flow + IGDB external_games URL-pattern resolution." Mirrored as a new decision in `AGENT.md` post-M3.

**M-D2 — Hand-roll all 3 platform clients.** No `nxapi`, no `legendary`, no `egs-api-rs` as runtime dependencies. Reasons: (1) `nxapi` is AGPL-3.0 — contagious if Hoard ever ships as a product (locks the entire codebase). (2) `legendary` is Python, would need a child-process or HTTP-bridge. (3) `egs-api-rs` is Rust, same problem. (4) Hoard already hand-rolls PSN's NPSSO flow + GOG's Galaxy OAuth flow — the patterns transfer cleanly. Implementations may *read* AGPL/GPL sources for reference (auth-flow semantics, endpoint URLs, request shapes), but every line of code committed under `apps/api/src/services/platforms/{itch,epic,nintendo}.ts` is written from scratch under Hoard's existing license.

**M-D3 — Workstream sequence: M0 → M1 → M2 → M3.** M0 fixes the per-platform achievement model (foundational; ships before any new platform integration). M1 itch.io / M2 Epic / M3 Nintendo are ordered by ascending engineering risk: itch.io has an official sanctioned API (smallest, learn the new-platform onboarding pattern); Epic is widely reverse-engineered with a stable flow (medium); Nintendo's Moon API is least-trodden and requires the most user-facing setup (largest). Stop-and-confirm cadence per Hard Rule #10 — no auto-chaining.

**M-D4 — Each platform code adds its own stable-id column on `Game`.** Per the existing N-series pattern (`Game.psnConceptId @unique`, `Game.steamAppId @unique`, `Game.gogAppId`). New columns:
- `Game.itchGameId Int? @unique` (itch.io game IDs are integers from the API)
- `Game.epicCatalogItemId String? @unique` (Epic uses `namespace:catalogItemId` strings; we store the catalog ID)
- `Game.nintendoTitleId String? @unique` (Switch title IDs are 16-character hex strings)

All three follow the same pattern: persist on first successful sync, hit the stable-id path on subsequent syncs (bypassing the slower title-search). Mirrors the N-series resolution order: platform-id → title-search → localization fallback.

**M-D5 — Add `IT` to `PlatformCode` enum.** Migration shape mirrors the existing 2-letter convention (ST/PS/XB/GG/NT/EP). `NT` and `EP` already exist; only `IT` needs adding. No code migration needed for Nintendo or Epic — the codes are already correct in the schema (CLAUDE.md's reference text saying "`NINTENDO` manual · `EPIC` manual" was misleading; actual codes are `NT` and `EP`). Hard Rule reference text gets updated as part of M3 closeout.

**M-D6 — Per-platform data scope.** Each PR's data ambition is bounded by what the platform actually exposes:
- **itch.io (M1):** library only (owned + claimed games). No playtime (itch.io doesn't track), no achievements (itch.io has none), no wishlist (API has no wishlist endpoint).
- **Epic (M2):** library only (owned + ownership date). No playtime (Epic doesn't surface for non-Epic-developed games), no achievements (same reason), no wishlist (requires reverse-engineering the Helium internal client — explicitly out of scope).
- **Nintendo (M3):** library + per-game playtime + last-played. No achievements (Nintendo doesn't expose them as a data class), no wishlist.

UI consequence: `playtimeByPlatform.IT` and `playtimeByPlatform.EP` stay null/0 on synced rows; the existing HLTB silent-fail pattern from Rule 8 handles the display ("—" instead of an error).

**M-D7 — Per-platform achievement data model.** Achievement data lives in `UserGame.achievementsByPlatform: Json?` of shape `Partial<Record<PlatformCode, { earned: number, total: number, percent: number, updatedAt: string }>>`, mirroring the existing `playtimeByPlatform` shape. Replaces the 4 flat columns (`achievementsEarned`, `achievementsTotal`, `achievementsPercent`, `achievementsUpdatedAt`) which are dropped in M0. **Reason:** Steam achievements and PSN trophies are entirely different sets per game (Cyberpunk: 44 Steam achievements vs 45 PSN trophies — different lists, not aliased). The old flat columns flapped on every sync cycle for cross-platform games (whichever platform synced last won; the other's data was silently overwritten). Per-platform makes the data correct and extensible — a future Xbox or Nintendo achievement pipeline writes to `.XB` / `.NT` without colliding. UI consequence: GameDetail's PROGRESS section shows one row per platform that has achievement data; single-platform games look identical to today's rendering. Backfill heuristic for existing rows: attribute flat-column data to the user's most-recently-synced platform among `{ST, PS}` that has playtime > 0 for that row; fallback to `PS` when neither has playtime (matches current `achievementLabel()` default behavior). Imperfect for the small subset of cross-platform games where both Steam and PSN sync recently, but the next sync overwrites with correct per-platform data so misattribution is self-healing within one cycle.

**M-D8 — CM13 auto-promote reads ANY entry in `achievementsByPlatform`.** The existing `promoteWishlistOnEngagement(status, earned, percent)` helper from `apps/api/src/lib/achievements.ts` gets a new signature: `promoteWishlistOnEngagement(status, achievementsByPlatform)`. Iterates entries — returns `Completed` if ANY platform at percent === 100, `OnHold` if ANY platform with earned > 0, else null. No platform precedence; engagement signal is engagement signal regardless of source. Applies to Steam + PSN today (the only platforms writing achievement data); when/if a future platform adds achievement support it inherits the same any-platform semantics for free.

**M-D9 — CM13 playtime promote applies to Nintendo only among the new platforms.** itch.io and Epic provide no playtime signal, so the existing `promoteWishlistOnOwnership` (playtime-based) can't fire for those platforms. Nintendo's Moon API DOES surface daily playtime — first sync should re-evaluate any matched `Wishlist` UserGame via `promoteWishlistOnOwnership` (the existing helper from F1-PR5 / G-series), same way Steam/PSN/Xbox/GOG already do.

**M-D10 — Default `syncFrequency = HOURLY` for all 3 new platforms.** Same as Steam/PSN/Xbox/GOG. Rationale: Nintendo's Moon API rate limit is not aggressive enough to require a longer cadence at single-user scale (Andrea + Luigi + a handful of beta users); itch.io and Epic libraries change infrequently so HOURLY is mostly a no-op. The `useAutoSync` hook handles per-platform timing; no schema change.

**M-D11 — IGDB resolution: stable-id → URL-pattern external_games → title-search → localization fallback.** Same order as the N-FIX cascade. URL patterns added to IGDB helpers:
- itch.io: `itch.io/` (e.g. `https://example.itch.io/game-name`)
- Epic: `store.epicgames.com` (e.g. `https://store.epicgames.com/en-US/p/game-slug`)
- Nintendo: `nintendo.com/store/` (e.g. `https://www.nintendo.com/store/products/title-name-switch/`) + `nintendo.com/games/detail/` legacy pattern as secondary

All 3 wrap the shared `getGameByExternalUid(urlPattern, uid)` from N-FIX.

**M-D12 — Activity-log instrumentation extends to all 3 new platforms.** The existing 3-round diagnostic instrumentation from N-series (skipped titles + per-title error messages + platform-side IDs) is reused verbatim. Each platform sync emits the same shape: `library: N imported, K skipped (titles: …, +M more)` + `(errored: "X" → <error reason>)` + `(skipped: "X" [itchId=N / epicCatalogItemId=… / nintendoTitleId=…])`.

**M-D13 — Username capture follows the G-series fail-silent pattern.** Each platform gets a `get{Platform}Username` helper that returns `string | null` and never throws. Wired into both the initial `connect` endpoint AND each `sync` branch as a backfill (the GOG mid-sync clobber pattern from G-series). Surfaces as "signed in as X" in PlatformDetail + Settings.

**M-D14 — Hard-rule documentation update.** Rule #6 in `CLAUDE.md` rewritten as part of M3 closeout. Rule #7 (no production database tests) unaffected. Rule #8 (HLTB silent-fail) extends naturally to the new platforms — no doc change.

---

## 2. Scope

### In scope (M-series total)

**M0 — Per-platform achievement model:**
- New `UserGame.achievementsByPlatform Json?` column + backfill + drop the 4 flat columns (`achievementsEarned`, `achievementsTotal`, `achievementsPercent`, `achievementsUpdatedAt`).
- PSN trophy writer writes to `.PS` key; Steam achievement writer writes to `.ST` key.
- CM13 `promoteWishlistOnEngagement` helper signature change to read across all platform entries (M-D8).
- `mapUserGame` + `UserGameRow` updated to surface the new shape.
- GameDetail desktop + mobile render one row per platform with achievement data (multi-row for cross-platform games; single-row identical to today's rendering).
- Dashboard T6 rollup aggregates across all platforms.
- New frontend helper `buildAchievementRows(achievementsByPlatform)` mapping each platform code to its display label (`PS → 'trophies'`, others → `'achievements'`). Replaces the existing `achievementLabel(playtimeByPlatform)` helper.

**M1–M3 — Platform integrations:**
- New `PlatformCode.IT` enum value + migration.
- Three new `Game` columns: `itchGameId`, `epicCatalogItemId`, `nintendoTitleId`, each `@unique` and nullable.
- Three platform clients in `apps/api/src/services/platforms/`: `itch.ts`, `epic.ts`, `nintendo.ts`. Each owns auth, library fetch, username capture, IGDB resolution dispatch.
- Three IGDB external-id helpers wrapping `getGameByExternalUid`: `getGameByItchUrl`, `getGameByEpicUrl`, `getGameByNintendoUrl`.
- Three guided-flow components × desktop + mobile = 6 new screens. Each follows the `PsnGuidedFlowDesktop` / `GogGuidedFlowDesktop` pattern.
- Three new `/api/auth/{itch,epic,nintendo}/connect` endpoints.
- syncRunner branch extensions in `apps/api/src/routes/platforms.ts` for the 3 new codes.
- `useAutoSync` extension to dispatch the new codes (mostly a no-op if the dispatch table is data-driven).
- Activity-log instrumentation for all 3 platforms (M-D12).
- CM13 playtime auto-promote integration for Nintendo only (M-D9).
- Cumulative test budget: ~47 backend (~12 M0 + ~35 M1–M3), ~16 frontend (~3 M0 + ~13 M1–M3). See per-PR estimates in §3.

### Out of scope (M-series)

- **Wishlist sync** for any of the 3 platforms (M-D6 reasoning). Manual `[+ wishlist]` on Releases page still works.
- **Achievements** for any of the 3 platforms (M-D6 reasoning).
- **Epic's Helium / private wishlist client** reverse-engineering.
- **Nintendo NSO / Coral API** (friend presence, SplatNet, NookLink) — research showed no library or playtime data exposed there.
- **AGPL/GPL library dependencies** (M-D2).
- **Switch 2-specific endpoints beyond what the existing Moon API covers** — Switch 2 console activity rolls up under the same Moon endpoints per kinnay's wiki Jan 2026 update. If Nintendo splits the surface later, that's a follow-up PR.
- **Itch.io achievements** (don't exist as a platform feature).
- **Removing rows** when a user removes a game from their itch.io / Epic / Nintendo account. Mirrors the existing Steam wishlist limitation (CLAUDE.md "Known gaps"): would need a `source` column on UserGame to distinguish sync-originated rows from manual-add ones. Schema change deferred.
- **Switch 2 distinct platform code** (`NS2`?). For now `NT` covers both Switch 1 and Switch 2 — Nintendo's parent ecosystem treats them as a single account surface, and IGDB returns both consoles' platforms on the same query.
- **Backfill** of existing manual `NT` / `EP` rows that have `platformLabel` strings — the existing manually-added games stay manually-added; sync-originated rows accumulate alongside. User can manually remap via the `[wrong game?]` chip if a sync-discovered row collides with a prior manual-add (CM13 + the F1-PR5 6-row conflict matrix handle this).

---

## 3. PR sequence

### M0 — Per-platform achievements (~2-3 days)

**Foundational data-model fix. Must ship before M1 even though no M-series platform consumes achievement data, because the existing schema is actively wrong for the cross-Steam-PSN cohort. Andrea's library spans 488 Steam + 147 PSN games — meaningful overlap on cross-platform titles is near-certain.**

**Schema**
- Migration `add_achievements_by_platform`:
  1. Add `UserGame.achievementsByPlatform Json?` column.
  2. Run backfill SQL (below) — attributes flat-column data to most-recently-synced platform among `{ST, PS}` that has playtime > 0 for that row; fallback to `PS` when neither has playtime.
  3. Drop `UserGame.achievementsEarned`, `achievementsTotal`, `achievementsPercent`, `achievementsUpdatedAt`.
- Applied via the documented pgbouncer recipe (`db execute` + `migrate resolve --applied`).

**Backfill SQL** (single transaction; runs as part of migration step 2):
```sql
UPDATE "UserGame" ug
SET "achievementsByPlatform" = jsonb_build_object(
  COALESCE(
    (SELECT p.code FROM "Platform" p
     WHERE p."userId" = ug."userId"
       AND p.code IN ('ST', 'PS')
       AND (ug."playtimeByPlatform"->>p.code)::int > 0
     ORDER BY p."lastSyncAt" DESC NULLS LAST LIMIT 1),
    'PS'
  ),
  jsonb_build_object(
    'earned', ug."achievementsEarned",
    'total', ug."achievementsTotal",
    'percent', ug."achievementsPercent",
    'updatedAt', ug."achievementsUpdatedAt"
  )
)
WHERE ug."achievementsTotal" IS NOT NULL;
```

**Backend**
- `apps/api/src/services/trophies.ts` (PSN trophy writer) — `applyPsnTrophyAggregates` writes to `achievementsByPlatform.PS = { earned, total, percent, updatedAt: now() }` instead of flat columns. Existing `.ST` entry preserved on update (merge, don't replace).
- `apps/api/src/services/platforms/steamAchievements.ts` — writes to `.ST` key. Existing `.PS` entry preserved.
- `apps/api/src/lib/achievements.ts` — `promoteWishlistOnEngagement` signature change from `(status, earned, percent)` to `(status, achievementsByPlatform)`. Iterates entries: any platform at percent === 100 → `Completed`; any platform with earned > 0 → `OnHold`; else null. Preserves `Dropped/Wishlist/Completed` per T-D2.
- `apps/api/src/lib/mappers.ts` — `UserGameRow` + `mapUserGame()` updated to expose `achievementsByPlatform`. Drop the 4 flat-column references.
- `packages/types/src/index.ts` — new `AchievementEntry` type + `AchievementsByPlatform` type (`Partial<Record<PlatformCode, AchievementEntry>>`).
- Routes that mutate UserGame (`POST /api/games/manual`, `POST /api/games/:id/remap`, the PSN/Steam sync paths) updated to pass through the new shape.

**Frontend**
- `apps/web/src/lib/utils.ts` — new helper `buildAchievementRows(achievementsByPlatform)` returning `Array<{ code: PlatformCode, label: 'trophies' | 'achievements', earned, total, percent, updatedAt }>`. Hardcoded label mapping: `PS → 'trophies'`; everything else → `'achievements'`. Sorted by code precedence (PS first, then ST, then alphabetical) so the rendering order is stable.
- Drop `achievementLabel(playtimeByPlatform)` helper — no longer needed (label comes from the row's platform code, not from inferred playtime).
- `GameDetailDesktop` — replace the single `// trophies · 12/35 · 34%` Marker with a `buildAchievementRows()`-driven loop. Hidden when the array is empty. Percent ≥ 80 → `var(--green)`; else `var(--paper-dim)` (matches existing T5 styling).
- `GameDetailMobile` — same treatment in the PROGRESS pre-block.
- `DashboardStats.achievementsRollup` aggregation: change from a single Prisma `aggregate` on the dropped columns to a per-row iteration that sums `.earned` + `.total` across all entries in each `achievementsByPlatform`. Returns `null` when no row has any achievement data (UI hide behavior preserved).
- `apps/web/src/test-fixtures/*` — fixtures that hardcode the 4 flat columns updated to the new shape.

**Tests**
- ~12 backend tests:
  - 3 PSN trophy writer (write to `.PS` / merge preserves existing `.ST` / clobber-guard on PSN re-sync)
  - 3 Steam achievement writer (mirror of above for `.ST`)
  - 4 CM13 multi-platform promote (Wishlist + any-platform-100 → Completed / Wishlist + any-platform >0 → OnHold / Wishlist + all-zero → null / non-Wishlist status preserved)
  - 2 dashboard rollup (single-platform sum unchanged / multi-platform sum aggregates correctly)
- ~3 frontend tests: `buildAchievementRows` shape + ordering + GameDetail multi-row render + GameDetail single-platform unchanged

**Verification (manual, post-deploy)**
- Spot-check 5 cross-platform games in Andrea's library via Prisma Studio. Confirm `achievementsByPlatform` has the expected entries.
- Trigger one Steam re-sync + one PSN re-sync. Confirm the OTHER platform's data is preserved (no clobber).
- Eyeball GameDetail on a known cross-platform game (e.g., search for any title with both `.ST` and `.PS` entries post-sync). Confirm two achievement rows render.

**Closeout**
- `docs/SYNC_EXPANSION_PLAN.md` §6 M0 row marked Done with commit hash.
- `docs/PLAN.md` Phase Status row added.
- `CLAUDE.md` Current Phase → "M1 — itch.io"; Recent Fixes entry for M0 with the backfill heuristic note.
- No AGENT.md entry — the per-platform shape is symmetric with `playtimeByPlatform` which doesn't have an AGENT.md entry either. M-D7 + M-D8 stay scoped to this plan doc.

**Stop and confirm before M1 opens.**

---

### M1 — itch.io (~1-2 days)

**Smallest PR; learn the new-platform pattern.**

**Schema**
- Migration: add `IT` to `PlatformCode` enum + `Game.itchGameId Int? @unique`. Apply via the documented pgbouncer recipe (`db execute` + `migrate resolve --applied`).

**Backend**
- `apps/api/src/services/platforms/itch.ts`:
  - `getItchUsername(apiKey)` → calls `https://itch.io/api/1/<key>/me`. Returns `string | null` (fail-silent per M-D11).
  - `getItchLibrary(apiKey)` → paginated `https://itch.io/api/1/<key>/my-owned-keys?page=N` until `keys.length === 0`. Returns normalized `{ title, itchGameId, itchUrl, addedAt }[]`.
  - `validateItchApiKey(apiKey)` → calls `/me`, returns true on 200, false otherwise. Used at `connect` time.
- `apps/api/src/services/igdb.ts` — add `getGameByItchUrl(itchUrl)` wrapping `getGameByExternalUid('itch.io/', itchUrl)`.
- `apps/api/src/routes/platforms.ts` — extend connect handler + sync branch for `IT`.
- syncRunner-level: resolution order = `itchGameId-from-prior-row` → `getGameByItchUrl` → title-search. (No localization fallback expected to fire for itch.io — most rows that miss IGDB are jam games that don't exist in IGDB at all; per L-series localization is queried but legitimately returns null.)

**Frontend**
- `ItchGuidedFlowDesktop.tsx` + `ItchGuidedFlowMobile.tsx`: 3-step flow.
  - Step 1: "Open itch.io settings → API keys → generate a new key" (with screenshot or text walkthrough).
  - Step 2: paste API key into Hoard.
  - Step 3: validating + first sync trigger.
- New `IT` entry in `PlatformsList` / `PlatformPicker` / `PlatformDetail*` so the user can find it.
- IGDB platform code mapping in `apps/web/src/components/screens/releases/utils.ts` (`toPlatCode`) — verify `Itch.io` (or similar IGDB platform name) maps to `IT`.

**Tests**
- ~8 backend tests: 4 fetcher (happy / 401 / 404 / network-error) + 3 sync (normalize + URL-pattern resolution + skip-on-no-match) + 1 connect-endpoint (invalid-key 400).
- ~3 frontend tests: guided-flow step-progression + API-key validation + first-sync trigger.

**Closeout**
- `docs/SYNC_EXPANSION_PLAN.md` §6 row marked Done with commit hash.
- `docs/PLAN.md` Phase Status row added.
- `CLAUDE.md` Current Phase updated to "M2 — Epic" + Recent Fixes entry for M1.
- No `AGENT.md` entry (M1's decisions constrain M-series specifically, not future work).

**Stop and confirm before M2 opens.**

---

### M2 — Epic Games Store (~1-2 weeks)

**Token-paste flow mirroring PSN's NPSSO UX, with Epic's auth-code semantics.**

**Schema**
- Migration: `Game.epicCatalogItemId String? @unique` + a Platform credentials field for the Epic refresh token (the existing `Platform.credentials` JSON column handles this — no schema change, just a new key shape `{ accessToken, refreshToken, accountId, expiresAt }`).

**Backend**
- `apps/api/src/services/platforms/epic.ts`:
  - `exchangeEpicAuthCode(code)` → POST to `account-public-service-prod03.ol.epicgames.com/account/api/oauth/token` with `grant_type=authorization_code` + the public-client basic auth (Heroic/Legendary client ID, widely used). Returns `{ access_token, refresh_token, account_id, expires_in }`.
  - `refreshEpicToken(refreshToken)` → same endpoint with `grant_type=refresh_token`.
  - `ensureFreshEpicCredentials(creds)` → identity-equality refresh pattern from GOG. Returns same object when valid, new object when refreshed. Caller persists only on identity change.
  - `getEpicUsername(creds)` → `/account/api/public/account/{accountId}`.
  - `getEpicLibrary(creds)` → paginated `library-service-prod.live.use1a.on.epicgames.com/library/api/public/items?platform=Windows&label=Live&cursor=…`. Returns normalized list with `epicCatalogItemId` + `namespace` + `epicUrl` (constructed from namespace + slug).
- `apps/api/src/services/igdb.ts` — add `getGameByEpicUrl(epicUrl)` wrapping `getGameByExternalUid('store.epicgames.com', epicUrl)`.
- `apps/api/src/routes/platforms.ts` — extend connect + sync branches for `EP`.
- syncRunner-level: resolution order = `epicCatalogItemId-from-prior-row` → `getGameByEpicUrl` → title-search → localization fallback.

**Frontend**
- `EpicGuidedFlowDesktop.tsx` + `EpicGuidedFlowMobile.tsx`: 4-step flow.
  - Step 1: "Open Epic web login URL" (with the redirect baked in to capture the auth code).
  - Step 2: "After logging in, copy the URL from your browser address bar." The redirect URL contains `?code=XXX`.
  - Step 3: paste the URL into Hoard. Hoard parses out the `code=` param.
  - Step 4: validating + first sync trigger.
- Same component shape as `PsnGuidedFlow*`, with Epic-specific copy + screenshots.

**Tests**
- ~12 backend tests: 4 auth-flow (exchange / refresh / refresh-no-op / refresh-failure) + 3 fetcher (library / username / 401) + 3 sync (resolution cascade / skip / merge) + 2 connect (happy / invalid-code).
- ~5 frontend tests: each guided-flow step + URL parsing + paste validation.

**Closeout**
- Plan + PLAN.md + CLAUDE.md + Recent Fixes.
- No AGENT.md entry.

**Stop and confirm before M3 opens.**

---

### M3 — Nintendo Switch (~1-2 weeks)

**Parental Controls Moon API. Hand-rolled per M-D2.**

**Schema**
- Migration: `Game.nintendoTitleId String? @unique`. Platform credentials JSON gets a new shape `{ sessionToken, accessToken, accessTokenExpiresAt, deviceId }`. Session token is the long-lived persistent credential; access tokens are short-lived (~15min).

**Backend**
- `apps/api/src/services/platforms/nintendo.ts`:
  - `exchangeNintendoSessionTokenCode(code)` → POST to `accounts.nintendo.com/connect/1.0.0/api/session_token` with `session_token_code` + `session_token_code_verifier`. Returns `{ session_token }` (long-lived).
  - `exchangeNintendoAccessToken(sessionToken)` → POST same endpoint with `session_token` grant type. Returns `{ access_token, id_token }` (short-lived).
  - `ensureFreshNintendoCredentials(creds)` → identity-equality refresh pattern. Re-exchanges access_token from session_token when expired.
  - `getNintendoUsername(accessToken)` → parent account profile endpoint.
  - `getNintendoDevices(accessToken)` → `https://api-lp1.pctl.srv.nintendo.net/moon/v1/devices?filter.device.synchronized.$eq=true`. Returns `{ id, label, ... }[]` of consoles linked to the parent account.
  - `getNintendoMonthlySummaries(accessToken, deviceId, sinceMonth)` → paginated `https://api-lp1.pctl.srv.nintendo.net/moon/v1/devices/{deviceId}/monthly_summaries`. Returns per-month rolled-up playtime by title.
  - `getNintendoDailySummary(accessToken, deviceId, date)` → optional refinement for last-played dates (per-day breakdown).
  - `syncNintendoLibrary(creds)` → on first sync, fetch all monthly summaries since 12 months ago; on subsequent syncs, fetch since last sync. Aggregate per-title playtime + last-played-at across the summary set. Returns normalized list.
- `apps/api/src/services/igdb.ts` — add `getGameByNintendoUrl(nintendoUrl)` wrapping `getGameByExternalUid('nintendo.com/store/', nintendoUrl)` + secondary `'nintendo.com/games/'` pattern for legacy URLs.
- `apps/api/src/routes/platforms.ts` — extend connect + sync branches for `NT`.
- syncRunner-level: resolution order = `nintendoTitleId-from-prior-row` → `getGameByNintendoUrl` (if Moon API returns store URLs — TBD during implementation) → title-search → localization fallback. **Operational note:** Moon API may not return store URLs directly; we may need to construct them from the title ID + Nintendo's deterministic URL scheme. Probe during M3 design.
- CM13 auto-promote integration: after syncRunner returns, iterate matched `Wishlist` UserGames with new Nintendo playtime and dispatch to `promoteWishlistOnOwnership` (existing helper from F1-PR5).

**Frontend**
- `NintendoGuidedFlowDesktop.tsx` + `NintendoGuidedFlowMobile.tsx`: 6-7 step flow.
  - Step 1: explainer — "Nintendo doesn't expose owned games directly; we use the Parental Controls API. This requires a one-time setup."
  - Step 2: "Install the Nintendo Switch Parental Controls app on your phone."
  - Step 3: "In the app, register your console with your own Nintendo Account as the parent."
  - Step 4: "Open this auth URL in your browser (link)." Hoard generates a Nintendo OAuth URL with a custom redirect target.
  - Step 5: "After logging in, your browser will redirect to a `npf...` URL. Copy the full URL from the address bar." (PSN-NPSSO-paste analogue but more complex.)
  - Step 6: paste URL into Hoard. Hoard extracts `session_token_code` from the URL fragment, exchanges for `session_token`, persists.
  - Step 7: validating + first sync trigger.
- Honest copy in Step 1: "This setup is fiddly because Nintendo doesn't offer a public API for owned games. Once done, syncs run hourly like any other platform."

**Tests**
- ~15 backend tests: 5 auth chain (session-token-code → session-token → access-token + refresh + identity-equality) + 4 Moon API (devices + monthly + daily + 401) + 3 sync (aggregation across months + IGDB resolution + Wishlist promote) + 3 connect (URL parsing happy + invalid + missing-code).
- ~5 frontend tests: each guided-flow step + URL parsing + paste validation.
- **Probe spike before backend code:** small read-only script `scripts/probe-nintendo-moon.ts` that takes a hand-captured session_token and dumps device + monthly_summaries responses. Runs once locally on Andrea's account; validates the kinnay/wiki claims before committing engineering effort. Throwaway script, NOT committed long-term (delete after M3 lands).

**Closeout**
- Plan + PLAN.md + CLAUDE.md (including Hard Rule #6 rewrite per M-D1 + M-D12) + Recent Fixes.
- AGENT.md decision entry for M-D1 (the rule amendment is architectural-shaped — future work needs to know that auto-sync is the default for new platforms, not the exception).
- Update memory file `project_psn_token_reaccess_gap.md` if Nintendo has a similar re-access gap (likely yes — session_token persistence + UX for re-pasting when invalidated).

---

## 4. Deferred / out of scope (M-series)

- **Achievement/trophy parity** for the 3 new platforms — none expose them as data. CM13 logic stays Steam/PSN-only (M-D7).
- **Wishlist auto-import** — M-D6. Manual `[+ wishlist]` continues to work for all platforms.
- **Per-UserGame `source` column** to safely identify sync-originated wishlist rows for removal. Schema-change effort; defer until cohort signal demands it. (Existing Steam-wishlist-is-one-way limitation also unblocks here.)
- **Switch 2 split** — single `NT` code covers both consoles for v1. Revisit if Nintendo bifurcates the parent-account surface.
- **Nintendo NSO / Coral integration** (presence, friends, SplatNet) — out of scope; no library data exposed.
- **Epic Helium / wishlist reverse-engineering** — out of scope.
- **Cross-platform de-dup of itch.io games that also exist on Steam/GOG** — IGDB's stable game ID handles this naturally (a game with the same igdbId across two platforms merges into one UserGame with `playtimeByPlatform.IT` + `playtimeByPlatform.ST`).

---

## 5. Open questions

**Q0 — M0 backfill misattribution scale.** For Andrea's library, how many cross-platform games actually exist where both `.ST` and `.PS` playtime > 0 AND both platforms have recent `lastSyncAt`? The backfill heuristic picks the most-recently-synced platform; for the small ambiguous subset, attribution is a coin-flip until the next per-platform sync rewrites the data correctly. **Resolve via a quick `psql` count before running the backfill** — if the ambiguous count is < 30, the migration runs as-is and the next-sync self-heal handles it; if it's > 100, consider option 3 from the original analysis (re-fetch from both APIs during migration, ~10 min for the affected rows).

**Q1 — Moon API store-URL availability.** Does the Moon API's monthly_summaries response include a Nintendo store URL per title, or only the title ID + name? If only title ID, M3's IGDB resolution drops the URL-pattern step and goes straight to title-search + localization (Switch games' localized titles are common — Japanese release names differ; L-series fallback should fire). **Resolve via the M3 probe spike** (`scripts/probe-nintendo-moon.ts`) before backend coding starts.

**Q2 — Epic public-client ID stability.** Heroic + Legendary both use the same public client ID (`34a02cf8f4414e29b15921876da36f9a`). Has Epic ever revoked or rotated it? Probe during M2 design via a quick `curl` against the token endpoint; if Epic challenges third-party use, fall back to registering a dedicated client (would need an Epic developer account — TOS conversation).

**Q3 — itch.io API rate limit.** itch.io docs don't publish a hard rate limit. M1's library fetch is paginated; if Andrea's itch library is large (>500 games), throttling may be needed. Probe during M1 against his real library; default to 200ms between page fetches as a polite floor.

**Q4 — Nintendo `Parental Controls` parental-account setup.** Andrea needs to confirm during M3 that he can self-register as both parent + child of his own console. Per the research this IS a supported Nintendo pattern, but the UX needs verification before the guided flow copy is finalized. If it turns out to require a second Nintendo account (parent ≠ child), the guided-flow copy gets more honest about the setup cost.

---

## 6. Phase status

| PR | Scope | Status | Commit |
|----|-------|--------|--------|
| M0 | Per-platform achievement model + backfill | Done 2026-05-28 | `18a46a8` + `36fcf6d` |
| M1 | itch.io auto-sync | Done 2026-05-28 | pending commit |
| M2 | Epic auto-sync | Not started | — |
| M3 | Nintendo auto-sync | Not started | — |
| M-doc | Hard Rule #6 amendment + AGENT.md decision + memory updates | Bundled into M3 closeout | — |

**M1 closeout notes (2026-05-28):**
- `IT` added to `PlatformCode` enum (database + `@hoard/types`); `Game.itchGameId Int? @unique` column added. Migration `20260528150000_itch_platform_code` applied via `prisma db execute` + a Node `$executeRaw` fallback for `migrate resolve` (the documented advisory-lock hang surfaced this time around). Verified post-migration: enum lists `ST, PS, XB, GG, NT, EP, IT`; `Game.itchGameId` column present as INTEGER; `Game_itchGameId_key` unique index present.
- Backend: new `apps/api/src/services/platforms/itch.ts` (`validateItchApiKey` / `getItchUsername` / `syncItchLibrary`). Paginated `/my-owned-keys` walker with 200ms polite delay + 50-page hard cap. Throws on 401/403 (revoked key); fail-silent for `validateItchApiKey` + `getItchUsername` per M-D13.
- `getGameByItchGameId` added to `apps/api/src/services/igdb.ts` wrapping the shared `getGameByExternalUid('itch.io', uid)`. Cached 24h same as siblings. Expect low match rate per M-D9 — most itch.io games aren't in IGDB.
- `syncRunner.ts` resolution cascade extended: `steamAppId → psnConceptId → xboxTitleId → gogAppId → itchGameId → title-search → localization`. `Game.itchGameId` persisted on upsert; P2002 collision recovery extended to handle it.
- `routes/platforms.ts`: `POST /api/platforms/itch/connect` (validate-then-persist), IT branch in `POST /platforms/:code/sync`, IT added to all validCodes lists, PLATFORM_NAMES gains `IT: 'itch.io'`, credentials reveal endpoint extended to expose `{ apiKey }`, username backfill block includes IT.
- Frontend: new 4-step `ItchGuidedFlowDesktop` + `ItchGuidedFlowMobile` components (lazy-routed at `/settings/platforms/it/connect`). `api.connectItch(apiKey)` client method with cache invalidation matching the other platforms. `PlatformDetailDesktop` + `PlatformDetailMobile` + `SettingsDesktop` + `SettingsMobile` platform maps + lists all include IT. `dashboard.ts` `PLATFORM_LABELS` adds IT, `buildAchievementRows` sort order extends to IT (no achievement support — entry will never appear, but the type system stays exhaustive).
- Tests: 14 new backend tests (5 validateItchApiKey + 3 getItchUsername + 5 syncItchLibrary + 4 connect-route) + 6 new frontend tests (5 ItchGuidedFlow + 1 api-invalidation for connectItch). Final: **37 backend suites / 511 tests passing** (+17 from M0's 494); modified web files green. Typecheck + lint clean (1 pre-existing warning).
- Q3 from §5 (itch.io rate limits) resolved by default: polite 200ms inter-page delay + 50-page hard cap, no rate-limit handling needed for single-user libraries.
- One operational note worth keeping: `prisma migrate resolve --applied` hit the documented pgbouncer advisory-lock hang again. The Node `$executeRaw` fallback recipe in CLAUDE.md operational gotchas worked cleanly. Two ON CONFLICT gotchas surfaced: the `_prisma_migrations` table doesn't have `migration_name` as a unique constraint, so `ON CONFLICT (migration_name) DO NOTHING` errors with P2010 (code 42P10). Use a SELECT-then-INSERT pattern instead.

**M0 closeout notes (2026-05-28):**
- Q0 probe ran twice against prod (value-based first, then refined key-presence) — 33 ambiguous out of 1222 rows (2.7%); YELLOW per the plan's threshold but well within self-healing range. Refined heuristic shipped in the migration: uses Postgres `?` operator for JSONB key-presence, not value > 0. Ambiguous attribution self-heals on next per-platform sync.
- Backfill verified post-migration via `scripts/check-trophies.ts`: 1222 rows now have `achievementsByPlatform` entries (887 ST + 335 PS = 1222 — exact match with probe predictions).
- Test counts at M0 close: backend 36 suites / 494 tests passing; modified web files 12 tests passing (full vitest suite hangs at end per documented infra flake, but every test it ran passed).
- One operational note: the documented `prisma migrate resolve` pgbouncer hang did NOT recur on this migration — the command returned cleanly. Probably depends on the specific session/connection state; the documented fallback recipe remains valid if it ever does hang again.

---

## 7. Notes for future contributors

- **The IGDB external_games URL-pattern is load-bearing.** Don't go back to filtering by `category` enum — N-FIX showed IGDB is migrating that schema and rows with `category=NULL` get silently dropped. Same caution applies to itch / Epic / Nintendo lookups.
- **Token-paste guided flows have a re-access gap.** Per the existing `project_psn_token_reaccess_gap.md` memory, the PSN guided flow only shows the token URL on first connect. M1 / M2 / M3 inherit this gap — when an itch.io API key, Epic refresh token, or Nintendo session_token expires (or gets revoked), the user has no in-app path back to the original URLs. Future workstream: "platform reconnect affordance" covering all 5 token-paste platforms (PSN + itch + Epic + Nintendo + Xbox's OpenXBL key).
- **Activity-log instrumentation is reusable as-is.** The 3-round diagnostic instrumentation pattern from N-series (skipped titles + per-title error messages + platform-side IDs) was designed to scale to N platforms. New platform sync just emits the same shape. No special-casing in the activity-log frontend.
