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
| `/settings` | Account / platforms | **Blocked pending design** |
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
- [x] `packages/db`: Prisma initialized, schema defined, pending Supabase connection + first migration
- [x] `packages/types`: shared `GameStatus`, `PlatformCode`, `UserGame`, `Game` interfaces
- [x] Environment variables documented in `docs/ENV.md`
- [x] GitHub Actions CI: lint + typecheck on every PR
- [x] `.env.example` files in `apps/web` and `apps/api`

**Success Criteria:**
- `GET /health` returns 200 from the Railway production URL
- Frontend Vercel URL renders without console errors
- `npx prisma migrate deploy` runs cleanly against Supabase
- `npm run typecheck` passes in all packages with no errors
- `npm run lint` passes with no errors

**Testing:**
- Manual smoke test of `/health` endpoint
- CI runs lint + typecheck — must be green before proceeding

---

### Phase 1 — Design System & Component Library

**Goal:** Every visual primitive from the design files exists as a typed, reusable React component. This is the foundation all screens are built on.

**Design source:** `project/styles.css` (tokens + utility classes), `project/primitives.jsx` (component logic).

**Deliverables:**

CSS (`apps/web/src/styles/`):
- [ ] `tokens.css` — all CSS variables (`--void`, `--ink`, `--paper`, `--amber`, `--green`, `--red`, `--blue`, `--mono`, `--sans`, `--display`, etc.)
- [ ] `global.css` — base reset, body styles, utility classes (`.t-display`, `.t-mono`, `.t-up`, `.t-dim`, `.t-faint`, `.t-ghost`, `.t-amber`, `.t-green`, `.t-red`, `.t-tnum`, `.hoard-noise`, `.thin-scroll`, etc.)
- [ ] All component-level classes (`.panel`, `.chip`, `.btn`, `.plat`, `.cover-ph`, `.prog`, `.gauge`, `.heat-cell`, `.receipt`, `.barcode`, `.marker`, `.bignum`, `.shelf-label`, `.hr-dot`, `.hr-dash`, `.hr-solid`, `.hr-double`, `.brackets`, `.kv`, `.field`, `.ascii`, `.spark`, `.sidebar`, `.topbar`, `.m-status`, `.m-tabbar`, `.status-sigil`)

Primitive components (`apps/web/src/components/primitives/`):
- [ ] `Icon` — SVG icon system; all icons from `ICON_PATHS`; props: `name`, `size`, `fill`, `stroke`, `sw`, `style`, `className`
- [ ] `StatusSigil` — dot + label; props: `status` (GameStatus), `label` (bool)
- [ ] `Plat` — platform badge; props: `code` (PlatformCode), `lg` (bool)
- [ ] `Cover` — placeholder cover with stripes; props: `w`, `h`, `label`, `year`, `dev`, `bright`
- [ ] `Hr` — divider; props: `kind` (dot | dash | solid | double)
- [ ] `Marker` — small-caps section label; props: `children`
- [ ] `Chip` — filter chip; props: `on`, `tone` (amber | green | red), `solid`
- [ ] `Btn` — button; props: `variant` (primary | amber | green), `sm`
- [ ] `KV` — key-value grid; props: `rows: [string, ReactNode][]`
- [ ] `Gauge` — segmented bar; props: `total`, `filled`, `tone`
- [ ] `Heatmap` — activity heatmap; props: `weeks`, `days`, `density`
- [ ] `Barcode` — decorative barcode; props: `code`, `height`
- [ ] `HypeBars` — 5-segment hype indicator; props: `n`

Layout components (`apps/web/src/components/layout/`):
- [ ] `Sidebar` — desktop nav; props: `active` (screen name)
- [ ] `TopBar` — desktop topbar; props: `crumbs`, `right`
- [ ] `MobileFrame` — mobile shell container
- [ ] `MobileTabBar` — bottom tab nav; props: `active`
- [ ] `MobileHeader` — mobile screen header; props: `title`, `sub`, `back`, `right`

**Success Criteria:**
- Every component renders without errors at its default props
- All components are fully typed — no `any`, props interfaces exported
- Utility classes produce the correct visual output (verified against design CSS)
- Fonts load correctly (JetBrains Mono, IBM Plex Sans, Major Mono Display via Google Fonts)
- `npm run typecheck` still passes

**Testing:**
- Vitest: smoke render test for every component (renders without throwing)
- TypeScript strict mode: zero `any`, all props explicitly typed
- Visual check: render each component against the design source

---

### Phase 2 — Frontend Shell (Static Screens + Routing)

**Goal:** All four screens exist as pixel-accurate static views. Navigation works. No real data yet — mock data matches the design prototypes.

**Deliverables:**
- [ ] React Router v6 with routes per the table above
- [ ] Responsive breakpoint hook (`useBreakpoint`) returning `desktop | mobile`
- [ ] Mock data module (`src/lib/mockData.ts`) matching every data shape from the design files exactly (same game titles, same numbers, same counts)
- [ ] `DashboardDesktop` + `DashboardMobile` — pixel-accurate, including the random backlog picker widget (one suggested game from backlog + shuffle button; weighted toward shorter HLTB and already-started games)
- [ ] `LibraryDesktop` + `LibraryMobile` — all 6 shelves, correct HLTB hints on backlog
- [ ] `UpcomingDesktop` + `UpcomingMobile` — featured card, timeline, agenda, month tabs
- [ ] `GameDetailDesktop` + `GameDetailMobile` — receipt-style, HLTB block, per-platform playtime
- [ ] Navigation: sidebar links (desktop) and tab bar (mobile) navigate between routes
- [ ] `manifest.json` stub (name, icons, display: standalone, theme_color: #07090a)
- [ ] Base service worker registered (no caching logic yet — Phase 6)

**Success Criteria:**
- All four routes render without console errors or React warnings
- Visual output matches each artboard in the design files (checked by side-by-side comparison)
- Sidebar active state updates correctly per route
- Mobile tab bar active state updates correctly per route
- Responsive switch at 1024px works correctly (desktop vs mobile layout)
- `npm run typecheck` passes
- No prop type errors

**Testing:**
- Playwright E2E: visit `/`, `/library`, `/upcoming`, `/game/1` — assert page title and one key element per screen
- Playwright visual regression: screenshot each screen at 1440×900 and 390×844 — baseline snapshots committed to repo
- TypeScript strict typecheck

---

### Phase 3 — Data Model & Backend API

**Goal:** Full CRUD API backed by Prisma and Supabase. Frontend switches from mock data to real API calls.

**Data model:** see `AGENT.md` → Data Model section for the full Prisma schema (User, Platform, Game, UserGame, HltbData, WishlistRelease).

**Deliverables:**

Database:
- [ ] Final Prisma schema matching the model in `AGENT.md`
- [ ] Seed script (`packages/db/seed.ts`) — creates one test user, connects mock games matching the design mock data
- [ ] Migration: `prisma migrate dev` creates schema cleanly

API routes (`apps/api/src/routes/`):
- [ ] `GET /api/games` — user's full library; query params: `status`, `platform`, `sort` (lastPlayed | title | playtime), `page`, `limit`
- [ ] `GET /api/games/:id` — single game record with HLTB and per-platform playtime
- [ ] `PATCH /api/games/:id` — update `status`, `notes`, `rating`
- [ ] `GET /api/dashboard` — returns: `{ totalOwned, playtimeByPlatform, activeGame, shelfCounts, recentActivity, wishlistDropping, backlogPick }`
- [ ] `GET /api/upcoming` — upcoming releases; query: `platform`, `month`, `wishlistedOnly`
- [ ] `POST /api/upcoming/:igdbId/wishlist` — toggle wishlist tracking
- [ ] `GET /api/stats` — full stats block (genre breakdown, completion ratio, heatmap data)

Frontend API client (`apps/web/src/lib/api.ts`):
- [ ] Typed fetch wrapper for every endpoint above
- [ ] All screens switch from `mockData` to live API calls
- [ ] Loading states: skeleton placeholders while data fetches
- [ ] Error states: simple error message when API fails

**Success Criteria:**
- `GET /api/dashboard` returns all fields required to render `DashboardDesktop` with no undefined values
- `GET /api/games?status=Backlog` returns only backlog items
- `PATCH /api/games/:id` with `{ status: "Playing" }` persists the change and returns updated record
- All routes return proper HTTP codes: 200 (ok), 400 (bad input), 401 (unauthenticated), 404 (not found), 500 (server error)
- Frontend screens render identically with live data as they did with mock data (same game titles in the seed)
- `prisma migrate deploy` runs cleanly with no manual intervention

**Testing:**
- Jest + Supertest integration tests:
  - Happy path for every route
  - 404 for unknown game ID
  - 400 for invalid status value in PATCH
  - Pagination: `GET /api/games?page=2&limit=5` returns correct slice
- Test database: isolated Supabase test branch, seeded before each test run
- Frontend: Vitest with mock API responses for each screen (verify correct rendering)

---

### Phase 4 — Auth & Platform Integrations

**Goal:** Users can register, log in, connect their gaming accounts, and trigger a library sync.

**Deliverables:**

Auth:
- [ ] `POST /api/auth/register` — email + password, returns JWT in HTTP-only cookie
- [ ] `POST /api/auth/login` — email + password
- [ ] `POST /api/auth/logout` — clears cookie
- [ ] `GET /api/auth/me` — returns current user
- [ ] Google OAuth: `GET /api/auth/google` → Google consent → `GET /api/auth/google/callback` → JWT cookie
- [ ] Steam OpenID: `GET /api/auth/steam` → Steam OpenID → `GET /api/auth/steam/callback` → JWT cookie (reuses the OpenID infrastructure already needed for the Steam library integration)
- [ ] Auth middleware: protects all `/api/*` routes except `/health`, `/api/auth/*`
- [ ] Frontend `/login` route — login/register page; styled with the design system; shows email/password form plus "Continue with Google" and "Continue with Steam" buttons

Platform integrations (`apps/api/src/services/platforms/`):
- [ ] `steam.ts` — OpenID OAuth flow; Steam Web API `IPlayerService/GetOwnedGames`; maps to `UserGame` records
- [ ] `psn.ts` — NPSSO token input (user pastes it manually); `psn-api` npm package; `getUserTitles`. The NPSSO flow requires the user to retrieve a token from their browser's cookie storage after visiting the PSN website — this step must have clear inline instructions in the UI (not a link to docs).
- [ ] `xbox.ts` — OpenXBL API key; library endpoint; maps to `UserGame` records
- [ ] `gog.ts` — GOG community OAuth; library fetch from `api.gog.com`
- [ ] Manual add: `POST /api/games/manual` — accepts `{ igdbId, platformLabel, status }` where `platformLabel` can be any string including "Nintendo" or "Epic"; creates a `UserGame` without a linked sync platform
- [ ] Shared sync runner: deduplicate games across platforms by IGDB ID (matched via IGDB search on title), upsert `UserGame`
- [ ] Sync status endpoint: `GET /api/platforms/status` — returns sync state per platform (syncing | ok | error | stale | manual)
- [ ] `POST /api/platforms/:code/sync` — triggers a sync job for syncable platforms (STEAM, PSN, XBOX, GOG only)

Settings screen (frontend):
- [ ] **Blocked until design is delivered.** The layout will be designed first, then implemented here.
- [ ] `/settings` route — one card per platform (Steam, PSN, Xbox, GOG, Nintendo*, Epic*); shows connected/disconnected state, last sync time, connect/disconnect action
- [ ] PSN card: "Connect" opens an inline panel with step-by-step instructions for retrieving the NPSSO token from the browser (not a modal — inline, dismissable, with numbered steps and a code-formatted cookie name)
- [ ] Nintendo and Epic cards: marked as "manual only" — no connect button, just a label confirming games can be added via the manual add flow
- [ ] Manual add button: accessible from Library header — opens IGDB search, lets user pick game, choose platform label and status
- [ ] "Sync now" button per connected platform triggers `POST /api/platforms/:code/sync`
- [ ] Account section: change email/password, connected auth providers, danger zone (delete account)

**Success Criteria:**
- Email/password login returns a JWT cookie; subsequent requests to protected routes succeed
- Google OAuth flow completes and creates/logs in a user
- Steam OpenID flow completes and creates/logs in a user (same account used for library sync)
- Steam library sync completes and at least 1 game appears in the user's library
- PSN sync with a valid NPSSO token imports games; the inline NPSSO instructions in Settings are clear enough for a non-technical user to follow without external help
- Xbox sync with a valid OpenXBL key imports games
- GOG OAuth flow completes and imports games
- Manual add: IGDB search returns results; selecting a game with `platformLabel: "Nintendo"` creates a `UserGame` with no linked sync platform
- Sidebar shows correct sync status (ok / stale) and last sync time
- Games owned on multiple platforms are stored as a single `UserGame` with per-platform playtime
- Logging out clears the session; protected routes return 401 afterward

**Testing:**
- Unit tests for each platform adapter using mocked HTTP responses (nock or msw)
- Auth middleware test: protected route returns 401 without cookie, 200 with valid cookie
- Google OAuth: test callback handler with mocked Google token response
- Steam OpenID: test callback handler with mocked OpenID assertion
- Integration test: full Steam OAuth flow against a test Steam account (manual, documented in `docs/TESTING.md`)
- Manual add test: `POST /api/games/manual` with `platformLabel: "Nintendo"` creates a `UserGame` with `syncable: false`
- Deduplication test: two platforms returning the same game → one `UserGame` record

---

### Phase 5 — External Data (IGDB + HowLongToBeat)

**Goal:** All game metadata comes from IGDB. HLTB estimates are available on game detail and backlog items.

**Deliverables:**

IGDB (`apps/api/src/services/igdb.ts`):
- [ ] Twitch OAuth client credentials flow (token cached, refreshed on expiry)
- [ ] `searchGames(query)` — returns title, developer, release year, cover URL, genres, IGDB ID
- [ ] `getGame(igdbId)` — full metadata for one game
- [ ] `getUpcomingReleases(platforms, fromDate)` — returns games with future release dates
- [ ] Response cache: Redis or in-memory LRU (5-minute TTL for search, 24-hour for upcoming)
- [ ] Cover art: store IGDB `cover.url` in `Game.coverUrl`; `Cover` component uses real image if available

HowLongToBeat (`apps/api/src/services/hltb.ts`):
- [ ] `fetchHltb(title)` using the `howlongtobeat` npm package
- [ ] Background fetch: triggered when a `UserGame` is created or moves to `Playing` / `Backlog`
- [ ] Result stored in `HltbData`; refreshed if older than 30 days
- [ ] Failure mode: if HLTB returns no result or throws, store `null` — never show an error to the user
- [ ] HLTB data exposed on `GET /api/games/:id` and in the library backlog response

Frontend updates:
- [ ] `Cover` component accepts a `src` prop — renders real cover art when available, falls back to placeholder
- [ ] HLTB block on `GameDetailDesktop`/`GameDetailMobile` uses live data
- [ ] HLTB snippet on backlog library items uses live data
- [ ] Upcoming feed on Dashboard and Upcoming screen uses IGDB data

**Success Criteria:**
- IGDB search returns results in < 500ms (cache hit) and < 2s (cache miss)
- Real cover art renders on game cards (IGDB image URL loaded without CORS errors)
- HLTB data appears on the game detail view for any game in the top-100 most-played list
- If HLTB fails for a game, the detail view shows "—" in the HLTB block, no error visible
- Upcoming releases feed matches IGDB data (correct dates, correct platforms)
- No IGDB rate limit errors in normal use (≤ 4 req/s enforced)

**Testing:**
- Unit tests for IGDB client: mock Twitch token fetch, mock IGDB API responses
- Unit tests for HLTB service: mock `howlongtobeat` package; test graceful failure path
- Cache test: second call to `searchGames` with same query hits cache (no HTTP request fired)
- Integration test: live IGDB search for "Hollow Knight" returns a result with expected fields

---

### Phase 6 — PWA & Production Hardening

**Goal:** The app is installable, usable offline for cached views, and ready for real use.

**Deliverables:**

PWA:
- [ ] `manifest.json`: name "Hoard", short_name "hoard", display "standalone", background/theme `#07090a`
- [ ] Icons: 192×192 and 512×512 PNG (minimal — black background, monogram "H" in display font)
- [ ] Workbox service worker:
  - Cache-first: all static assets (JS, CSS, fonts)
  - Network-first with cache fallback: `GET /api/dashboard`, `GET /api/games`, `GET /api/upcoming`
  - Never cache: auth routes, PATCH/POST requests
- [ ] Offline banner: appears when network is unavailable, disappears when reconnected

Backend hardening:
- [ ] Input validation with Zod on every API route (body, query params)
- [ ] Rate limiting: `express-rate-limit` — 100 req/min per IP globally; 10 req/min on auth routes
- [ ] Request logging with pino (structured JSON logs)
- [ ] Error handling middleware: catches unhandled errors, returns `{ error: string }` with appropriate status code
- [ ] Health check: `GET /health` returns `{ status: 'ok', db: 'ok' | 'error', uptime }` — Railway uses this as readiness probe
- [ ] CORS: whitelist Vercel production URL and preview URL patterns

Frontend hardening:
- [ ] Error boundaries on each route — catches render errors, shows a minimal fallback
- [ ] Loading skeletons for all data-fetching screens (Dashboard, Library, Upcoming, GameDetail)
- [ ] Retry logic in API client: auto-retry once on 5xx errors
- [ ] `meta` tags: `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`

**Success Criteria:**
- App installs successfully on Chrome (desktop) and Safari (iOS)
- Dashboard and Library render from cache when network is offline
- Lighthouse PWA score ≥ 90
- Lighthouse Performance score ≥ 80 on desktop
- API request with missing required field returns `400 { error: "..." }` with a descriptive message
- API request with no auth cookie returns `401`
- Injecting 1000 requests/min hits the rate limiter and returns `429`
- No unhandled promise rejections in production logs after 24h of use

**Testing:**
- Playwright: simulate offline (`page.route('**/*', r => r.abort())`) — assert Dashboard renders cached content
- Playwright: install prompt appears on Chrome (check `beforeinstallprompt` event fires)
- Lighthouse CI in GitHub Actions: enforce PWA ≥ 90, Performance ≥ 80 thresholds
- Manual install test: install on iOS Safari, verify it appears on home screen and launches in standalone mode
- API: Jest tests for validation middleware (malformed body → 400) and rate limiter (429 after threshold)

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
| 0 — Infra Setup | Done | Repo at github.com/Raybur92/hoard; Prisma schema written, first migration pending Supabase credentials |
| 1 — Design System | Not started | |
| 2 — Static Screens | Not started | |
| 3 — Backend API | Not started | |
| 4 — Auth & Platform Sync | Not started | Blocked: Settings screen design pending |
| 5 — IGDB + HLTB | Not started | |
| 6 — PWA + Hardening | Not started | |

> Update this table as phases progress. Use: `In progress`, `Done`, `Blocked (reason)`.
