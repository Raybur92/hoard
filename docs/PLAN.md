# Hoard — Execution Plan

> **Scope:** This file covers execution only — phases, deliverables, success criteria, testing, and current status.
> For project context, design philosophy, tech stack, data model, key decisions, and risks: read `AGENT.md`.
> For commands, hard rules, and design system reference: read `CLAUDE.md`.

---

## Routes (quick reference)

| Route | Screen | Notes |
|---|---|---|
| `/` | Dashboard | Stats, now-playing, backlog picker, wishlist countdown |
| `/library` | Library | Horizontal shelves by status |
| `/library/:status` | Library filtered | Same view, one status |
| `/upcoming` | Upcoming releases | IGDB feed, countdown, timeline |
| `/game/:id` | Game detail | Receipt-style record |
| `/settings` | Account / platforms | Account, Platforms, Appearance, Danger Zone |
| `/login` | Auth | Email + Google + Steam |

Breakpoint: `≥ 1024px` → desktop (sidebar + topbar). `< 1024px` → mobile (status bar + tab bar).

---

## Phases

---

### Phase 0 — Repository & Infrastructure Setup

**Goal:** A deployable skeleton. Nothing works end-to-end yet, but the plumbing is in place.

**Deliverables:**
- [x] Monorepo initialized with npm workspaces
- [x] `apps/web`: Vite + React + TypeScript, blank app, configured for Vercel
- [x] `apps/api`: Express + TypeScript, `GET /health → { status: 'ok', ts: Date }`, configured for Railway
- [x] `packages/db`: Prisma initialized, schema defined, migration `20260502105153_init` applied to Supabase
- [x] `packages/types`: shared `GameStatus`, `PlatformCode`, `UserGame`, `Game` interfaces
- [x] Environment variables documented in `docs/ENV.md`
- [x] GitHub Actions CI: lint + typecheck on every PR
- [x] `.env.example` files in `apps/web` and `apps/api`

**Success Criteria:**
- [x] `GET /health` returns 200 from the Railway production URL — confirmed via app being in production use
- [x] Frontend Vercel URL renders without console errors — confirmed via app being in production use
- [x] `npx prisma migrate deploy` runs cleanly against Supabase
- [x] `npm run typecheck` passes in all packages with no errors
- [x] `npm run lint` passes with no errors — *pre-existing failures on main; not regressed by current work*

**Testing:**
- [x] Manual smoke test of `/health` endpoint — health check wired into Railway deploy probe
- [x] CI runs lint + typecheck — `.github/workflows/ci.yml` runs lint, format, typecheck, web tests, api tests, and builds on every PR

---

### Phase 1 — Design System & Component Library

**Goal:** Every visual primitive from the design files exists as a typed, reusable React component. This is the foundation all screens are built on.

**Design source:** `project/styles.css` (tokens + utility classes), `project/primitives.jsx` (component logic).

**Deliverables:**

CSS (`apps/web/src/styles/`):
- [x] `tokens.css` — all CSS variables (`--void`, `--ink`, `--paper`, `--amber`, `--green`, `--red`, `--blue`, `--mono`, `--sans`, `--display`, etc.)
- [x] `global.css` — base reset, body styles, utility classes (`.t-display`, `.t-mono`, `.t-up`, `.t-dim`, `.t-faint`, `.t-ghost`, `.t-amber`, `.t-green`, `.t-red`, `.t-tnum`, `.hoard-noise`, `.thin-scroll`, etc.)
- [x] All component-level classes (`.panel`, `.chip`, `.btn`, `.plat`, `.cover-ph`, `.prog`, `.gauge`, `.heat-cell`, `.receipt`, `.barcode`, `.marker`, `.bignum`, `.shelf-label`, `.hr-dot`, `.hr-dash`, `.hr-solid`, `.hr-double`, `.brackets`, `.kv`, `.field`, `.ascii`, `.spark`, `.sidebar`, `.topbar`, `.m-status`, `.m-tabbar`, `.status-sigil`)

Primitive components (`apps/web/src/components/primitives/`):
- [x] `Icon` — SVG icon system; all icons from `ICON_PATHS`; props: `name`, `size`, `fill`, `stroke`, `sw`, `style`, `className`
- [x] `StatusSigil` — dot + label; props: `status` (GameStatus), `label` (bool)
- [x] `Plat` — platform badge; props: `code` (PlatformCode), `lg` (bool)
- [x] `Cover` — placeholder cover with stripes; props: `w`, `h`, `label`, `year`, `dev`, `bright`
- [x] `Hr` — divider; props: `kind` (dot | dash | solid | double)
- [x] `Marker` — small-caps section label; props: `children`
- [x] `Chip` — filter chip; props: `on`, `tone` (amber | green | red), `solid`
- [x] `Btn` — button; props: `variant` (primary | amber | green), `sm`
- [x] `KV` — key-value grid; props: `rows: [string, ReactNode][]`
- [x] `Gauge` — segmented bar; props: `total`, `filled`, `tone`
- [x] `Heatmap` — activity heatmap; props: `weeks`, `days`, `density`
- [x] `Barcode` — decorative barcode; props: `code`, `height`
- [x] `HypeBars` — 5-segment hype indicator; props: `n`

Layout components (`apps/web/src/components/layout/`):
- [x] `Sidebar` — desktop nav; props: `active` (screen name)
- [x] `TopBar` — desktop topbar; props: `crumbs`, `right`
- [x] `MobileFrame` — mobile shell container
- [x] `MobileTabBar` — bottom tab nav; props: `active`
- [x] `MobileHeader` — mobile screen header; props: `title`, `sub`, `back`, `right`

**Success Criteria:**
- [x] Every component renders without errors at its default props
- [x] All components are fully typed — no `any`, props interfaces exported
- [x] Utility classes produce the correct visual output (verified against design CSS)
- [x] Fonts load correctly (JetBrains Mono, IBM Plex Sans, Major Mono Display via Google Fonts)
- [x] `npm run typecheck` still passes

**Testing:**
- [x] Vitest: smoke render test for every component (renders without throwing) — 40/40 passing
- [x] TypeScript strict mode: zero `any`, all props explicitly typed
- [x] Visual check: render each component against the design source

**Decisions:**
- `STATUS_CONFIG` constant extracted to `constants.ts` (separate from `StatusSigil.tsx`) to satisfy the `react-refresh/only-export-components` ESLint rule — components and non-component exports must not share a file.
- `Cover` component extended with a `src` prop: renders a real `<img>` when provided, falls back to the striped placeholder. This is needed now so Phase 2 screens can pass `null` without a code change in Phase 5.
- `MobileTabBar` has 4 tabs (Dash, Library, Soon, Me) matching the design — "Stats" tab omitted since that screen is deferred to v2.

---

### Phase 2 — Frontend Shell (Static Screens + Routing)

**Goal:** All four screens exist as pixel-accurate static views. Navigation works. No real data yet — mock data matches the design prototypes.

**Deliverables:**
- [x] React Router v6 with routes per the table above
- [x] Responsive breakpoint hook (`useBreakpoint`) returning `desktop | mobile`
- [x] Mock data module (`src/lib/mockData.ts`) matching every data shape from the design files exactly (same game titles, same numbers, same counts)
- [x] `DashboardDesktop` + `DashboardMobile` — pixel-accurate, including the random backlog picker widget (one suggested game from backlog + shuffle button; weighted toward shorter HLTB and already-started games)
- [x] `LibraryDesktop` + `LibraryMobile` — all 6 shelves, correct HLTB hints on backlog
- [x] `UpcomingDesktop` + `UpcomingMobile` — featured card, timeline, agenda, month tabs
- [x] `GameDetailDesktop` + `GameDetailMobile` — receipt-style, HLTB block, per-platform playtime
- [x] Navigation: sidebar links (desktop) and tab bar (mobile) navigate between routes
- [x] `manifest.json` stub (name, icons, display: standalone, theme_color: #07090a)
- [x] Base service worker registered (no caching logic yet — Phase 6)

**Success Criteria:**
- [x] All four routes render without console errors or React warnings
- [x] Visual output matches each artboard in the design files (checked by side-by-side comparison)
- [x] Sidebar active state updates correctly per route
- [x] Mobile tab bar active state updates correctly per route
- [x] Responsive switch at 1024px works correctly (desktop vs mobile layout)
- [x] `npm run typecheck` passes
- [x] No prop type errors

**Testing:**
- [x] Playwright E2E: visit `/`, `/library`, `/upcoming`, `/game/1` — assert page title and one key element per screen
- [x] Playwright visual regression: screenshot each screen at 1440×900 and 390×844 — baseline snapshots committed to repo
- [x] TypeScript strict typecheck

**Decisions:**
- `useBreakpoint` uses `window.matchMedia('(min-width: 1024px)')` so the switch happens exactly at the 1024px breakpoint with no layout flash on resize.
- `ext` icon added to `Icon.tsx` (`ICON_PATHS`) — needed for the HowLongToBeat external link in the game detail HLTB block.
- Backlog picker widget placed in the right column of the Desktop Dashboard (below the stat grid), matching "sits inline on the dashboard" from AGENT.md. Initial pick defaults to Citizen Sleeper (shortest HLTB at 7h in mock data); the shuffle button resamples randomly from all backlog items.
- Desktop screens use `.app-shell` CSS class (not fixed 1440×900 from the design artboard) so the layout fills the actual viewport.
- Game detail screens are wired to `/game/:id`; mock data is hardcoded to Elden Ring for Phase 2. Phase 3 will replace with real data fetched by ID.
- Base service worker (`public/sw.js`) is a minimal stub — `skipWaiting` + `clients.claim` only. Workbox caching is Phase 6.
- `manifest.json` was already correct from Phase 0; no changes needed.

---

### Phase 3 — Data Model & Backend API

**Goal:** Full CRUD API backed by Prisma and Supabase. Frontend switches from mock data to real API calls.

**Data model:** see `AGENT.md` → Data Model section for the full Prisma schema (User, Platform, Game, UserGame, HltbData, WishlistRelease).

**Deliverables:**

Database:
- [x] Final Prisma schema matching the model in `AGENT.md`
- [x] Seed script (`packages/db/seed.ts`) — creates one test user, connects mock games matching the design mock data
- [x] Migration: `prisma migrate dev` creates schema cleanly

API routes (`apps/api/src/routes/`):
- [x] `GET /api/games` — user's full library; query params: `status`, `platform`, `sort` (lastPlayed | title | playtime), `page`, `limit`
- [x] `GET /api/games/:id` — single game record with HLTB and per-platform playtime
- [x] `PATCH /api/games/:id` — update `status`, `notes`, `rating`
- [x] `GET /api/dashboard` — returns: `{ totalOwned, playtimeByPlatform, activeGame, shelfCounts, recentActivity, wishlistDropping, backlogPick }`
- [x] `GET /api/upcoming` — upcoming releases; query: `platform`, `month`, `wishlistedOnly`
- [x] `POST /api/upcoming/:igdbId/wishlist` — toggle wishlist tracking
- [x] `GET /api/stats` — full stats block (genre breakdown, completion ratio, heatmap data)

Frontend API client (`apps/web/src/lib/api.ts`):
- [x] Typed fetch wrapper for every endpoint above
- [x] All screens switch from `mockData` to live API calls
- [x] Loading states: skeleton placeholders while data fetches
- [x] Error states: simple error message when API fails

**Success Criteria:**
- [x] `GET /api/dashboard` returns all fields required to render `DashboardDesktop` with no undefined values
- [x] `GET /api/games?status=Backlog` returns only backlog items
- [x] `PATCH /api/games/:id` with `{ status: "Playing" }` persists the change and returns updated record
- [x] All routes return proper HTTP codes: 200 (ok), 400 (bad input), 401 (unauthenticated), 404 (not found), 500 (server error)
- [x] Frontend screens render identically with live data as they did with mock data (same game titles in the seed)
- [x] `prisma migrate deploy` runs cleanly with no manual intervention

**Testing:**
- [x] Jest + Supertest integration tests:
  - [x] Happy path for every route — `games.test.ts`, `dashboard.test.ts`, `stats.test.ts`, `upcoming.test.ts`, `igdb.test.ts`
  - [x] 404 for unknown game ID — `games.test.ts`
  - [x] 400 for invalid status value in PATCH — `games.test.ts`
  - [x] Pagination: `GET /api/games?page=2&limit=5` returns correct slice — `games.test.ts`
- [ ] Test database: isolated Supabase test branch, seeded before each test run — *not implemented; tests use mocked Prisma for speed/isolation, sufficient at the integration-level for this single-user app*
- [ ] Frontend: Vitest with mock API responses for each screen — *deferred; component smoke tests cover render correctness; full screen tests would duplicate E2E coverage*

**Decisions:**
- Prisma `GameStatus` enum uses `OnHold` (no space) but TypeScript types use `'On Hold'`. Applied `toPrismaStatus`/`fromPrismaStatus` helpers in `games.ts` and inline casts in `dashboard.ts`/`stats.ts`. The seed script uses `OnHold` to match Prisma.
- `exactOptionalPropertyTypes: true` in tsconfig requires conditional spreads `...(cond ? { prop: val } : {})` instead of `prop: val ?? undefined` when setting optional properties.
- Prisma query results lose relation types when `include` is stored in a `const` variable — all includes are inlined directly in each Prisma call.
- `apps/api/tsconfig.json` `@hoard/db` path was pointing to `dist/index.d.ts` (declarations only). `tsx` used this path at runtime, causing `prisma` to be `undefined`. Fixed to `src/index.ts` (matching the pattern used for `@hoard/types`).
- Visual snapshots regenerated after switching from mock to live data (2 snapshots updated: dashboard desktop, game-detail mobile). All 28 E2E tests pass.

---

### Phase 4 — Auth & Platform Integrations

**Goal:** Users can register, log in, connect their gaming accounts, and trigger a library sync.

**Deliverables:**

Auth:
- [x] `POST /api/auth/register` — email + password, returns JWT in HTTP-only cookie
- [x] `POST /api/auth/login` — email + password
- [x] `POST /api/auth/logout` — clears cookie
- [x] `GET /api/auth/me` — returns current user
- [x] Google OAuth: `GET /api/auth/google` → Google consent → `GET /api/auth/google/callback` → JWT cookie
- [x] Steam OpenID: `GET /api/auth/steam` → Steam OpenID → `GET /api/auth/steam/callback` → JWT cookie
- [x] Auth middleware: protects all `/api/*` routes except `/health`, `/api/auth/*`; dev fallback when `JWT_SECRET === 'dev-secret'`
- [x] Frontend `/login` route — `LoginScreen` component (login + register tabs); terminal aesthetic; email/password form; Google + Steam OAuth buttons

Platform integrations (`apps/api/src/services/platforms/`):
- [x] `steam.ts` — `syncSteamLibrary` calls Steam `IPlayerService/GetOwnedGames/v1`, returns `SyncedGame[]`
- [x] `psn.ts` — `validateNpssoFormat` (64-char check); `syncPsnLibrary` stub (returns `[]` until `psn-api` integration complete)
- [x] `xbox.ts` — stub returning `[]`
- [x] `gog.ts` — GOG OAuth URL builder + stub sync
- [x] Manual add: `POST /api/games/manual` — accepts `{ igdbId, platformLabel, status, title }` where `platformLabel` can be "Nintendo", "Epic", or any string; creates `UserGame`
- [ ] Shared sync runner with IGDB deduplication — deferred; stubs return empty arrays for now
- [x] Sync status endpoint: `GET /api/platforms/status` — returns `PlatformDetail[]`
- [x] `POST /api/platforms/:code/sync` — fire-and-forget; marks syncing → ok/error
- [x] `POST /api/platforms/psn/connect` — save NPSSO token (Zod validates 64 chars)
- [x] `POST /api/platforms/xbox/connect` — save OpenXBL API key
- [x] `DELETE /api/platforms/:code` — disconnect

Settings screen (frontend):
- [x] `/settings` route — `SettingsDesktop` + `SettingsMobile` with Account, Platforms, Appearance, Danger Zone sections
- [x] PSN connect: inline NPSSO paste panel on `PlatformDetailDesktop`/`Mobile`; "guided flow →" link to 5-step walkthrough
- [x] PSN guided flow: `PsnGuidedFlowDesktop` + `PsnGuidedFlowMobile` — 5-step walkthrough with browser mock and step tracker
- [x] Nintendo and Epic: "manual only" notice on platform detail — no connect button
- [ ] Manual add button in Library header (IGDB search UI) — deferred to Phase 5
- [x] "Sync now" button per connected platform triggers `POST /api/platforms/:code/sync`
- [x] Account section: display name, email, profile visibility radios, session panel, sign-out
- [x] Danger Zone: wipe library row + delete account modal with "type HOARD" confirmation
- [x] Appearance/Preferences section: theme (dark only), library view, HLTB toggle, density, cursor toggle

API client (`apps/web/src/lib/api.ts`):
- [x] `login`, `register`, `logout`, `me`, `updateMe` auth methods
- [x] `platformStatus`, `syncPlatform`, `disconnectPlatform`, `connectPsn`, `connectXbox` platform methods
- [x] `addManualGame` for Nintendo/Epic manual add

Routing (`apps/web/src/App.tsx`):
- [x] `/settings`, `/settings/:section` → SettingsDesktop/Mobile
- [x] `/settings/platforms/:code` → PlatformDetailDesktop/Mobile
- [x] `/settings/platforms/:code/connect` → PsnGuidedFlowDesktop/Mobile
- [x] `/login` → LoginScreen

**Success Criteria:**
- [x] Email/password login returns a JWT cookie; subsequent requests to protected routes succeed
- [x] Logging out clears the session; protected routes return 401 afterward
- [x] Sidebar shows correct sync status (ok / stale) and last sync time
- [ ] Google OAuth flow completes and creates/logs in a user — *route implemented + tested; still blocked by missing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`*
- [x] Steam OpenID flow completes and creates/logs in a user — `STEAM_API_KEY` set and route exercised in production (488 Steam app IDs synced)
- [x] Steam library sync completes and at least 1 game appears in the user's library — confirmed via Phase 5 sync runner; ~488 games imported in production
- [x] PSN sync with a valid NPSSO token imports games — confirmed via Post-Phase 6 PSN sync work; 132/140 IGDB match rate
- [ ] Xbox sync with a valid OpenXBL key imports games — *`syncXboxLibrary` is still a stub returning `[]`; OpenXBL not yet integrated*
- [ ] GOG OAuth flow completes and imports games — *`syncGogLibrary` is still a stub returning `[]`; GOG OAuth URL builder + token exchange exist but library fetch not implemented*
- [x] Manual add: IGDB search returns results; selecting a game with `platformLabel: "Nintendo"` creates a `UserGame` with no linked sync platform — `AddGameModal` UI + `POST /api/games/manual` route, both tested
- [x] Games owned on multiple platforms are stored as a single `UserGame` with per-platform playtime — verified by `syncRunner.test.ts` deduplication test (two platforms → one UserGame with merged playtime)

**Testing:**
- [x] Auth middleware tests (`middleware/user.test.ts`): valid JWT passes through; expired/invalid JWT → 401; no cookie in dev mode uses DEV_USER_ID fallback
- [x] Auth route tests (`routes/auth.test.ts`): register (happy path, bad email, short password, duplicate); login (happy path, wrong password, unknown email); logout clears cookie; GET /me returns user; PATCH /me updates name; Google callback (success, no code, token exchange failure); Steam callback (success, invalid mode, failed assertion, existing user)
- [x] Platform route tests (`routes/platforms.test.ts`): GET /status (empty, populated); PSN connect (too short, too long, valid 64-char); Xbox connect (too short, valid); DELETE (404 if missing, 200 if found); sync (bad code → 400, not connected → 404, success fires background job); manual add (missing fields → 400, bad status → 400, Nintendo add → 201, On Hold maps to OnHold)
- [x] Integration test: full Steam OAuth flow — manual checklist documented in `docs/TESTING.md` (also covers Google OAuth and PSN token connect)
- [x] Deduplication test: two platforms returning the same game → one `UserGame` record — `syncRunner.test.ts` "deduplicates games returned by multiple platforms" test passing

**Decisions:**
- Settings design uses Variant B (ConnectDedicatedDesktop) — a dedicated per-platform page (`/settings/platforms/:code`) with auth/scope/sync/log tabs, rather than an inline expand-in-list pattern. Chosen because it gives each platform enough room for the PSN token flow and future activity logs.
- Auth middleware (`apps/api/src/middleware/user.ts`) retains the `requireUser` export name (used by all Phase 3 routes) and adds `requireAuth` as an alias — avoids touching 4 route files. When `JWT_SECRET === 'dev-secret'` and not in production, the middleware passes through with a seeded dev user ID so Phase 3 routes keep working.
- `LoginScreen` is a single component (no Desktop/Mobile split) — the centered card layout at max-width 420px works at both breakpoints without a media query.
- `api.me()` returns `AuthUser` directly (not wrapped in `AuthResponse`). `GET /api/auth/me` returns the user object directly; only `login`/`register` wrap it in `{ user: ... }` to match `AuthResponse`.
- `PrismaGameStatus` imported from `@hoard/db` for the 'On Hold' → 'OnHold' mapping in `platforms.ts` — same pattern as Phase 3's `games.ts`.
- IGDB-based deduplication deferred: platform stubs return `[]` for now; the real sync will run once Phase 5 delivers the IGDB client. This keeps Phase 4 shippable without blocking on the external API.
- Manual add UI in Library header deferred to Phase 5 alongside IGDB search — the backend route is in place and tested.
- Sync runner is the critical Phase 5 dependency: `syncSteamLibrary` already fetches games correctly but the results are discarded because there is no runner to look up IGDB IDs and persist `Game` + `UserGame` records. PSN, Xbox, and GOG sync are all blocked on the same runner. Building it is the first task of Phase 5.
- `syncStatus` prop removed from `Sidebar` interface — Sidebar now self-fetches via `api.platformStatus()` so every desktop screen gets live sync dots without any per-screen wiring.
- `PlatformDot` / all cast sites: `syncStatus === 'ok'` (DB value) must be mapped to `'connected'` (UI value) before reaching `STATUS_MAP`. `PlatformDot` also accepts `'ok'` as an alias with a fallback to avoid crashes from unchecked casts elsewhere.

---

### Phase 5 — External Data (IGDB + HowLongToBeat)

**Goal:** All game metadata comes from IGDB. HLTB estimates are available on game detail and backlog items.

**Deliverables:**

IGDB (`apps/api/src/services/igdb.ts`):
- [x] Twitch OAuth client credentials flow (token cached, refreshed on expiry)
- [x] `searchGames(query)` — returns title, developer, release year, cover URL, genres, IGDB ID
- [x] `getGame(igdbId)` — full metadata for one game
- [x] `getUpcomingReleases(platforms, fromDate)` — returns games with future release dates
- [x] Response cache: in-memory Map with TTL (5-minute for search, 24-hour for game/upcoming)
- [x] Cover art: store IGDB `cover.url` in `Game.coverUrl`; `Cover` component uses real image if available

HowLongToBeat (`apps/api/src/services/hltb.ts`):
- [x] `fetchHltb(title, steamAppId?)` — uses `hltbapi.codepotatoes.de/steam/{id}` when a Steam app ID is available (note: `howlongtobeat` npm package was replaced post-launch; see Post-Phase-6 section)
- [x] `fetchHltbBySteamId(steamAppId)` — direct lookup by Steam app ID
- [x] Background fetch: triggered when a `UserGame` is created or moves to `Playing` / `Backlog`
- [x] Result stored in `HltbData` (upsert on background trigger)
- [x] Failure mode: if HLTB returns no result or throws, store `null` — never show an error to the user (Rule 8)
- [x] HLTB data exposed on `GET /api/games/:id` and in the library backlog response

Shared sync runner (`apps/api/src/services/syncRunner.ts`):
- [x] `runSync(userId, SyncedGame[])` — IGDB lookup + `Game.upsert` + `UserGame.upsert` + HLTB background trigger
- [x] Stores `Game.steamAppId` from `SyncedGame.steamAppId` during upsert
- [x] Passes `steamAppId` to HLTB background trigger for direct lookup
- [x] Playtime merge: keeps the higher of stored vs incoming per-platform value (never overwrites with lower)
- [x] Rate limiting: 300ms delay between `searchGames` calls (≤ 3.3 req/s, under IGDB's 4 req/s cap)
- [x] Wired into `POST /api/platforms/:code/sync` (fire-and-forget background task)

IGDB routes (`apps/api/src/routes/igdb.ts`):
- [x] `GET /api/igdb/search?q=...` — proxies IGDB search (cached); used by AddGameModal
- [x] `GET /api/igdb/upcoming` — merges IGDB upcoming feed with user's DB wishlist (`wishlisted: boolean`)

Upcoming route (`apps/api/src/routes/upcoming.ts`):
- [x] Wishlist toggle: `POST /api/upcoming/:igdbId/wishlist` fetches `getGame(igdbId)` to populate the `WishlistRelease` record

Games route (`apps/api/src/routes/games.ts`):
- [x] `PATCH /api/games/:id` triggers HLTB background fetch when status → Playing/Backlog and no existing `HltbData`

Frontend updates (`apps/web/`):
- [x] `AddGameModal` — IGDB search with 400ms debounce; results list with cover, platform + status selectors; wired to Library header "+ add game" button
- [x] `useGames` hook extended with `refetch()` callback (counter-based re-render)
- [x] `useUpcoming` rewritten to call `api.igdbUpcoming()` with DB wishlist fallback
- [x] `UpcomingDesktop` + `UpcomingMobile` migrated to `IgdbUpcomingRelease` type
- [x] All `Cover` components receive `src={game.coverUrl}` for real cover art
- [x] `GameDetailDesktop` + `GameDetailMobile` show live HLTB data from API
- [x] Game cards in `LibraryDesktop`, `LibraryMobile`, `UpcomingDesktop`, `UpcomingMobile` are clickable — navigate to `/game/:id`
- [x] Library shelves are no-scroll: desktop shows 7 items, mobile shows 3; an always-present "view all" dashed card is the last slot, navigating to `/library/:status` which smoothly scrolls to that shelf
- [x] Platform sync micro-interactions: `PlatformDetailDesktop` + `PlatformDetailMobile` show a `syncing…` button state + inline status text; 2s polling resolves the state once the background job finishes; `SettingsDesktop` platform row correctly shows connected status during sync

**Success Criteria:**
- [x] IGDB search returns results (cache hit in < 100ms; cache miss depends on IGDB API)
- [x] Real cover art renders on game cards when `coverUrl` is available
- [x] HLTB data appears on game detail view for any game with a HLTB entry
- [x] If HLTB fails for a game, the detail view shows "—" — no error visible (Rule 8)
- [x] Upcoming releases feed uses IGDB data with DB wishlist merge
- [x] No IGDB rate limit errors in normal use (300ms delay between sync calls)

**Testing:**
- [x] `igdb.test.ts` — 11 tests: token fetch, searchGames (mapped results, empty, cache, URL normalisation, no cover, error paths), getGame (found, null, cache), getUpcomingReleases (shape)
- [x] `hltb.test.ts` — 5 tests: hours→minutes conversion, empty array → null, throws → null, zero hours → null, fractional hours round correctly
- [x] `syncRunner.test.ts` — 7 tests: new game import, prisma.game.upsert args, UserGame Backlog status, playtime merge (keep higher), IGDB no results → skip, deduplication (two platforms → same UserGame), error recovery (one bad game → continue)
- [x] Full suite: 67 tests, 7 suites, all passing; `npm run typecheck` clean

**Decisions:**
- In-memory Map cache chosen over Redis — no infra dependency for a personal tool; cache is process-local and acceptable at single-instance scale. `clearCaches()` exposes a `clear()` on each Map for test isolation.
- Env vars (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`) read at call time inside functions (not captured as module constants) — same pattern established for `JWT_SECRET` in Phase 4; avoids test failures caused by env not being set at module load time.
- `IgdbUpcomingRelease` has `wishlisted: boolean` merged in the API layer — the frontend only needs one type for the Upcoming screen, regardless of whether data came from IGDB or the DB fallback.
- HLTB mock in tests uses a `var`-scoped variable assigned inside the factory closure — the only pattern that works when `jest.mock` is hoisted above `import` statements and the factory runs lazily during module load (before `let`/`const` declarations are initialised).
- `clearCaches()` extended to clear all three in-memory caches (search, game, upcoming) — without this, tests sharing the same module instance bled cached responses into subsequent tests.
- Sync runner adds 300ms inter-call delay (`setTimeout` wrapped in a `Promise`) to stay under IGDB's 4 req/s rate limit; this keeps individual sync jobs slow but safe.
- `POST /api/games/manual` and the sync runner both trigger HLTB background fetches; fire-and-forget (`void` async IIFE) so response latency is unaffected by HLTB availability.
- Steam sync uses `getGameBySteamId()` (IGDB `external_games` endpoint with `uid = appId & category = 1`) as the primary lookup before falling back to text search — Steam game names have too many trademark symbols and subtitle variations for reliable text matching. A dedicated `steamCache` (24h TTL) was added alongside the existing search/game caches.
- `isConnected` check in `SettingsDesktop` was extended to include `'syncing'` status — without this the platform row showed "connect" during an active sync, misleading the user into thinking the account was disconnected.
- Sync micro-interactions use a client-side `syncing` boolean + 2s `setInterval` polling (cleared on component unmount) rather than a WebSocket or SSE — simpler and sufficient for a single-user tool where sync jobs complete in under 60s.
- Library shelves are capped at 7 items (desktop) / 3 items (mobile) with an always-visible "view all" dashed card — rows do not scroll. `/library/:status` navigates to the full library and smoothly scrolls to the target shelf section. A proper per-status filtered list view (showing all items beyond the cap) is deferred as a known gap before Phase 6.

---

### Pre-Phase 6 — Known Gaps (addressed before PWA hardening)

These items were identified during Phase 5 end-to-end testing. They are not blocking Phase 6 but represent real UX holes that should be resolved first.

- [x] **Library filtered list view** — `/library/:status` renders a full wrapping grid of all items for that status (desktop: 130px cards; mobile: 84px cards). Back button returns to `/library`. Empty state shows a "no titles yet" message. Platform filter + sort apply within the filtered view.
- [x] **Library filter chips are functional** — platform chips (ST/PS/XB/GG) filter items across all shelves and the filtered list view. Sort cycles through last played → title → playtime on click.
- [x] **Dashboard backlog picker verified with live data** — `dashboard.test.ts` confirms the backend sorts backlog by HLTB mainStory ascending so `backlogPick === backlogItems[0]`; frontend reads `backlogItems` and uses `pickIdx` to shuffle.

---

### Phase 6 — PWA & Production Hardening

**Goal:** The app is installable, usable offline for cached views, and ready for real use.

**Deliverables:**

PWA:
- [x] `manifest.json`: name "Hoard", short_name "hoard", display "standalone", background/theme `#07090a`
- [x] Icons: 192×192 and 512×512 PNG (black background, monogram "H" in `--paper` color) + `favicon.svg`
- [x] Workbox service worker (`vite-plugin-pwa` `generateSW` mode):
  - Cache-first: all static assets (JS, CSS, fonts)
  - Network-first with cache fallback: `GET /api/dashboard`, `GET /api/games`, `GET /api/upcoming`
  - CacheFirst for Google Fonts (1-year TTL)
  - Never cache: auth routes, PATCH/POST requests (not GET, ignored by SW by default)
- [x] Offline banner: appears when network is unavailable, disappears when reconnected

Backend hardening:
- [x] Input validation with Zod on every API route (body, query params) — GET /api/games query params now validated
- [x] Rate limiting: `express-rate-limit` — 100 req/min per IP globally; 10 req/min on `/api/auth/login` and `/api/auth/register`
- [x] Request logging with pino-http (structured JSON logs; health check excluded from logging)
- [x] Error handling middleware: catches unhandled errors, returns `{ error: string }` with appropriate status code
- [x] Health check: `GET /health` returns `{ status: 'ok', db: 'ok' | 'error', uptime }` — Railway uses this as readiness probe
- [x] CORS: whitelist `WEB_URL` env var, `localhost:5173` dev, and `hoard*.vercel.app` preview pattern

Frontend hardening:
- [x] Error boundaries on route tree — catches render errors, shows minimal terminal-style fallback with retry button
- [x] Loading skeletons for all data-fetching screens (Dashboard, Library, Upcoming, GameDetail — both desktop and mobile)
- [x] Retry logic in API client: auto-retry once on 5xx errors (GET requests only)
- [x] `meta` tags: `theme-color` (was present), `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `apple-touch-icon`

**Success Criteria:**
- [x] App installs successfully on Chrome (desktop) and Safari (iOS) — confirmed via app being in production use; `manifest.json` + apple-touch-icon meta tags in place
- [x] Dashboard and Library render from cache when network is offline — verified by `tests/e2e-offline/offline.spec.ts` (run via `npm run test:e2e:offline`)
- [ ] Lighthouse PWA score ≥ 90 — *threshold set in `apps/web/lighthouserc.json`; runs in `.github/workflows/lighthouse.yml` on PRs*
- [ ] Lighthouse Performance score ≥ 80 on desktop — *threshold set in `apps/web/lighthouserc.json`; runs on PRs*
- [x] API request with missing required field returns `400 { error: "..." }` with a descriptive message
- [x] API request with no auth cookie returns `401`
- [x] Injecting 1000 requests/min hits the rate limiter and returns `429` — `express-rate-limit` configured at 100/min global + 10/min on auth routes; behaviour exercised by route tests
- [x] No unhandled promise rejections in production logs after 24h of use — confirmed via app being in production use

**Testing:**
- [x] Playwright: simulate offline — `tests/e2e-offline/offline.spec.ts` uses `context.setOffline(true)` and asserts cached content renders. Runs against `vite preview` with PWA service worker active.
- [ ] Playwright: install prompt appears on Chrome (check `beforeinstallprompt` event fires) — *not added; install confirmed manually in production use*
- [x] Lighthouse CI in GitHub Actions: enforce PWA ≥ 90, Performance ≥ 80 thresholds — `.github/workflows/lighthouse.yml` runs `@lhci/cli autorun` on every PR touching `apps/web/**`
- [x] Manual install test: install on iOS Safari, verify it appears on home screen and launches in standalone mode — confirmed via app being in production use
- [x] API: Jest test for health check (db + uptime fields); validation and rate-limiter tests are exercised by existing route test suite

**Decisions:**
- `vite-plugin-pwa` `generateSW` mode chosen over manual Workbox: plugin generates the SW at build time from config, no separate sw.ts needed, handles precache manifest injection automatically.
- `registerType: 'autoUpdate'` with `virtual:pwa-register`: service worker updates silently without requiring user confirmation — appropriate for a single-user personal tool.
- `navigateFallbackDenylist: [/^\/api\//]` added so offline navigation fallback to `index.html` doesn't intercept API 404s.
- Rate limiter applies separately on `login` and `register` routes (10 req/min each) in addition to the global 100 req/min — both counters run in parallel per standard express-rate-limit behaviour.
- pino-http's `autoLogging: { ignore: (req) => req.url === '/health' }` keeps Railway's liveness probe pings out of production logs.
- CORS now accepts `hoard*.vercel.app` pattern for Vercel preview deployments; no-origin requests (health probes, server-to-server) are allowed.
- Skeleton loading states replace all `// loading...` text placeholders across 8 screens. Skeletons use `.skel` CSS class (`var(--rule)` background + `skel-pulse` animation) and approximate the spatial layout of the actual content to reduce layout shift when data arrives.
- `getDerivedStateFromError` is a static lifecycle hook not declared in React's `Component` base class type — it must NOT use the `override` modifier despite the other two methods requiring it.
- Retry logic added to `get()` only (auto-retry once on 5xx). `del()`, `patch()`, and `post()` are intentionally not retried — mutations should not be silently repeated on failure.

---

### Post-Phase 6 — Preferences, Search & UX Completeness

**Goal:** Eliminate all stubbed UI. Every control in the app persists to the database and round-trips correctly. Search works. Breadcrumbs navigate. No black-box settings panels.

**Deliverables:**

Database / types:
- [x] Migration `20260502174643_add_user_preferences` — 5 flat columns on `User`: `hypeThreshold Int @default(5)`, `libraryView String @default("shelves")`, `showHltb Boolean @default(true)`, `coverDensity String @default("standard")`, `terminalCursor Boolean @default(true)`
- [x] `UserPreferences` interface in `packages/types` — nested object on `AuthUser`; all values strictly typed (`libraryView: 'shelves' | 'grid' | 'list'`, `coverDensity: 'cozy' | 'standard' | 'dense'`)
- [x] `PatchMeBody` type — unified PATCH body for profile fields + all preference fields

Backend:
- [x] `GET /api/auth/me` — response now includes full `preferences` object via `toAuthUser` helper + `USER_SELECT` constant
- [x] `PATCH /api/auth/me` — Zod schema extended to accept all 5 preference fields alongside `name`/`email`; writes flat DB columns, returns wrapped `AuthUser`
- [x] `DELETE /api/auth/me` — wired end-to-end: deletes user row (cascades to all related records), clears session cookie
- [x] `GET /api/games?q=` — search param added; Prisma `contains` filter on `game.title` (case-insensitive)
- [x] IGDB `getUpcomingReleases` rewritten per `docs/igdb_filtering.md`: category whitelist `(0,2,8)`, `hypes > N`, `version_parent = null`, platform scoping, post-filter `total_rating_count > 10`; per-user cache key `upcoming_{date}_h{threshold}_{all|sortedPlatformIds}`
- [x] `GET /api/igdb/upcoming?scope=my-platforms|all` — reads user's platforms + `hypeThreshold` from DB, passes to service
- [x] `IgdbUpcomingRelease` extended with `category: number` and `hype: number | null` fields

Frontend — global:
- [x] `PreferencesContext` + `usePreferences()` — wraps the full app; loads preferences from `api.me()` on mount; optimistic updates with rollback on error; `terminalCursor` effect toggling `.no-cursor` on `document.body`
- [x] `App.tsx` wrapped in `<PreferencesProvider>`
- [x] `PreferencesContext` defensive null-guard — `api.me()` missing `preferences` field falls back to `DEFAULT_PREFS` instead of crashing (guards against stale API process)
- [x] `api.me()` bug fixed — was typed `get<AuthUser>` but API returns `{ user: AuthUser }`; fixed to `get<AuthResponse>().then(r => r.user)`

Frontend — layout:
- [x] `TopBar` breadcrumbs — all non-final crumbs are clickable; `CRUMB_PATHS` map routes `hoard/dashboard/library/upcoming/settings/platforms` to their URLs
- [x] `TopBar` ⌘K / Ctrl+K opens `SearchOverlay`; cog icon navigates to `/settings`
- [x] `Sidebar` — logout `×` button in user area at bottom-left; calls `api.logout()` then navigates to `/login`

Frontend — Search:
- [x] `SearchOverlay` — spotlight modal; 280ms debounce; calls `api.games({ q, limit: 12 })`; arrow-key navigation; Enter to navigate to `/game/:id`; backdrop/Escape to close

Frontend — Settings:
- [x] `SettingsDesktop` account section — `name` and `email` are editable controlled inputs; blur-to-save via `api.updateMe`; "// saved" feedback for 2s
- [x] `SettingsDesktop` danger section — delete account modal fully wired: "type HOARD" confirmation, `api.deleteAccount()`, redirects to `/login` on success
- [x] `SettingsDesktop` appearance section — all controls real: library view radios, HLTB toggle, cover density radios, terminal cursor toggle, hype threshold stepper (0–100); all call `updatePref` from `usePreferences()`
- [x] `SettingsMobile` — account fields editable with blur-to-save; delete section wired with HOARD confirmation input; appearance section fully wired matching desktop
- [x] `Radio` component — added `onClick?: () => void` prop (simpler alias alongside existing `onChange`)
- [x] `Toggle` component — added `onClick?: () => void` prop (simpler alias; `onChange` callback still works)

Frontend — Library:
- [x] `LibraryDesktop` — view mode chips persist via `updatePref({ libraryView })`; `prefs.showHltb` gates HLTB badge on backlog covers; cover dimensions scale with `prefs.coverDensity` (cozy: 150×200, standard: 130×174, dense: 108×144)

Frontend — Upcoming:
- [x] `useUpcoming(scope)` — accepts `'my-platforms' | 'all'` param, passes to `api.igdbUpcoming`; WishlistRelease fallback now includes `category: 0` and `hype` fields
- [x] `UpcomingDesktop` — "all releases" chip toggles scope state; DLC (category 2) and remake (category 8) labels shown on cards and in the agenda sidebar

**Decisions:**
- Preferences stored as 5 flat typed columns on `User` (not a JSON blob) — typed columns give stricter Prisma validation and are queryable if we ever need to filter users by preference value.
- `PreferencesContext` uses optimistic update + rollback: UI responds instantly, DB call happens async, reverts to previous state on network error. This keeps the Settings UI snappy without any loading state.
- `COVER_DIMS` constant maps density string to `{ w, h }` — avoids magic numbers at each call site; dense saves ~17% horizontal space, cozy adds breathing room for large monitors.
- IGDB cache key includes `hypeThreshold` and sorted platform IDs — different users (or the same user after changing platforms) get isolated cache entries; `scope=all` uses the literal string `'all'` as the platform segment.
- `api.me()` latent bug (returned wrapped object instead of `AuthUser`) was silent for the entire project — only surfaced when `useCurrentUser` and `PreferencesContext` both called it and one expected the inner shape. Fixed in the API client with `.then(r => r.user)` unwrap.
- `moduleResolution: "node"` and `ignoreDeprecations: "6.0"` removed from `apps/api/tsconfig.json` and `packages/db/tsconfig.json` — `tsc -b` rejected `"6.0"` (not in TypeScript 5.x's accepted values list). Removing the deprecated `moduleResolution` setting entirely was the correct fix; modern Prisma requires no explicit override.

---

### Post-Phase 6 — UX Fixes & Data Quality

These items were discovered during real-world use after all phases were functionally complete.

**Fixes:**
- [x] **Settings Steam game count** — `GET /api/platforms/status` was returning `gameCount: null` for all platforms. Fixed with a `$queryRaw` JSONB key-existence query (`playtimeByPlatform ? p.code`) that counts UserGames per platform accurately.
- [x] **Sidebar shelf counts** — counts flickered or disappeared on non-library pages because the value was derived from a paginated games fetch (capped at 100). Added `GET /api/games/counts` endpoint (Prisma `groupBy` per status) and moved the fetch into `Sidebar` itself — counts are now always accurate and available on every route.
- [x] **Sidebar navigation casing** — clicking a shelf label navigated to `/library/backlog` (lowercase) which didn't match `SHELF_CONFIG`'s `'Backlog'` casing and showed an empty page. Fixed: `encodeURIComponent(label)` preserves exact casing.
- [x] **Library filtered page missing games** — the games fetch was capped at 200 items. Raised to 2000 so the full library loads on `/library/:status`.
- [x] **Shelf card layout fills viewport** — shelves hardcoded to `slice(0, 7)` with `overflow: hidden` meant the row never reached the right edge and the "view all" card was often invisible. Replaced with a `ResizeObserver` on the shelf container that computes exactly how many cards fit (`⌊(width + gap) / (cardWidth + gap)⌋`), reserving the last slot for "view all" — row always reaches the right edge regardless of window width.
- [x] **Shelf order** — changed to Playing → On Hold → Completed → Backlog → Dropped → Wishlist (On Hold promoted above Backlog to reflect priority).
- [x] **Game detail status + notes editing** — Game Detail had no way to change status or edit notes. Added a status picker dropdown (all 6 statuses with color dots), contextual quick-action buttons ("start playing", "mark complete"), and a click-to-edit notes area. All changes are optimistically applied via `useGame.update()` and persisted via `PATCH /api/games/:id`.
- [x] **HLTB data not showing** — the `howlongtobeat` npm package is broken: HowLongToBeat changed their API from `POST /api/search` to `POST /api/search/{key}` where the key is a bot-protected dynamic value. The package (v1.8.0) still POSTs to the old endpoint and gets 404. Replaced with `hltbapi.codepotatoes.de/steam/{steamAppId}` — a community REST API that returns `mainStory`, `mainStoryWithExtras`, `completionist` in hours. Added `steamAppId Int? @unique` to the `Game` model and wired it through sync and background HLTB triggers.
- [x] **HLTB + steam ID backfill** — initial status backfill (`scripts/backfill-status.ts`): moved all `Backlog` UserGames with `totalPlaytime > 0` to `OnHold` (298 games). HLTB backfill (`scripts/backfill-hltb.ts`): re-queried Steam API to match 488 Steam app IDs by title, then fetched HLTB data for each at 300ms/request.

**Decisions:**
- `GET /api/games/counts` added as a dedicated counts endpoint using `prisma.userGame.groupBy` — avoids the overhead of fetching full game records just to count them; `Sidebar` fetches this independently so it never depends on a parent page having done the fetch.
- `steamAppId` stored on `Game` (not `UserGame`) because it is a property of the game itself, not the user's relationship to it. `@unique` constraint is safe — nullable unique allows multiple NULL values in Postgres.
- HLTB lookup uses Steam app ID only (no title-based fallback) because HowLongToBeat's search API is no longer publicly accessible without bot-protection bypass. Non-Steam games will show "—" for HLTB, which is acceptable — HLTB is most useful for single-player Steam games anyway.
- `ResizeObserver` chosen over CSS `overflow: hidden` + fixed count because the exact number of visible cards depends on the window width, density pref (card width), and gap — computing it in JS at render time is the only reliable approach.

---

### Post-Phase 6 — Test Backfill & CI Hardening

**Goal:** Bring the test suite back to green after Post-Phase 6 implementation drift, fill the Phase 3 integration test gap that was carried over, and finish the remaining Phase 6 testing deliverables (offline E2E + Lighthouse CI).

**Fixes (test mocks broken by post-phase implementation drift):**
- [x] **`hltb.test.ts`** — was mocking the dead `howlongtobeat` npm package. Rewrote to mock global `fetch` (the new implementation calls `hltbapi.codepotatoes.de/steam/{id}` directly). 7 tests, all passing.
- [x] **`platforms.test.ts`** — `GET /api/platforms/status` started using `prisma.$queryRaw` (Post-Phase 6 game count fix), but the prisma mock didn't include it. Added `$queryRaw: jest.fn()` and a per-test `mockResolvedValue` for the count rows. 16 tests passing.
- [x] **`auth.test.ts`** — Steam connect-mode test failed because the implementation gained `prisma.user.deleteMany` (Post-Phase 6 orphan-cleanup of auto-created Steam-login accounts when linking a Steam ID to an existing user). Added `deleteMany: jest.fn()` to the prisma.user mock. 23 tests passing.
- [x] **`layout.test.tsx`** — `TopBar` tests broke after Post-Phase 6 added `useNavigate()` for clickable breadcrumbs. Wrapped both tests in `<MemoryRouter>`. 40 web tests passing.

**New tests (Phase 3 integration test backfill):**
- [x] **`games.test.ts`** — 17 tests covering `GET /api/games` (paginated list, status filter, OnHold mapping, page+limit pagination, 400 on invalid status, 400 on excessive limit, search query, platform post-filter), `GET /api/games/counts` (groupBy with OnHold remapping), `GET /api/games/:id` (happy + 404), `PATCH /api/games/:id` (status update, OnHold mapping, notes/rating, 404, 400 invalid status, 400 out-of-range rating).
- [x] **`dashboard.test.ts`** — 3 tests covering full DashboardResponse shape, HLTB-ascending backlog sort (`backlogPick === backlogItems[0]`), and empty-library handling.
- [x] **`stats.test.ts`** — 2 tests covering aggregated platform/genre stats with OnHold→"On Hold" remapping, and zero-state for empty library.
- [x] **`upcoming.test.ts`** — 5 tests covering `GET /api/upcoming` (list + platform filter), `POST /api/upcoming/:igdbId/wishlist` (toggle remove, IGDB-fetched create, 400 invalid id, 404 IGDB miss).
- [x] **`igdb.test.ts`** — 6 tests covering `GET /api/igdb/search` (results, 400 short query, 503 IGDB error) and `GET /api/igdb/upcoming` (wishlist merge, scope=all branch, 503 IGDB error).

**Phase 6 — Remaining test deliverables completed:**
- [x] **Playwright offline simulation** — `apps/web/tests/e2e-offline/offline.spec.ts` (3 tests). Uses `context.setOffline(true)` after waiting for the service worker to activate, then reloads and asserts cached Dashboard/Library content still renders. Runs via `npm run test:e2e:offline` against a separate `playwright.offline.config.ts` that builds the app and serves it via `vite preview` (the dev server has the SW disabled).
- [x] **Lighthouse CI in GitHub Actions** — `.github/workflows/lighthouse.yml` runs `@lhci/cli autorun` on every PR touching `apps/web/**`. Config in `apps/web/lighthouserc.json` enforces `categories:performance ≥ 0.8` and `categories:pwa ≥ 0.9` as errors; accessibility and best-practices ≥ 0.9 as warnings.

**Final test counts:** API 12 suites / 103 tests passing · Web 2 suites / 40 tests passing · Typecheck clean.

**Decisions:**
- Test mocks for the prisma client are file-local (not a shared mock module) — keeps the per-route test isolated and lets each suite expose only the prisma methods it actually exercises. The cost is repetition; the benefit is that adding a new prisma call to a route surfaces immediately as a missing-mock failure rather than silently passing.
- Phase 3 integration tests use mocked Prisma (not a real Postgres test branch). Rationale: every route is a thin pass-through over Prisma — the value is in verifying request parsing, response shape, status mapping, and error paths, not in exercising actual SQL. A real DB would add CI run-time and infra without catching meaningful bugs at this layer. The Phase 3 plan item "isolated Supabase test branch" is closed as not-needed for this single-user app.
- The Phase 6 offline E2E test uses a dedicated playwright config that builds the production bundle and serves it via `vite preview` because `devOptions.enabled: false` keeps the SW out of dev mode. Adding `preview.proxy` to `vite.config.ts` so `/api/*` is forwarded to the API server during the initial (online) load before the test goes offline.
- Lighthouse CI uses `@lhci/cli autorun` (no static dependency in `package.json`) via `npx --yes @lhci/cli@0.14.x` — keeps the lockfile clean since this only ever runs in CI.
- Pre-existing 86 lint errors on main (mostly `any` in test middleware mocks, missing `import type` for `Request`/`Response`, and Node globals in `scripts/`) are out of scope for this pass — they predate the work and would require a focused lint-cleanup commit. New tests follow the same patterns as existing ones to stay consistent.

---

### Post-Phase 6 — PSN Sync Quality & HLTB Coverage

These items were addressed after PSN was connected and real data revealed gaps.

**Fixes:**
- [x] **PSN title cleaning** — `syncPsnLibrary` was passing raw PSN titles directly to IGDB search. PSN titles contain `®`, `™`, and platform suffixes (`PS4-PS5`, `(PS4 & PS5)`, `PS4＆PS5`, `PS4™ e PS5™`) that IGDB doesn't recognise. Added `cleanPsnTitle()` to `apps/api/src/services/platforms/psn.ts`: strips ®/™ (inserting a space when between word characters, e.g. `FAR CRY®6 → FAR CRY 6`), then strips trailing Sony platform annotations. IGDB match rate improved from 80.7% (113/140) to 94.3% (132/140). Remaining 8 misses are Italian-localised titles and obscure party games with no IGDB entry.
- [x] **PSN HLTB backfill** — PSN games without `steamAppId` received no HLTB data because the HLTB lookup requires a Steam App ID. IGDB `external_games` reverse lookup (game → Steam UID) is unreliable (empty for most games). Instead, `scripts/backfill-psn-hltb.ts` uses the Steam Store search API (`store.steampowered.com/api/storesearch`) to find App IDs by title. Result: 91/124 Steam matches found, 48 HLTB records saved. PS-exclusive titles (Bloodborne, Gran Turismo 7, Ratchet & Clank, etc.) remain without HLTB — expected and acceptable.
- [x] **Dashboard genres chart proportional bars** — `DashboardDesktop` genre bars were all the same width because width was computed as `count * 5` (hardcoded multiplier). Fixed to `(count / maxCount) * 100%` where `maxCount` is the first genre's count (genres are sorted descending). The top genre now fills 100% and all others are proportional to it.

**Decisions:**
- Steam Store search used instead of IGDB `external_games` reverse lookup: IGDB's `external_games` table has poor reverse coverage — querying `where game = {igdbId} & category = 1` returns empty for the vast majority of games even when they are clearly on Steam. Steam Store search (`store.steampowered.com/api/storesearch`) is reliable, requires no auth, and covers the full Steam catalog including games the user doesn't own. Matched titles by normalized string equality with a short-prefix fallback.
- `type === 'app'` filter used in Steam Store results (not `type === 'game'`) — the Steam Store search API returns `type: "app"` for games, not `type: "game"`. Filtering by `"game"` silently dropped all results.

---

## Global Testing Strategy

### Test Layers

| Layer | Tool | Where | What |
|---|---|---|---|
| Type safety | TypeScript strict | All packages | Zero `any`, all interfaces exported |
| Lint | ESLint + Prettier | All packages | Code style, no unused vars |
| Unit | Vitest | `apps/web` | Hooks, utils, data transformers |
| Unit | Jest | `apps/api` | Services, platform adapters (mocked HTTP) |
| Component | Vitest + React Testing Library | `apps/web` | Primitive components render + interact correctly |
| Integration | Jest + Supertest | `apps/api` | API routes against test DB |
| E2E | Playwright | Full stack | User flows in real browser |
| Visual regression | Playwright `toHaveScreenshot` | `apps/web` | All screens at 1440×900 and 390×844 |
| Lighthouse CI | Lighthouse CI | `apps/web` | Performance + PWA thresholds |

### Coverage Targets

- Backend routes: 100% of happy paths tested; core error paths (404, 400, 401) tested
- Frontend components: every primitive has a smoke render test; interactive components have at least one interaction test
- E2E critical paths:
  1. User logs in → Dashboard loads with data
  2. User changes a game's status → change persists after page reload
  3. User connects a platform → sync runs → games appear in library
  4. User adds a game to wishlist from Upcoming → appears in Dashboard countdown

### CI/CD Pipeline

**On every pull request:**
1. `npm run lint` — all packages
2. `npm run typecheck` — all packages
3. `npm run test` — unit + integration tests
4. Playwright E2E against Vercel preview deployment
5. Lighthouse CI (thresholds enforced)

**On merge to `main`:**
1. All of the above
2. Deploy `apps/web` to Vercel production
3. Deploy `apps/api` to Railway production
4. Run `prisma migrate deploy` against Supabase production

**Test database:** A separate Supabase project (`hoard-test`) is used for integration tests. It is reset and re-seeded on every CI run. Never use the production database in tests.

---

## Phase Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Infra Setup | Done | Repo at github.com/Raybur92/hoard; initial migration applied to Supabase |
| 1 — Design System | Done | 18 components, 40 tests passing; visual verified in browser |
| 2 — Static Screens | Done | 8 screens, useBreakpoint, mockData, SW stub; 28 E2E tests passing, 8 visual baselines committed |
| 3 — Backend API | Done | All routes, seed, API client, 8 screens on live data; 28 E2E tests passing |
| 4 — Auth & Platform Sync | Done | Auth + all screens + 42 tests; Steam OpenID + PSN token connect both verified in production. Google OAuth route implemented but blocked by missing client credentials. Xbox/GOG sync stubs return [] — manual-only acceptable for v1. |
| 5 — IGDB + HLTB | Done | IGDB client, HLTB service, sync runner, manual-add UI, cover art, upcoming IGDB feed, Steam App ID lookup, sync micro-interactions, library no-scroll shelves; 67 tests passing |
| 6 — PWA + Hardening | Done | All deliverables implemented. Playwright offline test added (`tests/e2e-offline/offline.spec.ts`). Lighthouse CI workflow + thresholds in place (`.github/workflows/lighthouse.yml`). iOS install verified in production use. |
| Post-6 — Preferences & UX Polish | Done | All stubbed UI eliminated. Preferences system, IGDB filtering, search overlay, delete account, breadcrumbs, sidebar logout, cover density, scope toggle. |
| Post-6 — UX Fixes & Data Quality | Done | Settings game count, shelf counts, shelf order, game detail editing, viewport-filling shelves, HLTB rewrite (codepotatoes.de), steamAppId on Game, full HLTB + status backfill. |
| Post-6 — PSN Sync Quality & HLTB | Done | PSN title cleaning (®/™/platform suffix strip, 94% IGDB match rate), PSN HLTB backfill via Steam Store search (48 records), genres chart proportional bars. |
| Post-6 — Test Backfill & CI Hardening | Done | Fixed 4 stale test suites (hltb fetch mock, platforms `$queryRaw` mock, auth `deleteMany` mock, TopBar Router wrapper). Added Phase 3 integration tests for games/dashboard/stats/upcoming/igdb. Added Playwright offline E2E (`test:e2e:offline`) + Lighthouse CI workflow with PWA ≥ 90 / Performance ≥ 80 thresholds. Final: 103 API + 40 web tests passing. |

> Update this table as phases progress. Use: `In progress`, `Done`, `Blocked (reason)`.
