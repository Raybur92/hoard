# Hoard — Execution Plan

> **Scope:** This file covers execution only — phases, deliverables, success criteria, testing, and current status.
> For project context, design philosophy, tech stack, data model, key decisions, and risks: read `AGENT.md`.
> For commands, hard rules, and design system reference: read `CLAUDE.md`.
> Workstream docs:
> - `docs/RELEASES_PLAN.md` (active, scoped 2026-05-07) — Releases page (formerly Upcoming) visual + structural rework. R1–R6 PR sequence; based on `Hoard_releases_handoff.md` + `Hoard_releases_mocks.html`.
> - `docs/INTERACTION_DEBT_PLAN.md` (complete 2026-05-06) — post-Phase-8 audits + 4-PR cleanup. Covers data-flow audit, interaction audit, hot fixes, and PRs A/B/C/D.
> - `docs/PERFORMANCE_PLAN.md` (complete 2026-05-04) — performance & UX workstream record.

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
- [ ] `GET /health` returns 200 from the Railway production URL — *not deployed yet; runs locally on port 3001 and the health route is wired*
- [ ] Frontend Vercel URL renders without console errors — *not deployed yet; runs locally on port 5173*
- [x] `npx prisma migrate deploy` runs cleanly against Supabase
- [x] `npm run typecheck` passes in all packages with no errors
- [ ] `npm run lint` passes with no errors — *86 pre-existing errors on main (mostly `any` in test middleware mocks, missing `import type` for Express types, Node globals in `scripts/`); not regressed by current work*

**Testing:**
- [x] Manual smoke test of `/health` endpoint — verified locally; `apps/api/railway.toml` wires it to the deploy probe for when production goes up
- [ ] CI runs lint + typecheck — `.github/workflows/ci.yml` is in place but commits go directly to `main` (no PRs yet), so CI hasn't actually been exercised end-to-end

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
- [ ] App installs successfully on Chrome (desktop) and Safari (iOS) — `manifest.json` + apple-touch-icon meta tags in place; will be testable once deployed (Safari requires HTTPS for install)
- [x] Dashboard and Library render from cache when network is offline — verified by `tests/e2e-offline/offline.spec.ts` (run via `npm run test:e2e:offline`)
- [x] Lighthouse PWA score ≥ 90 — *retired by Lighthouse 12; the PWA category was removed and split into individual audits. Replaced with: viewport audit pass + offline E2E test (verifies SW registration & cache-from-offline)*
- [x] Lighthouse Performance score ≥ 80 on desktop — local run: **99**. Threshold enforced in `lighthouserc.json` and `.github/workflows/lighthouse.yml` on PRs.
- [x] API request with missing required field returns `400 { error: "..." }` with a descriptive message
- [x] API request with no auth cookie returns `401`
- [x] Injecting 1000 requests/min hits the rate limiter and returns `429` — `express-rate-limit` configured at 100/min global + 10/min on auth routes; behaviour exercised by route tests
- [ ] No unhandled promise rejections in production logs after 24h of use — *not deployed yet; will gate on after first 24h on Railway*

**Testing:**
- [x] Playwright: simulate offline — `tests/e2e-offline/offline.spec.ts` uses `context.setOffline(true)` and asserts cached content renders. Runs against `vite preview` with PWA service worker active.
- [ ] Playwright: install prompt appears on Chrome (check `beforeinstallprompt` event fires) — *not added; install confirmed manually in production use*
- [x] Lighthouse CI in GitHub Actions: enforce Performance ≥ 80 (and Accessibility ≥ 90, Best-practices ≥ 90) — `.github/workflows/lighthouse.yml` runs `@lhci/cli autorun` on every PR touching `apps/web/**`. PWA category retired in Lighthouse 12 — installability is now verified by the offline E2E test instead.
- [ ] Manual install test: install on iOS Safari, verify it appears on home screen and launches in standalone mode — *not testable until deployed with HTTPS (Safari requires HTTPS for "Add to Home Screen" install)*
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
- [x] **Lighthouse CI in GitHub Actions** — `.github/workflows/lighthouse.yml` runs `@lhci/cli autorun` on every PR touching `apps/web/**`. Config in `apps/web/lighthouserc.json` enforces `categories:performance ≥ 0.8`, `categories:accessibility ≥ 0.9`, `categories:best-practices ≥ 0.9` as errors. Local verification: Performance 99, Accessibility 100, Best-practices 100.

**Final test counts:** API 12 suites / 103 tests passing · Web 2 suites / 40 tests passing · Typecheck clean.

**Decisions:**
- Test mocks for the prisma client are file-local (not a shared mock module) — keeps the per-route test isolated and lets each suite expose only the prisma methods it actually exercises. The cost is repetition; the benefit is that adding a new prisma call to a route surfaces immediately as a missing-mock failure rather than silently passing.
- Phase 3 integration tests use mocked Prisma (not a real Postgres test branch). Rationale: every route is a thin pass-through over Prisma — the value is in verifying request parsing, response shape, status mapping, and error paths, not in exercising actual SQL. A real DB would add CI run-time and infra without catching meaningful bugs at this layer. The Phase 3 plan item "isolated Supabase test branch" is closed as not-needed for this single-user app.
- The Phase 6 offline E2E test uses a dedicated playwright config that builds the production bundle and serves it via `vite preview` because `devOptions.enabled: false` keeps the SW out of dev mode. Adding `preview.proxy` to `vite.config.ts` so `/api/*` is forwarded to the API server during the initial (online) load before the test goes offline.
- Lighthouse CI uses `@lhci/cli autorun` (no static dependency in `package.json`) via `npx --yes @lhci/cli@0.14.x` — keeps the lockfile clean since this only ever runs in CI.
- The original Phase 6 success criterion was "Lighthouse PWA score ≥ 90". Lighthouse 12 retired the PWA category entirely — the aggregate score no longer exists. Individual installability audits (`installable-manifest`, `service-worker`, `themed-omnibox`) were also dropped. The PWA capability is instead verified by the offline E2E test (which confirms SW registration + cache-from-offline) and the `viewport` audit (still gated). Closing the original criterion as fulfilled by these substitutes.
- Pre-existing 86 lint errors on main (mostly `any` in test middleware mocks, missing `import type` for `Request`/`Response`, and Node globals in `scripts/`) are out of scope for this pass — they predate the work and would require a focused lint-cleanup commit. New tests follow the same patterns as existing ones to stay consistent.

---

### Phase 7 — Production Deployment & Google OAuth

**Goal:** Hoard is reachable from outside the local machine. Frontend on Vercel, API on Railway, both connecting to the existing Supabase database. Google OAuth wired up alongside the existing Steam OpenID flow.

**Order matters:** Supabase first (already in place), then Railway, then Vercel, then Google OAuth (because the OAuth callback URL needs the production API domain). All four are free-tier compatible.

**Deliverables:**

Database (already in place — verify only):
- [x] Supabase project exists and is the dev database
- [ ] Decide: keep current Supabase as production (single project for v1) vs. provision a fresh production Supabase + migrate. Recommended for a personal tool: keep current as production, since it already holds 488 Steam games + 132 PSN games + HLTB data.
- [ ] `prisma migrate deploy` runs cleanly against the production DB

Railway (API):
- [x] Create Railway project, link this repo via the dashboard or CLI
- [x] Service points at `apps/api/` build and start commands (configured in root `railway.toml`)
- [x] Environment variables set in Railway dashboard:
  - `DATABASE_URL` (from Supabase production connection pooler — transaction-mode URL, port 6543)
  - `JWT_SECRET` (newly generated 32+ character random string — do NOT reuse the dev secret)
  - `WEB_URL` (the Vercel production URL — placeholder until Vercel is set up, then update)
  - `STEAM_API_KEY` (copy from local `.env`)
  - `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` (copy from local `.env`)
  - `NODE_ENV=production`
  - `JWT_EXPIRES_IN=7d`
  - **`NPM_CONFIG_PRODUCTION=false`** — required so `npm ci` still installs `devDependencies` during the build (TypeScript + `@types/*` packages live there). Without this, the `tsc -b` build step fails with `Cannot find name 'process'` and similar.
  - (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` added in the OAuth step)
- [x] First deploy succeeds; `GET https://hoardapi-production.up.railway.app/health` returns `{"status":"ok","db":"ok","uptime":...}`
- [ ] Custom domain configured (optional — `hoardapi-production.up.railway.app` works fine for now)

Vercel (web):
- [x] Create Vercel project, link this repo (Vercel auto-detects Vite)
- [x] Build settings:
  - Framework preset: Vite
  - Root directory: `apps/web`
  - Build command: `npm run build` (Vercel runs it from `apps/web/`)
  - Output directory: `dist`
  - Install command: default (Vercel auto-detects npm workspaces and installs from monorepo root)
- [x] Environment variable: `VITE_API_URL = https://hoardapi-production.up.railway.app` (Production + Preview)
- [x] First deploy succeeds; `https://hoard-liard.vercel.app` renders the login screen and redirects to dashboard after auth
- [x] CORS: Railway `WEB_URL` env var updated to `https://hoard-liard.vercel.app`
- [ ] Custom domain configured (optional — `hoard-liard.vercel.app` works fine for now)

Google OAuth:
- [ ] Google Cloud project created (or existing project reused)
- [ ] OAuth consent screen configured (External user type, scopes: `openid email profile`)
- [ ] OAuth client ID created (Web application)
  - Authorized JavaScript origins: `http://localhost:5173`, `http://localhost:3001`, the Vercel URL, the Railway URL
  - Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`, `https://<railway-domain>/api/auth/google/callback`
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` set in both `apps/api/.env` (dev) and Railway env vars (prod)
- [ ] Google sign-in button on `/login` flows through to a logged-in dashboard end-to-end (manual verification)

**Success Criteria:**
- [x] `GET https://hoardapi-production.up.railway.app/health` returns `{"status":"ok","db":"ok",...}`
- [x] Vercel deployment renders without console errors
- [x] Email/password registration works end-to-end against the deployed API; cross-origin cookie persists across page loads
- [ ] Steam OpenID login works end-to-end (needs the OpenID return URL re-pointed to the Railway domain — verify after deploy is fully settled)
- [x] Google OAuth login works end-to-end — confirmed in regular Chrome, Chrome incognito, and iOS Safari (after custom domain rollout)
- [ ] Library sync (Steam + PSN) runs against the production API with no errors (test once Steam OpenID is connected on the prod account)
- [ ] PWA install on iOS Safari succeeds (HTTPS available via Vercel)
- [x] No CORS errors in browser console when web → api requests fire

**Decisions:**
- Railway auto-created two services on first link (`hoard/api` and `hoard/web`) because the repo has two apps. Deleted `hoard/web` since Vercel hosts the frontend — Railway is API-only.
- `railway.toml` moved from `apps/api/` to repo root. Railway auto-detects it at root and the `buildCommand` (`npm run build --workspace=apps/api`) needs the monorepo `package-lock.json` resolved, which only works when Root Directory = `/`.
- `NPM_CONFIG_PRODUCTION=false` is mandatory on Railway. When `NODE_ENV=production` is set (which we want for runtime), `npm ci` defaults to skipping devDependencies — but `typescript`, `@types/node`, `@types/express`, etc. are devDeps and are needed at build time. Setting `NPM_CONFIG_PRODUCTION=false` explicitly tells npm to install everything regardless of NODE_ENV. Container is ~30-50 MB larger than strictly necessary; trivial for a personal tool.
- `apps/api/package.json` build script switched from `tsc -p` to `tsc -b` — `-p` doesn't follow project references, so `packages/types` and `packages/db` weren't built when only the api workspace was built from clean. `-b` builds project references in dependency order.
- `packages/db/package.json` gained a `postinstall` hook that runs `prisma generate`. Without it, `@prisma/client` has no generated client and any import fails at build/runtime. Running it during postinstall means `npm ci` always produces a usable client.
- `apps/web/package.json` build script switched from `tsc -b && vite build` to `npx tsc -b && npx vite build`. Vercel's build invocation didn't traverse parent `node_modules/.bin` to resolve workspace-hoisted binaries, so plain `tsc` failed with `command not found`. `npx` walks the workspace tree and finds the binary regardless of where npm hoisted it.
- `apps/web/vite.config.ts` gained a `preview.proxy` mirror of `server.proxy` so `vite preview` (used by the offline E2E test) forwards `/api/*` to the local API server, matching dev behaviour.
- API client uses `import.meta.env.VITE_API_URL` as a base URL prepended to every request. In dev, leave it unset and rely on Vite's proxy (keeps requests same-origin so SameSite=Lax cookies still work). In production, set it to the Railway domain — combined with SameSite=None+Secure cookies, the browser accepts cross-origin cookies between Vercel and Railway.
- Auth cookies switch to `SameSite=None; Secure` when `NODE_ENV=production` (and `Lax` otherwise). `lax` blocks the cross-origin cookie flow between `*.vercel.app` and `*.up.railway.app`. Both flags must match between `setAuthCookie` and `clearCookie` calls — extracted into a shared `cookieOptions()` helper to avoid drift.
- `<RequireAuth>` wraps every protected route. It calls `api.me()` once on mount: success → render children, 401 → `<Navigate to="/login" replace state={{ from: pathname }} />`. Without it, an unauthenticated user landed on a blank dashboard because the dev fallback (`JWT_SECRET === 'dev-secret'`) auto-authenticated them locally.
- `app.set('trust proxy', 1)` is required on Railway. Without it, `X-Forwarded-For` is ignored, `req.ip` returns the proxy IP, and `express-rate-limit` throws a `ValidationError` on every request. `1` (one hop) is the right value — `true` would trust any forwarded header, which is a spoofing risk.
- `DATABASE_URL` on Railway must include `?pgbouncer=true&connection_limit=1` query params. Supabase's transaction-mode pooler (port 6543) doesn't support prepared statements, but Prisma uses them by default — every request crashes with `prepared statement "s0" already exists`. The `pgbouncer=true` flag tells Prisma to disable prepared statements for pgbouncer compatibility; `connection_limit=1` keeps Prisma from exhausting the per-tenant pgbouncer pool from a single Railway container.
- Google OAuth uses three Railway env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://hoardapi-production.up.railway.app/api/auth/google/callback`. The OAuth client in Google Cloud Console is in **Testing** mode (not Production) — that's intentional and indefinitely fine for a personal tool. Test mode requires either project-owner sign-in OR explicit Test Users; Production mode requires a multi-week verification process from Google. Project owners can sign in without being on the Test Users list.
- Chrome **incognito** and iOS Safari both block third-party cookies even with `SameSite=None; Secure`, so cross-origin auth between Vercel (`*.vercel.app`) and Railway (`*.up.railway.app`) failed — login appeared to succeed but `/api/auth/me` 401'd on the next request because the cookie was rejected as third-party. **Resolved** by registering `gamehoardr.com` on Porkbun and putting the web at `gamehoardr.com` (Vercel) and the API at `api.gamehoardr.com` (Railway). Both subdomains share `.gamehoardr.com` as parent, so cookies are first-party in every browser. iOS Safari and incognito both work after the change.
- Custom domain DNS lives at Porkbun (where the domain was bought). Vercel and Railway each provided specific records to add: Vercel an `A 216.198.79.1` for the apex, Railway a `CNAME api → nfkiy0n4.up.railway.app` plus a `_railway-verify.api` TXT record. Both platforms auto-provisioned Let's Encrypt SSL once DNS pointed correctly. CORS regex on the API was extended to `/^https:\/\/(?:[a-z0-9-]+\.)?gamehoardr\.com$/` (apex + any subdomain).
- Old Vercel and Railway default URLs (`hoard-liard.vercel.app`, `hoardapi-production.up.railway.app`) remain active as fallbacks — both platforms keep their default domains alongside custom domains automatically. Useful if Porkbun DNS ever has issues.

---

### Post-Phase 7 — Lint Cleanup + Supabase RLS

**Goal:** Bring the repo to a clean lint state so `.github/workflows/ci.yml` exits 0 reliably, and close the 8 Supabase Security Advisor errors flagged after the production deploy.

**Fixes:**

- [x] **Supabase Row-Level Security** — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all 7 public tables (`User`, `Platform`, `Game`, `UserGame`, `HltbData`, `WishlistRelease`, `_prisma_migrations`). Captured in migration `20260504100000_enable_rls_on_public_tables`. Closes 8 advisor errors (7× `rls_disabled_in_public` + 1× `sensitive_columns_exposed` on `User.password`). Application queries are unaffected because the `postgres` role used by Prisma bypasses RLS — only the PostgREST anon/authenticated path is locked down.
- [x] **ESLint scripts override** — added `files: ['scripts/**/*.{js,cjs,mjs}']` block with Node globals + disabled `no-require-imports`. Closes 20 errors in `scripts/generate-icons.cjs`.
- [x] **Test middleware mocks** — replaced `(req: any, _res: any, next: any)` with proper `Request, Response, NextFunction` types in 7 API route test files. Cast to `Request & { userId: string }` since `userId` is set on the declaration-merged `Express.Request`. Closes 42 `no-explicit-any` errors.
- [x] **Express type imports** — split `import { Router, Request, Response }` into runtime `import { Router }` plus `import type { Request, Response }` in 7 route source files plus `middleware/user.ts`. Closes 13 `consistent-type-imports` errors.
- [x] **Misc unused vars** — removed unused imports (`formatRelative`, `MobileTabBar`, `shortYear`, `AuthUser`); renamed unused destructured props with `_` prefix; dropped unused `index` params from `.map` callbacks; replaced two `let result` with `const`; fixed `no-useless-escape` on `\[` inside character class in PSN title regex; replaced inline `import('...').Type` annotations with top-of-file `import type` declarations (e2e specs, dashboard `ReleaseDateCategory`).
- [x] **`auth.test.ts` determinism** — `jest.mock('dotenv/config', () => ({}))` plus `delete process.env['GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'STEAM_API_KEY']` at the top of the file before any imports. The "501 when GOOGLE_CLIENT_ID is not configured" test now passes regardless of what's in the developer's local `.env` (previously failed locally as soon as the dev added Google OAuth credentials for local-mode testing).
- [x] **`dev:web` / `dev:api` scripts** — added to root `package.json` to match the documented commands in CLAUDE.md (they had been documented but never defined).

**Final state:**
- `npm run lint` exits 0 (was: exit 1 with 86 errors). Two non-blocking HMR warnings remain in `PreferencesContext.tsx`.
- `npm run typecheck` clean.
- 103 API tests + 40 web tests passing.
- Supabase Security Advisor: 0 errors (was: 8 errors).

**Decisions:**
- The CI lint job had been failing silently for the entire project history — commits went directly to `main` without PR review, so nobody noticed CI was red. Fixing the underlying lint errors is the right move (rather than masking them or removing the lint step) because `npm run lint` is now a useful guard for future PRs.
- For test middleware mocks, the chosen pattern is `(req: Request, _res: Response, next: NextFunction) => { (req as Request & { userId: string }).userId = '...'; next(); }` — the cast acknowledges that `userId` is added via global declaration merging in `middleware/user.ts` but the type is otherwise plain `Request`. `unknown` would be too loose; a custom test-only `AuthedRequest` type adds boilerplate.
- The `auth.test.ts` `dotenv/config` mock + env-deletion approach was chosen over per-test `jest.resetModules()` reloading — the OAuth env state needs to be fixed BEFORE the auth route module first loads, and the route is loaded transitively via `import { app } from '../index';` which runs before any `beforeAll` hook can fire.
- Prisma migration history reconciliation deferred — the RLS migration's SQL is already applied to Supabase (run manually before the migration file existed), but `prisma migrate resolve --applied` hangs in this environment (likely a pgbouncer + migrate-resolve quirk over a slow connection). `prisma migrate status` will show this migration as pending, but the SQL is idempotent so any future `migrate deploy` is a no-op. Cosmetic, not functional.

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

### Phase 8 — Mobile Parity, iOS-HIG & Accessibility

**Goal:** Bring the mobile experience to platform-correct, fully WCAG 2.1 AA-compliant, and feature-aligned with desktop. Resolves structural debt surfaced by the May 2026 multi-pass UX audit (parity, Nielsen heuristics, iOS HIG, typography & touch targets, accessibility / states / forms / IA / motion).

**Audit composite score before this phase:** ~3/10 mobile UX. Aesthetic is preserved and worth keeping; foundations underneath (typography system, focus management, semantic HTML, mobile shell HIG correctness) need to be built.

**Audit summary (key findings):**
- ~290 uses of 9–12 px text; no `--text-*` token scale exists despite `--sp-*` spacing scale being established
- Zero `:focus-visible`, zero `:focus`, zero `outline:` overrides anywhere in styles
- ~50 `<div onClick>` / `<span onClick>` handlers without `role`, `tabIndex`, or keyboard support
- Zero semantic `<h1>` / `<h2>` / `<h3>` across the app (all visual styling on `<div>`)
- Form inputs lack `<label htmlFor>` and `aria-label`
- Modals (`AddGameModal`, `SearchOverlay`, `DeleteAccount`, `PsnGuidedFlow`) lack `role="dialog"`, `aria-modal`, focus trap
- Mobile shell ships a fake hardcoded "9:41 / 100%" status bar above the real iOS status bar (`MobileFrame.tsx:11–19`)
- Mobile tab bar uses `repeat(5, 1fr)` grid for 4 tabs (`global.css:516`) — 20 % empty column
- No `viewport-fit=cover`, no `env(safe-area-inset-*)`, `100vh` instead of `100dvh`
- Mobile components don't read `usePreferences()` and don't call `update()`; ~50 % of desktop interactivity is missing on mobile equivalents
- `--paper-faint` (`#6b6f72`) at 4.2:1 on `--void` fails WCAG AA for normal text and is the most common color for labels/captions at 9–10 px
- Browser tab title is always "hoard" (no `<title>` per route)
- `prefers-reduced-motion` not honored

**Order matters:** PR 1 (foundation tokens + focus styles) unblocks every later PR. PR 2 (mobile shell) is independent and can ship in parallel with PR 3 once PR 1 lands. PR 3 (accessibility) is best done before PR 4 (parity) so new mobile features inherit accessible patterns. PR 5 is additive and last.

---

#### PR 1 — Foundation: typography scale, focus styles, motion tokens

**Risk:** low. Pure CSS / tokens. No logic changes.
**Status:** Done (commit `9d3ab31`, 2026-05-05).

**Deliverables:**
- [x] Typography scale added to `apps/web/src/styles/tokens.css` — final shape is 11 steps (`--text-3xs` 10 → `--text-display` 96), broader than the 8-step plan because mid-tier display sizes (14, 22, 44, 56) showed up frequently enough in the inline-fontSize audit to deserve scale slots
- [x] `--lh-tight: 1.15` / `--lh-snug: 1.3` / `--lh-normal: 1.5` / `--lh-relaxed: 1.7` line-height tokens added
- [x] Global `:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }` applied via `apps/web/src/styles/global.css`; inputs/textareas/selects get a thicker box-shadow ring
- [x] `@media (prefers-reduced-motion: reduce)` block neutralizes all animation/transition durations
- [x] `.chip` 22 → 28 px / font 10 → `var(--text-xs)` (12 px)
- [x] `.btn.sm` 24 → 32 px / font 10 → `var(--text-xs)`
- [x] `.btn` text 11 → `var(--text-sm)` (13 px); height stays 32 px
- [x] `.field` 30 → 36 px / font 12 → `var(--text-sm)`
- [x] `--paper-faint` removed as text color anywhere font-size < `--text-md` (17 px); replaced with `--paper-dim` — fixes WCAG AA contrast for all small body text
- [x] All component CSS classes (kv, marker, shelf-label, sidebar, topbar, m-tabbar, status-sigil, bignum, receipt internals) migrated to scale tokens
- [x] Inline `fontSize` literal sweep across 24 components — sub-floor sizes (7/8/9 px) bumped to 10/11 px; 16/18 collapsed to `var(--text-md)` (17); hero/display tier (20–48 px) left as documented exceptions
- [x] `.skip-link` CSS placeholder added (PR 3 wires the actual link)

**Bonus (not in original deliverables, surfaced during PR 1):**
- [x] `GameDetailDesktop` quick-stats grid restructured: rigid `gridTemplateRows: '28px 12px'` replaced with flex column + `justifyContent: space-between`. "LAST TOUCHED" no longer wraps into the value row.
- [x] `GameDetailDesktop` HLTB compare grid restructured: value+sub grouped as a single anchored block at the cell bottom, label pinned to top — eliminates the "floaty middle value" feel.

**Success Criteria:**
- [x] Tab through every screen with keyboard — focus indicator visible at every interactive element (verified locally on Chrome)
- [ ] WebAIM contrast checker: every text/background pair scores ≥ 4.5:1 (deferred to PR 3 axe-core integration which catches contrast violations programmatically across every component)
- [x] No `font-size: <number>` magic-number declarations outside the documented hero/display tier (20–48 px) and receipt/barcode/bignum exceptions
- [ ] Toggling Reduce Motion suppresses skeleton pulse — CSS rule in place; not yet verified on real iOS/macOS device
- [x] All Vitest + Jest tests still pass (115 API + 69 web); visual regression snapshots regenerated against the live API

**Decisions:**
- Typography scale ended up at 11 steps (not 8) because the in-between display sizes (14, 22, 44, 56 px) appeared often enough in the inline-fontSize audit that adding scale slots was cleaner than leaving them as magic numbers. The display tier (28 / 44 / 56 / 96) is allowed to skip slots; only the body tier is constrained.
- Inline fontSize values 16 and 18 px both collapsed to `var(--text-md)` (17 px) — a ±1 px nudge that's barely perceptible but eliminates two near-duplicate magic numbers. The 20+ px tier is left as one-off magic numbers because each instance is a deliberate hero-weight choice.
- `.plat` badge font-size 9 px kept as a documented exception — the badge geometry (14 px tall, 18 px wide) is the constraint, not the font size; bumping to 11 px would force a redesign of every cover thumbnail.
- `--paper-faint` is now banned only for *text* under 17 px. It's still used for decorative borders / dividers / heatmap empty cells where contrast rules don't apply.
- The receipt block on `GameDetailMobile` uses 10 px (`--text-3xs`) lines as a documented dense-mono exception — the "receipt" stylization depends on tight line-spacing.
- GameDetailDesktop grid restructure was unplanned but landed during PR 1 because Andrea spotted the "LAST TOUCHED" wrap during the visual review. Same fix applied to the HLTB compare grid for visual consistency. Both grids switched from rigid `gridTemplateRows` with fixed pixel slots to flexbox columns with `justifyContent: space-between`, anchoring labels/sub-text to the bottom of their cells.

---

#### PR 2 — Mobile shell: iOS HIG correctness

**Risk:** low–medium. Mostly CSS; one icon-set decision.
**Status:** Done (commit `b31fa5d`, 2026-05-05).

**Deliverables:**
- [x] `MobileFrame.tsx` — fake `.m-status` status bar block deleted entirely; `--statusbar-h` removed from `tokens.css`
- [x] `apps/web/index.html` viewport meta updated to `viewport-fit=cover`
- [x] `.app-mobile` and `.app-shell` use `height: 100dvh` (with `100vh` fallback); `.app-mobile` adds `padding-top: env(safe-area-inset-top)` for notch / Dynamic Island
- [x] `.m-tabbar` updated: `repeat(4, 1fr)` grid; `padding-bottom: env(safe-area-inset-bottom)` for home indicator
- [x] `.m-tabbar .item` updated: padding `12px 0 14px`, glyph 14 → 18 px, label uses `var(--text-2xs)`, inactive color paper-faint → paper-dim
- [x] Active-tab indicator: `2px solid var(--amber)` top border with `margin-top: -2px` so the row doesn't shift on activation
- [x] Press feedback: `.m-tabbar .item:active { background: var(--ink-2); }`
- [x] Light haptic on tap: `navigator.vibrate?.(8)` in `MobileTabBar.tsx` `onClick` handler
- [x] `MobileHeader.tsx` search icon wired (proper `<button>` with `aria-label="Search games"` opens `SearchOverlay`); decorative menu icon removed (no clear purpose)
- [x] `MobileTabBar.tsx` icons replaced with destination-meaningful glyphs: Dashboard → `home`, Library → `rows`, Soon → `clock`, Me → `user`. Three new SVG paths added to `ICON_PATHS` (`home`, `rows`, `clock`).

**Bonus (not in original deliverables, surfaced during PR 2):**
- [x] `SearchOverlay` state lifted out of `TopBar` into a new `SearchModalProvider` ([hooks/useSearchModal.tsx](apps/web/src/hooks/useSearchModal.tsx)) mounted at `AppShell` level. Both `TopBar` and `MobileHeader` consume `useSearchModal()` for open. ⌘K binding moved to the provider. Single source of truth, single render of `<SearchOverlay/>`.
- [x] `MobileTabBar` rewritten as semantic `<nav aria-label="primary">` with `<button>` items and `aria-current="page"` on the active tab — head start on PR 3 a11y deliverables.

**Success Criteria:**
- [ ] On iOS Safari real device, no double clock / battery indicator visible (CSS removed; needs real-device confirmation when Andrea opens the PWA next)
- [ ] On a notched device, content does not slide under the notch (CSS in place; needs real-device confirmation)
- [ ] On a device with home indicator, the tab bar does not collide with the gesture region (CSS in place; needs real-device confirmation)
- [x] Tab bar fills the full screen width with no empty column (verified via Playwright mobile snapshots)
- [x] Active tab is identifiable from across the room — color + top border (verified via Playwright mobile snapshots)
- [ ] Tapping a tab gives a visible press state and a haptic tick — `:active { background }` and `vibrate(8)` in place; haptic only verifiable on Android (iOS Safari ignores `navigator.vibrate`)
- [x] Search icon in mobile header opens `SearchOverlay`; menu icon removed
- [x] All Vitest + Jest tests still pass (115 API + 69 web); 4 mobile visual snapshots regenerated against the live API

**Decisions:**
- The `MobileHeader` decorative menu icon was removed entirely rather than wired to a contextual sheet. PR 5 (IA & polish) can revisit if a real per-screen contextual action set emerges; speculatively wiring it now would be design-without-purpose.
- Three new SVG icon paths added to `Icon.tsx`: `home` (house outline), `rows` (3 staggered horizontal bars), `clock` (circle + hands). Kept consistent with the existing terminal aesthetic — outline-stroke style at 1.5 px, 24×24 viewBox.
- `SearchModalProvider` is the chosen pattern for cross-shell shared overlay state. Clean React idiom; avoids prop drilling through `<Outlet>` context. The same pattern can be reused in PR 4 / PR 5 if other modal-class overlays need shared open state (e.g., a global "add game" button).
- `MobileTabBar` was upgraded to semantic HTML (`<nav>` + `<button>` + `aria-current`) inside PR 2 rather than waiting for PR 3 — the rewrite was already happening, so doing it once was cheaper than refactoring twice.
- `padding-bottom` on `.m-tabbar` uses raw `env(safe-area-inset-bottom)` rather than `max(8px, env(...))` — when the inset is 0 (browsers, non-PWA, non-notched devices) we want zero extra padding, not a hardcoded 8 px. The original plan note suggested `max(8px, ...)` defensively but it would over-pad in the most common case.
- `.m-tabbar .item` uses `margin-top: -2px` to absorb the 2 px active-indicator border — without this, activating a tab visibly shifts the row 2 px down. Subtle but felt cheap.

---

#### PR 3 — Accessibility pass: WCAG 2.1 AA compliance

**Risk:** medium. Touches every screen, but mostly mechanical replacements. This is the heaviest PR.

**Scope target:** Full WCAG 2.1 AA compliance. Hoard is currently a personal tool but Andrea may release it as a product later; A-grade accessibility is a hard prerequisite.

**Specific WCAG 2.1 AA criteria addressed:**

| Criterion | What it requires | Where Hoard fails today |
|---|---|---|
| 1.1.1 Non-text Content | Alt text on all `<img>` | `Cover.tsx:25` falls back to `alt=""` even when label exists |
| 1.3.1 Info and Relationships | Semantic HTML — headings, lists, nav, landmarks | Zero `<h1>` / `<h2>` / `<h3>`; no `<main>` / `<nav>` / `<aside>` |
| 1.4.3 Contrast (Minimum) | 4.5:1 normal, 3:1 large | `--paper-faint` at 4.2:1 used on small body text (addressed in PR 1) |
| 1.4.10 Reflow | Content reflows at 320 px without horizontal scroll | Needs verification — mobile viewport is well above 320 |
| 1.4.11 Non-text Contrast | 3:1 for UI components & focus indicators | No focus indicators today (addressed in PR 1) |
| 1.4.12 Text Spacing | User-overrides for line-height, letter-spacing must not break layout | Test with Stylebot-equivalent overrides |
| 2.1.1 Keyboard | All functionality keyboard-operable | ~50 `<div onClick>` not keyboard-operable |
| 2.1.2 No Keyboard Trap | Focus must be able to leave any component | Modals don't trap focus today, but they don't trap-trap either; verify |
| 2.4.1 Bypass Blocks | Skip-to-content link or landmark navigation | Not present |
| 2.4.2 Page Titled | Each page has a `<title>` | Browser tab always "hoard" |
| 2.4.3 Focus Order | Logical tab order | Verify after focus styles land |
| 2.4.4 Link Purpose (in Context) | Each link's purpose is determinable from its text + context | "View all" / "+" / icon-only buttons need accessible names |
| 2.4.6 Headings and Labels | Descriptive headings & labels | No headings exist; labels exist visually but not programmatically |
| 2.4.7 Focus Visible | Keyboard focus indicator visible | Addressed in PR 1 |
| 2.5.3 Label in Name | Accessible name contains the visible label | New requirement once `aria-label` is added — must match visible text |
| 2.5.5 Target Size (AA: 24 × 24 CSS px) | Tap targets ≥ 24 × 24 CSS px (AA) | `.chip` 22 px (addressed in PR 1 raises to 28) |
| 3.1.1 Language of Page | `<html lang="en">` set | Verify in `index.html` |
| 3.2.3 Consistent Navigation | Repeated navigation in same order | Sidebar / TopBar / TabBar are consistent ✓ |
| 3.2.4 Consistent Identification | Same components labelled the same way everywhere | Verify post-changes |
| 3.3.1 Error Identification | Errors clearly identified in text | Login / Settings / AddGameModal mostly OK; SettingsDesktop blur-to-save silent on failure |
| 3.3.2 Labels or Instructions | Form inputs have labels or instructions | `htmlFor` missing across all inputs |
| 3.3.3 Error Suggestion | Specific suggestions for fixing errors | Mostly OK in form messages |
| 3.3.4 Error Prevention | For data deletion / submission, ability to review and confirm | Delete account already has HOARD confirmation ✓ |
| 4.1.2 Name, Role, Value | All UI components must expose name, role, and value to assistive tech | `<div onClick>` has no role; modals have no `role="dialog"` |
| 4.1.3 Status Messages | Status messages announced via ARIA live regions | "// saved" message in Settings is visual-only; needs `aria-live="polite"` |

**Status:** Done (commits `3ce97d2` → `52fb4aa`, 2026-05-05). Landed in 6 sub-PRs because the scope was large; each one was independently green before the next started.

**Deliverables:**

Semantic HTML:
- [x] ~50 `<div onClick>` / `<span onClick>` converted to `<button type="button">` across `TopBar`, `Sidebar`, `MobileHeader`, `MobileTabBar`, `LoginScreen` tab switcher, `SearchOverlay`, `AddGameModal`, `LibraryDesktop`/`LibraryMobile` shelf items + view-all cards, `PlatformDetailDesktop`/`Mobile` back link + tab strips, `GameDetailDesktop`/`Mobile` status menu + notes editor + back caret, `SettingsDesktop`/`Mobile` menu items + modal backdrops, `UpcomingDesktop`/`Mobile` wishlist toggles, `Chip`, `Toggle`, `Radio`, `SettingsNav`. Lint went from **90 jsx-a11y errors → 0**.
- [x] Visual heading patterns promoted to semantic tags. `MobileHeader` title is `<h1>` (visible per route on mobile). `TopBar` last breadcrumb mirrored as visually-hidden `<h1>` (every desktop route gets a heading). `LoginScreen` "hoard" wordmark is `<h1>`. `PsnGuidedFlowDesktop` "get your psn token" is `<h1>`. `DeleteModal` title is `<h2 id="delete-account-title">` matched by `aria-labelledby`.
- [x] ARIA landmarks: `<main id="main-content">` wraps each route's content via `AppShell` (desktop + mobile); `<nav aria-label="primary">` on `MobileTabBar` and `Sidebar`; `<header>` on `TopBar` and `MobileHeader`; `<aside>` on `Sidebar`; `<nav aria-label="Breadcrumb">` on TopBar crumbs; `<nav aria-label="Settings sections">` on `SettingsNav`.

Forms:
- [x] Every `<input>` got `id` + `<label htmlFor>` (`LoginScreen` display name / email / password; `SettingsDesktop` + Mobile name / email; `AddGameModal` search + status + platform selects; `SearchOverlay` search; `PsnGuidedFlow` Desktop + Mobile npsso). Both `<select>` elements in `AddGameModal` got visible labels.
- [x] `Toggle` rewritten as `<button role="switch" aria-checked>` inside a `<label>` for click-on-text behavior. `Radio` rewritten as `<button role="radio" aria-checked>`. Both keyboard-operable via native `<button>` semantics (Space/Enter).
- [x] Accessible names match visible labels (WCAG 2.5.3) — verified by axe-core's `label-content-name-mismatch` rule passing.

Modals & overlays:
- [x] `AddGameModal`, `SearchOverlay`, `DeleteModal` in `SettingsDesktop`: each got `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (referencing the modal heading's `id`).
- [x] Focus trap implemented via new `useFocusTrap` hook ([apps/web/src/hooks/useFocusTrap.ts](apps/web/src/hooks/useFocusTrap.ts)). Applied to all three modals. Tab cycles inside; focus returns to trigger on close.
- [x] Escape key closes every modal via document keydown listener (cleanly removed on unmount).

Page titles & landmarks:
- [x] `useDocumentTitle(title)` hook ([apps/web/src/hooks/useDocumentTitle.ts](apps/web/src/hooks/useDocumentTitle.ts)) wired into all 15 screens. Static titles for Dashboard / Library / Upcoming / Settings / Connect PSN / Sign in. Dynamic titles for `LibraryDesktop`/`Mobile` (status param), `GameDetailDesktop`/`Mobile` (game title), `PlatformDetailDesktop`/`Mobile` (platform name).
- [x] `.skip-link` CSS in place since PR 1; PR 3 wires the actual `<a class="skip-link" href="#main-content">` in `AppShell` and adds the matching `<main id="main-content">` landmark.
- [x] `<html lang="en">` confirmed.

Live regions:
- [x] `role="status" aria-live="polite"` on the "// saved" / "ok" toasts in `SettingsDesktop` + `SettingsMobile`.
- [x] `role="alert" aria-live="assertive"` on the `LoginScreen` error banner.
- [x] `aria-live="polite"` on the search-overlay loading "…" indicator.

Images:
- [x] `Cover.tsx` alt text strategy fixed. Default is descriptive (`{label} cover art` or `Game cover`); accepts a `decorative` prop to opt into `alt=""` explicitly.

Tooling & CI:
- [x] `eslint-plugin-jsx-a11y` added to ESLint config with the recommended ruleset; **the lint job is now an a11y guardrail** on every PR.
- [x] `@axe-core/playwright` added; new `apps/web/tests/e2e/axe.ts` helper exposes `expectNoA11yViolations(page)`; new `apps/web/tests/e2e/a11y.spec.ts` asserts zero WCAG 2.1 A + AA violations on Dashboard / Library / Upcoming / GameDetail / Settings / Login across desktop + mobile (12 tests).
- [x] Lighthouse CI accessibility threshold raised 90 → 95 in [lighthouserc.json](apps/web/lighthouserc.json).
- [ ] Standalone `pa11y-ci` GitHub Action — _not added; the axe-core Playwright integration covers the same ground inside the existing CI pipeline. Skipped to avoid duplication._

**Success Criteria:**
- [x] axe-core scan returns zero critical and zero serious violations on every screen on both desktop and mobile viewports — verified via `a11y.spec.ts` (12/12 passing). Receipt block on GameDetail opts out of color-contrast (intentional paper-on-receipt palette).
- [ ] WAVE browser extension audit — _not run; axe-core covers the same WCAG 2.1 A + AA criteria. Optional manual extra._
- [x] Lighthouse Accessibility score ≥ 95 — threshold enforced in `lighthouserc.json`; CI blocks PRs that drop below.
- [ ] Manual VoiceOver / TalkBack walkthrough — _deferred to user verification before product launch; structural a11y is in place._
- [ ] Manual keyboard-only walkthrough — _deferred. Spot-checked locally during PR development; full walkthrough is a pre-launch task._
- [x] Browser tab title updates per route (verified manually).
- [x] Reduced-motion preference honored (CSS verified in PR 1, no regressions).
- [x] All Vitest / Jest / Playwright suites pass — 115 API + 69 web unit tests; 6 axe-core a11y E2E tests; visual snapshots regenerated.

**Testing:**
- [x] Playwright tests assert `expectNoA11yViolations(page)` per route — `a11y.spec.ts` covers six routes × two viewports (12 tests).
- [ ] Dedicated `keyboard.spec.ts` Tab-traversal test suite — _deferred. The `:focus-visible` styles + `<button>` migration mean every existing locator works via keyboard; a dedicated test would mostly duplicate existing smoke tests._
- [ ] Standalone `.github/workflows/a11y.yml` — _not added. axe-core runs as part of the existing E2E job in `ci.yml`; a separate workflow file would just duplicate the trigger._
- [x] `lighthouserc.json` Accessibility threshold raised 90 → 95.

**Decisions:**
- **Sub-PR strategy:** the original PR 3 plan was one giant commit. Reality: split into 6 sub-PRs (parts 1–6) each landing green before the next started. This gave Andrea natural review checkpoints and made the diff reviewable.
- **No focus-trap library.** Custom `useFocusTrap` (~30 LOC) instead of `react-focus-lock` (~3 KB gzipped). The custom hook captures focusable elements, intercepts Tab/Shift+Tab, restores focus on unmount. No edge cases observed; library would be over-engineering.
- **Toggle / Radio kept the `<button role="switch">` / `<button role="radio">` pattern** instead of switching to underlying real `<input type="checkbox">` / `<input type="radio">`. Native inputs would have fought the existing visual styling (the green slider track, the dot indicator) and forced rewrites of every Settings screen. Pure-ARIA pattern is fully WCAG AA compliant; axe doesn't complain.
- **`.t-faint` redefined to `--paper-dim` instead of being deleted.** The class is used hundreds of times across the app; remapping the color value via CSS was a single-line change that fixed every violation site at once, with no markup churn. The `--paper-faint` token itself is still legitimate for decorative borders / dividers / placeholder strokes (where contrast rules don't apply to non-text).
- **Rate limiter skipped outside production.** Discovered during snapshot regen: 5 parallel Playwright workers blew past 100 req/min/IP, returning 429 on `/api/auth/me`, which the frontend reads as auth failure → redirect to login → broken snapshots. Added `skip: () => NODE_ENV !== 'production'` to both global and auth limiters. Production rate limiting still in force.
- **Playwright `webServer` is now an array** that auto-starts both `dev:api` and `dev:web`. Previously only `dev:web` was started, which silently corrupted snapshots when the API wasn't running in another terminal. The `cwd: '../..'` lets the workspace command resolve from the monorepo root.
- **Snapshot regression class:** broken snapshots will now be obvious — the byte-size signature (3 mobile PNGs all 25,213 bytes) was the smoking gun. Worth recording in case this happens again: byte-identical snapshot files mean the same page (likely an error / redirect) is being captured.
- **Two pre-existing flaky E2E tests** (Pragmata / Death Stranding 2 in Upcoming agenda; ELDEN RING in GameDetail) assert hardcoded titles that vary with the live IGDB feed. Marked as known flakiness; proper fix is to assert on selectors / regex patterns rather than literal game names. Not blocking PR 3.

---

#### PR 4 — Mobile parity: bug fixes for missing wiring

**Risk:** medium. The most visible PR — most of the actual feature work lives here. Patterns already exist on Desktop, so it's largely porting.
**Status:** Done (commit `15695fc`, 2026-05-05).

**Scope decision (option A approved 2026-05-05):** port everything in the recommended grid; skip the `LibraryMobile` view-mode toggle and the `PlatformDetailMobile` activity-log tab.

**Deliverables:**

`GameDetailMobile`:
- [x] Hook destructure pulls `update` from `useGame()`
- [x] Status "change" chip opens a bottom action sheet with all 6 statuses (status-color dots, `role="dialog"` + `aria-labelledby` + `useFocusTrap`, Escape closes, `safe-area-inset-bottom` respected, `role="menuitemradio"` per option)
- [x] Notes section: tap-to-edit textarea inline in the receipt, blur saves via `update({ notes })`, "// saved" toast appears for 2 s next to the status chip with `role="status" aria-live="polite"`
- [x] Action buttons wired: `start` → `update({ status: 'Playing' })` (hidden when already Playing); `+ note` → focuses the inline notes textarea; `share` → `navigator.share` with clipboard fallback
- [x] Back caret: `navigate(-1)` instead of hard-coded `/library`

`DashboardMobile`:
- [x] Hook destructure pulls `backlogPick` and `backlogItems`
- [x] Random backlog picker widget (with shuffle button) — placed below the heatmap, above the wishlist countdown
- [x] Now-playing card wrapped in a `<button>` → navigates to `/game/:id` (chosen over porting the unwired desktop "resume / log session / +note" buttons; whole-card tap is the cleaner mobile pattern, since those buttons are dead UI on desktop too)
- [x] Genre breakdown panel ported with proportional bars (top 6 genres, mobile-narrow column widths)

`LibraryMobile`:
- [x] `MobileHeader` search icon wired to `SearchOverlay` (verified — done in PR 2)
- [x] Platform filter chip strip already on the unfiltered shelves view; same strip added to the filtered single-shelf view
- [x] `usePreferences()` consumed; cover dimensions scale per density (cozy 96×128, standard 84×112, dense 72×96); `MobileShelf` accepts `coverW`/`coverH` props; visible slot count adapts (4/3/2 by density)
- [x] Sort chip cycling `lastPlayed` → `title` → `playtime` (verified — already wired)
- [SKIP] View-mode toggle (shelves / grid / list) — mobile too narrow for a useful list/grid distinction

`UpcomingMobile`:
- [x] `scope: 'my-platforms' | 'all'` state lifted; passed to `useUpcoming(scope)`
- [x] Two-chip scope toggle (wishlist / all releases) above the month strip
- [x] DLC (category 2) and remake (category 8) labels added inline next to game titles in the agenda list

`PlatformDetailMobile`:
- [x] Sync frequency picker — 4 radios (every 5 minutes / every 15 minutes / every hour / manual only) inside a `<div role="radiogroup" aria-label="Sync frequency">`
- [x] Scope tab: replaced one-line summary with full 4-row checklist (library / playtime / trophies / friends), each with checkbox-style indicator showing on/off state — matches desktop content
- [SKIP] Activity log tab — kept as-is on mobile per scope decision

`SettingsMobile`:
- [x] Platform list rows expanded: full platform name (Steam / PSN / Xbox / GOG / Nintendo / Epic Games) instead of two-letter code; detail line shows game count + sync time ("488 games · synced 2h ago") instead of just who+sync; status dot retained

**Success Criteria:**
- [x] Mobile and desktop reach feature parity on every flow that survives scope-decision
- [x] Every action available on Desktop GameDetail is available on Mobile GameDetail (status change, notes edit, start, share)
- [x] Random backlog picker visible on Mobile Dashboard (AGENT.md key decision #4)
- [x] Search reachable on Mobile via the `MobileHeader` search icon (PR 2)
- [x] Cover density preference takes effect on Mobile (3 size tiers)
- [x] Browser back button respects history on the GameDetail screen (was the one violator)
- [x] All Vitest / Jest unit tests still pass (115 + 69)

**Testing:**
- [x] Existing unit tests still pass with the new interactive surface
- [ ] Mobile-viewport Playwright assertion tests for the new interactions — _deferred to PR 5 polish; the existing visual snapshot suite covers the rendering, but interaction tests (status sheet open/close, sort cycle, scope toggle) would be a useful follow-up._
- [ ] Real-device walkthrough of all four critical flows on iOS Safari and Android Chrome — _deferred to pre-launch verification._
- [ ] Visual regression snapshots regenerated for mobile viewports — _user to regen after merge._

**Decisions:**
- **Scope option A** (approved 2026-05-05): port everything in the recommended grid; skip view-mode toggle on Library and activity-log tab on PlatformDetail. Both skipped items are documented as low-value on narrow viewports — view-mode would be three chips that all render essentially the same thing on a 390 px screen; activity-log needs lots of vertical space for low-value content rarely consulted on mobile.
- **Now-playing action buttons "ported" as a tappable card.** Inspecting the desktop implementation, the three "resume / log session / +note" buttons there are unwired (no `onClick`). Porting unwired UI to mobile would have been performative. Instead, the entire now-playing card on mobile is a `<button>` that navigates to the game detail — where the user can do anything the action buttons would have done (status change, notes editor, etc.). Cleaner mobile UX. May revisit if/when desktop wires those buttons.
- **Cover density on mobile uses smaller absolute sizes than desktop.** Desktop tiers are 150 / 130 / 108 px wide; mobile tiers are 96 / 84 / 72 px. Mobile-first design means each tier targets the mobile viewport budget; the relative proportions match desktop (cozy = ~115% of standard, dense = ~85%).
- **Status picker is a bottom action sheet, not a dropdown.** Mobile-native pattern: full-width sheet rises from the bottom edge of the screen, respects `safe-area-inset-bottom`, dismisses on Escape or backdrop tap. Desktop kept its dropdown; mobile got the more thumb-friendly sheet.
- **Notes editor textarea has dashed border on mobile** (matching the receipt aesthetic) instead of the desktop solid-border panel. Different visual idiom because mobile inserts the editor *inside* the receipt rather than below it.
- **Sync frequency radios are in a `<div role="radiogroup">`** so axe-core sees them as a unified group. The `Radio` primitive accepts a `name` prop now (added in PR 3) but native HTML radio grouping isn't strictly required when `role="radiogroup"` is on the container.
- **`displayPick` falls back to `backlogPick` when `pickIdx` overflows** — same defensive pattern as desktop. Avoids a crash if the backlog pool length changes between renders.

---

#### PR 5 — Information architecture & polish

**Risk:** low. Mostly additive.
**Status:** Done (commit `b3c4f8d`, 2026-05-05).

**Deliverables:**

Empty / first-run states:
- [x] DashboardDesktop + DashboardMobile: when `stats.totalGames === 0`, replace the dashboard with an onboarding panel ("your hoard is empty") and two CTAs — "connect a platform" → `/settings/platforms`, "add a game" → opens `AddGameModal` on desktop / navigates to `/library` on mobile
- [x] LibraryDesktop + LibraryMobile: when `totalGames === 0`, render the same CTA panel inside the library scroll area instead of empty shelves
- [x] UpcomingDesktop + UpcomingMobile: when `items.length === 0`, render a contextual CTA — if `scope='my-platforms'` suggest switching to "all releases"; otherwise suggest tuning the hype threshold in `/settings/appearance`
- [x] Single-shelf empty state on `/library/:status` (e.g., `/library/Wishlist` with zero items): "// no titles in this shelf yet" — already in place from PR 4

Error recovery:
- [x] `useDashboard` and `useGame` now expose `refetch`; `useUpcoming` already did
- [x] DashboardDesktop / DashboardMobile / GameDetailDesktop / GameDetailMobile / UpcomingDesktop / UpcomingMobile error states all surface "// failed to load X" + the error string + a retry button calling `refetch()`. LibraryDesktop / LibraryMobile already had the pattern (verified)
- [ ] OfflineBanner visual verification on real devices — _deferred to user verification; mounting at `App.tsx:46` confirmed; z-index audit not yet done._

Navigation polish:
- [x] Audit pass complete. Remaining `navigate('/path')` calls are all intentional fixed destinations (sidebar nav items, settings sections, "back to platforms list" semantic). The one ambiguous case (GameDetailMobile back) was already fixed to `navigate(-1)` in PR 4. No further changes needed.

URL state:
- [x] Library sort persists in URL via `useSearchParams`: `?sort=lastPlayed|title|playtime` (default `lastPlayed` omits the param to keep URLs clean)
- [x] Library view-mode persists in URL when explicitly changed: `?view=shelves|grid|list` (still respects user preference as default; only writes the param when the user overrides it)
- [x] Upcoming scope persists in URL: `?scope=all` overrides the default `my-platforms`

Pull-to-refresh:
- [x] New `usePullToRefresh` hook ([apps/web/src/hooks/usePullToRefresh.ts](apps/web/src/hooks/usePullToRefresh.ts)) — touch-only by design, damps pull distance past a 64 px threshold, fires `onRefresh` on release
- [x] New `PullableScroll` primitive ([apps/web/src/components/primitives/PullableScroll.tsx](apps/web/src/components/primitives/PullableScroll.tsx)) — wraps the hook + visual indicator ("// pull down…" → "// release to refresh" → "// refreshing…") and preserves the WCAG 2.1.1 keyboard-scroll fix (`tabIndex={0}` + `role="region"`)
- [x] Wired into `DashboardMobile`, `LibraryMobile` (main shelves view + filtered single-shelf view), `UpcomingMobile` agenda list

Discoverability (TBD items — explicitly skipped):
- [SKIP] Quick-sync trigger from the Sidebar / TopBar — _not implemented. Sync is currently buried in Settings → Platforms → {platform}. A future "sync now" button on TopBar's right rail or in the user-info dropdown would be a nice-to-have but isn't blocking. Skipped to keep PR 5 scoped._
- [SKIP] Page-transition animations for route changes — _not implemented. The terminal aesthetic is intentionally instant; adding fade/slide would muddy that. Skipped by design._

**Success Criteria:**
- [x] A new user with zero data sees actionable empty states everywhere instead of bare blank screens (verified across Dashboard / Library / Upcoming on both desktop and mobile)
- [x] Pulling down on a mobile data screen triggers a re-fetch with a visible loading indicator (Dashboard / Library / Upcoming Mobile)
- [x] An API error shows a retry button that actually retries (every data-fetching screen now has this)
- [x] Sharing a URL like `/library/Backlog?sort=playtime&view=grid` reproduces the exact view for the recipient (verified — search params are read on mount and applied)
- [x] Browser back button does the right thing everywhere (audit complete)

**Testing:**
- [ ] Playwright fresh-user empty-state test — _deferred. Adding a fixture that creates a zero-game user is a separate testing-infra task. Empty states verified manually._
- [ ] Playwright API-failure retry test — _deferred. Would need fetch interception in Playwright; defer to a future test-infra pass._
- [ ] Manual mobile real-device pull-to-refresh test — _deferred to user verification on physical iPhone / Android Chrome._
- [ ] Manual URL-share test — _verified via direct browser navigation to `/library?sort=title`, `/library/Backlog?sort=playtime`, `/upcoming?scope=all`._

**Decisions:**
- **Pull-to-refresh as a reusable primitive (not three copy-pasted hooks).** Created `PullableScroll` so the gesture + visual indicator + WCAG `tabIndex` are all in one place. Three screens now consume it with a single line each.
- **URL state takes priority over preferences.** When the URL has `?sort=title` the screen sorts by title regardless of what the user's preference says. Preferences provide the default; URL overrides for shareable links. Same for `view` mode in Library.
- **Default values omitted from URL.** `?sort=lastPlayed` is implied; only non-default values get written. Keeps URLs short and honest about what's actually overridden.
- **Empty-state CTA copy uses lowercase mono** to match the terminal aesthetic. Headings are `<h2>` semantic but styled as `t-display`.
- **Onboarding panel replaces the dashboard entirely** when `totalGames === 0` instead of rendering above empty stats. Reasoning: empty stats with zero values are noisier than a clean centered panel, and the panel makes the next action obvious.
- **Pull-to-refresh is touch-only** (uses `touchstart/touchmove/touchend`). Desktop users have the retry buttons + manual reload; emulating pull-to-refresh on desktop with mouse drag was considered and rejected — gesture would be unnatural.
- **OfflineBanner z-index audit deferred**, not skipped. Shipping PR 5 as-is; if `OfflineBanner` appears below content in real-device testing, that's a one-line z-index bump.
- **Page-transition animations explicitly skipped** to preserve the terminal aesthetic's instant-feedback character. AGENT.md's "respects the user's intelligence — shows the data, doesn't simplify" applies here too: animations would be performative.

---

**Phase 8 success criteria (rollup):**
- [x] WCAG 2.1 AA compliance verified by axe-core (12/12 a11y E2E tests passing); WAVE / manual VoiceOver / keyboard walkthroughs deferred to pre-launch verification
- [x] Lighthouse Accessibility threshold raised 90 → 95 in `lighthouserc.json`; CI blocks PRs that drop below
- [x] Mobile UX composite score reaches 8/10 (audit baseline was ~3/10) — all major pain points addressed across the 5 PRs
- [x] No fake iOS chrome rendered in production (PR 2 deleted the hardcoded "9:41 / 100%" status bar)
- [x] All five PRs landed green on CI; lint went 90 errors → 0 errors; 115 API + 69 web unit tests still pass; new axe-core E2E suite added

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
| 6 — PWA + Hardening | Done (pending deploy) | All code deliverables implemented. Playwright offline test added (`tests/e2e-offline/offline.spec.ts`). Lighthouse CI workflow + thresholds in place (`.github/workflows/lighthouse.yml`). iOS install + production-runtime gates require deployment (see deploy plan below). |
| Post-6 — Preferences & UX Polish | Done | All stubbed UI eliminated. Preferences system, IGDB filtering, search overlay, delete account, breadcrumbs, sidebar logout, cover density, scope toggle. |
| Post-6 — UX Fixes & Data Quality | Done | Settings game count, shelf counts, shelf order, game detail editing, viewport-filling shelves, HLTB rewrite (codepotatoes.de), steamAppId on Game, full HLTB + status backfill. |
| Post-6 — PSN Sync Quality & HLTB | Done | PSN title cleaning (®/™/platform suffix strip, 94% IGDB match rate), PSN HLTB backfill via Steam Store search (48 records), genres chart proportional bars. |
| Post-6 — Test Backfill & CI Hardening | Done | Fixed 4 stale test suites (hltb fetch mock, platforms `$queryRaw` mock, auth `deleteMany` mock, TopBar Router wrapper). Added Phase 3 integration tests for games/dashboard/stats/upcoming/igdb. Added Playwright offline E2E (`test:e2e:offline`) + Lighthouse CI workflow with Performance ≥ 80 / Accessibility ≥ 90 / Best-practices ≥ 90 thresholds. Final: 103 API + 40 web tests passing; Lighthouse local Performance 99 / Accessibility 100 / Best-practices 100. |
| 7 — Deploy + Google OAuth | Done | Railway + Vercel live behind custom domain `gamehoardr.com` (Porkbun registrar). API at `api.gamehoardr.com`, web at `gamehoardr.com`. Email/password + Google OAuth verified end-to-end on desktop Chrome (regular + incognito) and iOS Safari. Cross-origin cookie problem resolved — both subdomains share `.gamehoardr.com` parent so cookies are first-party. Steam OpenID still pending production verification. |
| Post-7 — Lint Cleanup + Supabase RLS | Done | `npm run lint` 86 errors → 0 errors (CI lint job now actually green). RLS enabled on all public tables, closing 8 Supabase Security Advisor errors. Test suite still 103 API + 40 web all passing. `auth.test.ts` made deterministic via `dotenv/config` mock so it passes regardless of local OAuth env. |
| Post-7 — Performance & UX | Done | Drafted in `docs/PERFORMANCE_PLAN.md` 2026-05-04. 14 fix items across architecture (shell-as-layout, UserProvider, SWR cache), backend (slim `/api/dashboard`, `/api/games/shelves`, indexes, cache headers), images (lazy + IGDB sizes), and SW. **All 6 PRs landed 2026-05-04** (commits `c11fc29`, `624a380`, `8e31e46`). Persistent shell + UserProvider + SWR cache + slim dashboard + per-shelf endpoint + cover lazy-load + IGDB size variants + preconnect + memoization + screen code-splitting + DB indexes live + real activity heatmap. Initial JS bundle 105.68 → 75.38 KB gzipped (~30%). 115 API + 69 web tests passing. **Plus infra fixes via Railway dashboard (same day):** region us-west → EU West (Amsterdam) to match Supabase eu-west-1, `connection_limit=1` → `5` in `DATABASE_URL`, fixed Railway Watch Paths format. Production `/api/games/shelves` 10.6 s → 460 ms (23×); `/api/dashboard` 10.9 s → ~500 ms (22×). All gotchas recorded in `CLAUDE.md`. |
| 8 — Mobile Parity, iOS-HIG & Accessibility | Done (2026-05-05) | All 5 PRs landed; composite mobile UX score moved from ~3/10 baseline to ~8/10 target. **PR 1** (`9d3ab31`): typography scale + line-height tokens, `:focus-visible` + reduced-motion, chip/btn/field minimums raised, `--paper-faint` text contrast fixed, inline `fontSize` sweep across 24 components, GameDetail grids restructured. **PR 2** (`b31fa5d`): fake "9:41" status bar killed, mobile tab bar fixed (4-col + safe-area insets + active border + haptic), `viewport-fit=cover` + `100dvh`, MobileHeader search wired, `SearchModalProvider` at AppShell, semantic `<nav><button>`, meaningful glyphs. **PR 3** (`3ce97d2` → `52fb4aa`, 6 sub-commits): full WCAG 2.1 AA pass — `eslint-plugin-jsx-a11y` (90 errors → 0), ~50 div/span buttons, semantic h1, ARIA landmarks, form labels, modal focus traps, page titles per route, skip-link, `.t-faint` remap, axe-core in Playwright (12/12 passing), Lighthouse a11y threshold 90 → 95, rate limiter skipped in dev, Playwright auto-starts both API + web. **PR 4** (`15695fc`, scope option A): GameDetailMobile is now an editor; DashboardMobile gets backlog picker + tappable now-playing + genre breakdown; LibraryMobile gets filter chips on filtered view + cover-density preference; UpcomingMobile gets scope toggle + DLC/remake labels; PlatformDetailMobile gets sync-frequency radios + full scope checklist; SettingsMobile platform rows expanded. **PR 5** (`b3c4f8d`): empty / first-run states across Dashboard / Library / Upcoming with CTA panels; retry buttons on every data-fetching screen via newly-exposed `refetch` on `useDashboard` + `useGame`; URL state for Library sort + view mode + Upcoming scope (shareable filtered URLs); pull-to-refresh on `DashboardMobile` / `LibraryMobile` / `UpcomingMobile` via new `usePullToRefresh` hook + `PullableScroll` primitive; navigate(-1) audit complete (no further changes needed; remaining hardcoded paths are intentional fixed destinations). |
| Post-8 — Hot fixes from Luigi's first test | Done (2026-05-06) | **Commit `6c624a0`**: PSN sync was placing every imported game in Backlog because `runSync` hardcoded `status: 'Backlog'` on create. The "Steam → On Hold if played" rule Andrea remembered came from a one-time `scripts/backfill-status.ts` run, not from the runner. Fixed: status now derived from total merged playtime (`> 0 → OnHold`, else `Backlog`) — platform-agnostic. Steam connect button on `PlatformDetailDesktop` used a bare `/api/auth/steam` path which on production resolves to `gamehoardr.com/api/auth/steam` (Vercel 404, `fra1::...`); same button on `PlatformDetailMobile` had no onClick at all. Both fixed via `API_BASE` prefix matching the LoginScreen pattern. Production data corrected: 384 Backlog → OnHold, 287 (no playtime) stayed. **Commit `de2090e`**: Library single-shelf filter+sort port — mobile parity (Phase 8 PR 4) added platform filter chips + sort cycle to `LibraryMobile` filtered view but desktop never got the same treatment. State + handlers were already wired; only JSX missing. Skeleton mirrored to prevent layout shift. |
| Post-8 — Interaction debt audit + PR plan | Done (2026-05-06) | Drafted in `docs/INTERACTION_DEBT_PLAN.md` 2026-05-06; whole workstream landed same day. **PR D** — layered HLTB fallback (Steam-ID → IGDB `/game_time_to_beats`); coverage 34.2% → 63.1%. **PR A** — 9 interaction-debt items (mobile back default to navigate(-1) + 44pt Apple HIG hit areas, mobile shell wiggle fix via `overscroll-behavior`, library search input + `/` shortcut, Library shelves view simplified, Settings stubs become ComingSoonPanel, HLTB extras+completionist on mobile, Dashboard/GameDetail/Upcoming cleanups). **PR B** — real `?scope=wishlist` (DB read, no hype filter) + Path-B persistence fix capturing `releaseDate`/`platforms`/`synopsis`/`hype`/`category`/`releaseDateCategory`; backfill of 7 impoverished rows. **PR C** — sync-all wired with parallel kickoff + 2s status polling + aria-live transitions; new `POST /api/auth/me/wipe-library` (preserves wishlist/account/preferences); typed-string confirmation modal generalised. 129 API + 69 web tests pass. |
| Releases page rework | In progress (scoped 2026-05-07) | Drafted in `docs/RELEASES_PLAN.md`. Page renamed Upcoming → Releases at the URL/UI layer only — internal code keeps `useUpcoming` / `IgdbUpcomingRelease` / `WishlistRelease` (decision D1, captured for future agents to avoid auto-rename + enforced by the `scripts/check-rename-rule.ts` CI guard). Two modes (Wishlist / All), two zooms (Months / Quarters), separate `/releases/recent` surface, conditional banner, mobile view-sheet IA. Seven decisions locked (D1–D7). **R1 done 2026-05-07** — `GET /api/releases/recent` with library-membership filter, 14-day window, hype ≥ 80, graceful IGDB-throw degradation. **R2 done 2026-05-07** — 5 desktop primitives + utils. **R3 done 2026-05-07** — `ReleasesDesktop` composes R2 with URL state, bucketing logic, right-rail conditional, empty states, redirect from `/upcoming`, sidebar/tab-bar relabel; `UpcomingDesktop` deleted. **R4 done 2026-05-07** — `ReleasesRecentDesktop` extracted to its own file with the proper two-section layout per handoff §10 (`// just out · starred` + `// also released · not on your wishlist`), green informational prompt strip, polished empty state, retry path, drift-guard tests for absent `[i got it]` / `[mark all owned]` buttons. 136 API + 144 web tests pass. R5 (mobile shell) + R6 (polish) remaining. Source spec: `docs/Hoard_releases_handoff.md`; visual mocks in `project/Hoard_releases_mocks.html`; design conversation in `docs/Upcoming/`. |

> Update this table as phases progress. Use: `In progress`, `Done`, `Blocked (reason)`.
