# Hoard — Claude Code Working Guide

Hoard is a personal game tracking PWA. It syncs libraries from Steam, PSN, Xbox, and GOG into one unified interface with a terminal/collector aesthetic. Personal tool, not SaaS.

Before starting any task, check `docs/PLAN.md` for the current phase and whether anything is blocked.

---

## Commands

```bash
# Development
npm run dev          # all apps in parallel (web port 5173, api port 3001)
npm run dev:web      # frontend only
npm run dev:api      # backend only

# Quality
npm run typecheck                          # TypeScript check across all packages
npm run lint                               # ESLint + Prettier across all packages
npm run test                               # all tests (Vitest + Jest, both workspaces)
npm run test --workspace=apps/api          # Jest + Supertest only (backend integration)
npm run test --workspace=apps/web          # Vitest only (frontend unit + component)
npm run test:e2e                           # Playwright E2E

# Database
npx prisma migrate dev        # create + apply migration (packages/db)
npx prisma migrate deploy     # apply migrations in production
npx prisma studio             # GUI browser for DB
npx prisma db seed            # seed with mock data
```

---

## Key File Locations

| What | Where |
|---|---|
| Execution plan + phase status | `docs/PLAN.md` |
| Interaction debt + audits + PR plan (active workstream) | `docs/INTERACTION_DEBT_PLAN.md` |
| Performance & UX workstream (complete 2026-05-04) | `docs/PERFORMANCE_PLAN.md` |
| Environment variables reference | `docs/ENV.md` |
| Design source of truth | `project/` — HTML/CSS/JS prototypes |
| Design system CSS | `project/styles.css` → port to `apps/web/src/styles/` |
| Shared primitives (design) | `project/primitives.jsx` |
| Screen components (design, phases 1–4) | `project/Hoard.html` — full hi-fi mockup (dashboard, library, upcoming, game detail, settings, platform connect, PSN guided flow, delete account) |
| Earlier screen sketches | `project/screens-dashboard.jsx`, `screens-library.jsx`, `screens-upcoming.jsx` |
| CSS tokens | `apps/web/src/styles/tokens.css` |
| Global CSS + utilities | `apps/web/src/styles/global.css` |
| Shared TypeScript types | `packages/types/` |
| Prisma schema | `packages/db/schema.prisma` |
| API routes | `apps/api/src/routes/` |
| Platform integrations | `apps/api/src/services/platforms/` |
| IGDB + HLTB services | `apps/api/src/services/` |

---

## Hard Rules

These are non-negotiable. Do not deviate without explicit instruction.

1. **Match the designs exactly.** Read `project/` source before touching any UI. Do not improvise layout, colors, spacing, or typography. The design files are the spec.
2. **No Tailwind.** The design system is custom CSS variables + utility classes. All tokens live in `tokens.css`. Extend that file, never work around it.
3. **No `any` in TypeScript.** Strict mode is on. All props and return types must be explicit. All interfaces must be exported from `packages/types`.
4. **No localStorage for tokens.** JWT lives in HTTP-only cookies only. Never expose auth tokens to JavaScript.
5. **Login screen has no design file.** Implement `/login` using design system conventions (same tokens, fonts, and utility classes as every other screen). No external reference — match the terminal aesthetic.
6. **Nintendo and Epic are manual-only.** No OAuth, no sync endpoints for these platforms. Games are added via IGDB search with a `platformLabel` string. Do not build scrapers.
7. **Never test against the production database.** Backend integration tests mock Prisma at the module level (each test file declares its own mock with `jest.mock('@hoard/db', ...)`). No live DB connection is established during `npm test`. A separate `hoard-test` Supabase project was originally planned but proven unnecessary — the value at this layer is in route logic, not SQL behavior.
8. **HLTB failures must be silent.** If `howlongtobeat` throws or returns nothing, store `null` and show "—" in the UI. Never surface an error to the user for HLTB.
9. **Keep docs current after every phase.** When a phase completes (or any meaningful chunk of work lands), update `docs/PLAN.md` before closing the session:
   - Check off all completed deliverables with `[x]`
   - Update the Phase Status table
   - Record any design decisions made during the phase — what was decided, why, and any trade-offs — directly in the relevant phase section under a `**Decisions:**` block
   - If a decision affects the overall architecture or is permanent for v1, mirror it in `AGENT.md` under Key Decisions
   - Update the `## Current Phase` section in this file (`CLAUDE.md`) to name the next active phase explicitly — never leave it as a bare pointer to PLAN.md

---

## Design System Quick Reference

**Fonts** (loaded via Google Fonts):
- `var(--mono)` — JetBrains Mono — primary font for all UI text
- `var(--sans)` — IBM Plex Sans — prose, descriptions
- `var(--display)` — Major Mono Display — hero numbers, logo

**Core palette:**
- `--void` `#07090a` — page background
- `--ink` `#0d1012` — card/panel background
- `--ink-2` `#14181b` — raised panel, hover state
- `--paper` `#ece8de` — primary text
- `--paper-dim` `#a9a89e` — secondary text
- `--paper-faint` `#6b6f72` — labels, captions
- `--rule` `#23292d` — hairlines, borders
- `--amber` `#d4a017` — wishlist, highlights, CTA
- `--green` `#5fc26a` — playing, active, completed, ok
- `--red` `#e2553a` — dropped, errors
- `--blue` `#69a1d4` — on hold, info

**Typography scale (tokens.css, added in Phase 8 PR 1):**
`--text-3xs: 10px` · `--text-2xs: 11px` · `--text-xs: 12px` · `--text-sm: 13px` · `--text-base: 14px` · `--text-md: 17px` · `--text-lg: 22px` · `--text-xl: 28px` · `--text-2xl: 44px` · `--text-display-sm: 56px` · `--text-display: 96px`

**Floor rules** (enforced by audit, not by lint):
- Interactive text ≥ `--text-xs` (12 px)
- Body content ≥ `--text-sm` (13 px)
- `--paper-faint` is banned as a *text* color anywhere font-size < `--text-md` (17 px) — the `.t-faint` utility class is mapped to `--paper-dim` (~9.4:1 contrast). `--paper-faint` is still legitimate for decorative borders / dividers.
- Receipt internals (`.receipt`, `.barcode`, `.bignum`) and platform glyphs (`.plat`) are documented exceptions.

**Line-height tokens:**
`--lh-tight: 1.15` · `--lh-snug: 1.3` · `--lh-normal: 1.5` · `--lh-relaxed: 1.7`

**Key utility classes:**
`.t-display` `.t-mono` `.t-sans` `.t-up` `.t-tnum`
`.t-dim` `.t-faint` `.t-ghost` `.t-amber` `.t-green` `.t-red`
`.hoard-noise` `.thin-scroll` `.panel` `.panel.raised` `.panel.flat`
`.chip` `.chip.on` `.chip.amber` `.chip.green`
`.btn` `.btn.primary` `.btn.amber` `.btn.sm`
`.plat` `.plat.lg` `.cover-ph` `.cover-ph.bright`
`.prog` `.prog.green` `.gauge` `.heat-cell`
`.receipt` `.receipt.zigzag` `.marker` `.bignum` `.shelf-label`
`.hr-dot` `.hr-dash` `.hr-solid` `.hr-double`
`.kv` `.ascii` `.spark` `.status-sigil`
`.sr-only` `.skip-link`
`.sidebar` `.topbar` `.m-tabbar`

---

## Responsive Breakpoint

- `≥ 1024px` → desktop layout (sidebar + topbar)
- `< 1024px` → mobile layout (mobile header + tab bar)
- Use the `useBreakpoint()` hook — do not use media queries directly in component logic
- Mobile shell uses `100dvh` + `viewport-fit=cover` + `env(safe-area-inset-*)` (notch / Dynamic Island / home indicator). The OS status bar is painted by `apple-mobile-web-app-status-bar-style="black-translucent"`; the app draws no chrome of its own there.

---

## Game Statuses

`Playing` (green) · `Backlog` (paper-faint) · `Completed` (paper) · `On Hold` (blue) · `Dropped` (red) · `Wishlist` (amber)

## Platform Codes

`ST` Steam · `PS` PSN · `XB` Xbox · `GG` GOG · `NINTENDO` manual · `EPIC` manual

---

## Testing Environment

| Context | Database | Seeded? |
|---|---|---|
| Local dev | Supabase production (Option A — shared) | Manual (`prisma db seed`) |
| CI / integration tests | None — Prisma is mocked per test file | N/A |
| Production | Supabase production (same as dev) | Never seeded |

Tests run fast (no network) because every `prisma.*` call is intercepted by the test's `jest.mock('@hoard/db', ...)` block.

Visual regression baselines: `apps/web/tests/snapshots/` — committed to repo. Regenerate with `npx playwright test --update-snapshots` only when intentional visual changes are made.

---

## Current Phase

**Active: Post-8 — Interaction Debt & Audit workstream (drafted 2026-05-06).** See `docs/INTERACTION_DEBT_PLAN.md`.

Triggered by friend Luigi's first real-world test, which surfaced two bugs (PSN sync put every game in Backlog; Steam connect 404'd on production with a Vercel error page). Both fixed same-day in commit `6c624a0`. After that, two systematic audits — a data-flow Source→Schema→UI map and an interaction-by-interaction sweep — captured the full interaction debt before starting the next feature workstream (Upcoming rework).

**Sequence:**
- **PR D — HLTB layered fallback** ✅ Done 2026-05-06. Coverage 34.2% → 63.1% via Steam-ID + IGDB `/game_time_to_beats` chain.
- **PR A — Interaction debt** ✅ Done 2026-05-06. All 9 items shipped (mobile back default + 44pt hit areas, mobile shell wiggle fix via overscroll-behavior, library search input + `/`, Cmd-K confirmed wired, Library shelves simplified, Settings stubs become ComingSoonPanel + Account V2 markers, HLTB extras+completionist on mobile, Dashboard/GameDetail/Upcoming cleanups).
- **PR B — Real wishlist scope** (next): server-side `?scope=wishlist` + Path-B persistence fix so wishlisted releases keep `releaseDate`/`platforms`/`synopsis`/`hype`/`category`.
- **PR C — Sync-all + wipe-library** with proper microinteraction feedback.

14 decisions locked. Phase 8 is closed; this is a post-Phase-8 cleanup workstream.

---

**Previous workstream — Phase 8 (complete 2026-05-05).**

Drafted from a May 2026 multi-pass UX audit covering parity, Nielsen heuristics, iOS HIG, typography, touch targets, and full accessibility.

**Audit headline findings (the things being fixed):**
- ~290 uses of 9–12 px text; no `--text-*` token scale existed
- Zero `:focus-visible` styles anywhere; ~50 `<div onClick>` without keyboard support
- Zero semantic `<h1>` / `<h2>` / `<h3>` across the app
- Mobile shell rendered a fake hardcoded "9:41 / 100 %" status bar over the real iOS one
- Mobile tab bar grid was `repeat(5, 1fr)` for 4 tabs
- No `viewport-fit=cover` / `env(safe-area-inset-*)` / `100dvh`
- Mobile components don't read `usePreferences()` and don't call `update()` — ~50 % of desktop interactivity missing on mobile equivalents

**Phase 8 progress:**

- **PR 1 — Foundation: done** (commit `9d3ab31`). 11-step typography scale (`--text-3xs` → `--text-display`) + 4-step line-height scale; global `:focus-visible` amber ring + `prefers-reduced-motion` block + skip-link CSS; chip/btn/field heights raised; `--paper-faint` text under 17 px replaced with `--paper-dim` (passes WCAG AA). Inline `fontSize` literal sweep across 24 components — sub-floor sizes (7/8/9 px) bumped, 16/18 collapsed to `--text-md`. Bonus: `GameDetailDesktop` quick-stats + HLTB grids restructured so labels anchor to cell bottoms instead of clipping into the value row.

- **PR 2 — Mobile shell (iOS HIG): done** (commit `b31fa5d`). Fake status bar deleted; mobile tab bar fixed (`repeat(4, 1fr)` grid, `padding-bottom: env(safe-area-inset-bottom)`, 2 px amber top-border active state with `margin-top: -2px` so the row doesn't shift, `:active` press feedback, `navigator.vibrate?.(8)` haptic tick); `viewport-fit=cover` + `100dvh` + `padding-top: env(safe-area-inset-top)`; `MobileHeader` search icon wired to `SearchOverlay`; tab-bar icons replaced with meaningful glyphs (`home` / `rows` / `clock` / `user`). Bonus: `SearchOverlay` state lifted out of `TopBar` into a new `SearchModalProvider` mounted at `AppShell`; `MobileTabBar` rewritten as semantic `<nav><button>` with `aria-current="page"` (head start on PR 3 a11y).

- **PR 3 — Accessibility (WCAG 2.1 AA): done** (commits `3ce97d2` → `52fb4aa`, 6 sub-commits, 2026-05-05). The heaviest PR; landed in 6 parts so each was independently green:
  - **Part 1** (`3ce97d2`): `eslint-plugin-jsx-a11y` (90 errors → 0), ~50 `<div onClick>` converted to `<button>`, form labels, `role="dialog"` + Escape on modals, `useDocumentTitle` hook + per-screen calls, skip-link CSS + `<main id="main-content">` landmarks, Toggle/Radio/Chip rewritten with proper ARIA roles, tab strips with `role="tablist"`, Cover.tsx alt-text strategy, Lighthouse a11y threshold 90 → 95.
  - **Part 2** (`7756ed4`): semantic `<h1>` (TopBar last crumb sr-only, MobileHeader title visible, LoginScreen wordmark, PsnGuidedFlowDesktop hero, DeleteModal `<h2 id>`); `useFocusTrap` hook applied to `AddGameModal` / `SearchOverlay` / `DeleteModal`; `aria-live` regions for save toasts + login error; `@axe-core/playwright` + `tests/e2e/a11y.spec.ts` covering 6 routes × 2 viewports.
  - **Part 3** (`d37b742`): remapped `.t-faint` utility class from `--paper-faint` to `--paper-dim` to fix all 90+ color-contrast violations app-wide in one CSS change; mass-replaced ~15 inline `var(--paper-faint)` text colors with `var(--paper-dim)`.
  - **Part 4** (`244c9ac`): `tabIndex={0}` + `role="region"` on Dashboard mobile scroll container (axe `scrollable-region-focusable`); `aria-label` support added to `Btn` primitive + applied to icon-only "+ add game" button on Library mobile.
  - **Part 5** (`f3193de`): Playwright `webServer` made into an array that auto-starts both `dev:api` and `dev:web` (cwd rewired to monorepo root) — eliminates the silent corrupt-snapshots failure mode where login redirects were captured because the API wasn't running.
  - **Part 6** (`0977cef`): API rate limiter (`globalLimiter` + `authLimiter`) gains `skip: () => NODE_ENV !== 'production'`. Production rate limiting still in force; dev / Playwright runs no longer trip the 100 req/min/IP threshold mid-suite.
  - **End state:** axe-core 12/12 passing across Dashboard / Library / Upcoming / GameDetail / Settings / Login on desktop + mobile. Lint 0 errors. 115 API + 69 web unit tests pass. Visual snapshots regenerated against the working config.

- **PR 4 — Mobile parity: done** (commit `15695fc`, scope option A approved 2026-05-05). 15 ports + 2 documented skips:
  - **GameDetailMobile** is now a real editor: status bottom-sheet picker (with focus trap, role="dialog", safe-area-inset-bottom), tap-to-edit notes textarea inline in the receipt with blur-save + "// saved" toast, action buttons wired (`start` → status='Playing', `+ note` → focuses textarea, `share` → navigator.share with clipboard fallback), back caret uses `navigate(-1)`.
  - **DashboardMobile**: backlog picker + shuffle (closes the AGENT.md decision #4 violation), genre breakdown panel with proportional bars, now-playing card wrapped as a `<button>` that opens the game detail. (Decision: skipped porting the unwired desktop "resume / log session / +note" buttons — they're dead UI on desktop too.)
  - **LibraryMobile**: filter chip strip on the filtered single-shelf view (existed on the unfiltered shelves view), `usePreferences()` consumed for cover density (3 tiers: cozy 96×128 / standard 84×112 / dense 72×96), `MobileShelf` slot count adapts. View-mode toggle SKIPPED (mobile too narrow for useful list/grid distinction).
  - **UpcomingMobile**: scope state lifted; two-chip toggle (wishlist / all releases) above the month strip; DLC + remake category labels inline on agenda cards.
  - **PlatformDetailMobile**: sync-frequency picker (4 radios in a `role="radiogroup"`), full 4-row scope checklist (replaces the one-line summary). Activity log tab SKIPPED.
  - **SettingsMobile**: platform list rows show full name + game count + last sync ("488 games · synced 2h ago") instead of just code+who.

- **PR 5 — IA & polish: done** (commit `b3c4f8d`, 2026-05-05).
  - **Empty / first-run states** on Dashboard, Library, and Upcoming. Each shows an actionable CTA panel ("connect a platform" / "add a game" / "switch to all releases" / "tune hype threshold") instead of a bare blank screen.
  - **Retry buttons** on every data-fetching screen — `useDashboard` and `useGame` now expose `refetch`; `useUpcoming` already did. LibraryDesktop/Mobile already had retry from earlier; the rest now match.
  - **URL state**: Library `?sort=` + `?view=`, Upcoming `?scope=`. Default values omitted from URL to keep it clean. Sharing `/library/Backlog?sort=playtime` reproduces the exact view.
  - **Pull-to-refresh** on Dashboard / Library / Upcoming Mobile via new `usePullToRefresh` hook + `PullableScroll` primitive. Touch-only by design; visual indicator ("// pull down…" → "// release to refresh" → "// refreshing…"). Preserves the WCAG 2.1.1 keyboard-scroll fix.
  - **navigate(-1) audit complete** — remaining hardcoded `navigate('/path')` calls are all intentional fixed destinations (sidebar nav, settings sections, "back to platforms list" semantic). The one ambiguous case was already fixed in PR 4.
  - **Skipped by design**: quick-sync trigger in TopBar (defer to future feature), page-transition animations (terminal aesthetic is intentionally instant).

WCAG 2.1 AA is the bar (Hoard may be released as a product later, so accessibility is a hard prerequisite, not a personal-tool nicety). PR 3 met the bar; PR 5 closed the IA gaps that remained.

---

**Previous workstream — Performance & UX (complete 2026-05-04).**

The full per-PR breakdown (14 items, 6 PRs) is preserved in `docs/PERFORMANCE_PLAN.md`. Headline summary kept here for quick orientation:

- **PR 1 (F1+F2+F3)** — persistent shell: `AppShell` layout route + `UserProvider` context + `RequireAuth` lifted to layout. Sidebar/TopBar/MobileTabBar mount once per session. `api.me` fetched once per session (was 4–5× per navigation).
- **PR 2 (F4+F8+F9)** — stale-while-revalidate cache: `apps/web/src/lib/cache.ts` + `apps/web/src/hooks/useQuery.ts`. All four data hooks + Sidebar use it. Mutations centrally invalidate in `lib/api.ts`. `Cache-Control: private, max-age=10/30` + SW `StaleWhileRevalidate` for shell endpoints.
- **PR 3 (F5+F6)** — slim dashboard + per-shelf endpoint: `/api/dashboard` split into parallel queries with lightweight selects (backlog pool capped at 30); new `GET /api/games/shelves?perStatus=N`; `useShelves` hook; `/api/games` capped at 500.
- **PR 4 (F7+F11)** — covers + preconnect: `loading="lazy"`, `decoding="async"`, intrinsic dims; `igdbCover.ts` substitutes `t_cover_small` for ≤90 px targets (~6× mobile bandwidth saving); preconnect to `api.gamehoardr.com` + `images.igdb.com`. Skeleton rewritten to mirror real Library layout.
- **PR 5 (F10+F12+F13)** — composite indexes (applied to Supabase) + memoization + per-screen `React.lazy`. Initial JS bundle 105.68 → 75.38 KB gzipped (~30%).
- **PR 6 (F14)** — activity heatmap fed by real `lastPlayedAt` data (was synthetic). 24-week column-major grid; mobile slices the rightmost 16. Decision: this is "games last-touched per day," not "playtime per day" — sparse but real.
- **Infra discoveries** — see "Operational gotchas" below for the Railway region / `connection_limit` / Watch Paths fixes that brought the actual production wins.

Final state: **115 API + 69 web** tests passing. Lint clean, typecheck clean. Production endpoints in the 130–500 ms range. Commits `c11fc29` (PR 1–6 perf overhaul), `624a380` (Library error UI), `8e31e46` (ops gotchas docs).

Production URLs:
- Web: **https://gamehoardr.com** (Vercel)
- API: **https://api.gamehoardr.com** (Railway, EU West / Amsterdam)
- Database: Supabase, `aws-0-eu-west-1.pooler.supabase.com:6543` (transaction pooler) — single project shared with dev (Option A from Phase 7)
- Domain: gamehoardr.com via Porkbun (DNS at Porkbun)
- Fallback URLs (still active, for emergencies): `hoard-liard.vercel.app`, `hoardapi-production.up.railway.app`

**Operational gotchas (recorded after a costly debug):**
- **Railway region must match Supabase region.** API was originally deployed in `us-west` (California) and every DB query paid ~150-200 ms transatlantic RTT, then the pgbouncer overhead on top — the dashboard's 7-query `Promise.all` took ~10 s. Moving to `EU West (Amsterdam)` dropped query time to ~50 ms. Settings → Region.
- **`DATABASE_URL` query string must include `?pgbouncer=true&connection_limit=5`.** `pgbouncer=true` disables Prisma prepared statements (required for transaction-mode pgbouncer). `connection_limit=5` lets parallel `Promise.all` queries actually run in parallel — `connection_limit=1` (the original value) serialized them, multiplying any per-query latency by 7 on the dashboard. Same value should be set in `apps/api/.env` for local dev.
- **Railway Watch Paths must use one glob per line, not commas.** Watch Paths set as `apps/api/**,packages/**,railway.toml,package*.json` (single line, comma-separated) is parsed as ONE literal pattern with commas in it and matches nothing — every push gets "Skipped: No changes to watched files." Correct format is one pattern per line. Service Settings → Source.
- **API rate limiter must skip in dev / CI.** With 5 parallel Playwright workers each running multiple tests with multiple data fetches, the default 100 req/min/IP global limiter blew through its budget mid-suite. `/api/auth/me` started returning 429, the frontend read it as auth failure, RequireAuth redirected to `/login`, and visual snapshots silently captured the login screen instead of the actual route. Fix lives in `apps/api/src/index.ts`: both `globalLimiter` and `authLimiter` carry `skip: () => process.env.NODE_ENV !== 'production'`. Production rate limiting still in force.
- **Playwright `webServer` must start both API and web.** A single `npm run dev` from `apps/web/` only starts the Vite frontend on :5173 — not the API on :3001. Without the API, every authenticated route 401s, RequireAuth bounces to `/login`, snapshots are wrong. `apps/web/playwright.config.ts` now uses an array of webServer configs that boots `dev:api` (cwd: monorepo root) + `dev:web` and waits for both before tests run. Symptom of the old config: byte-identical mobile snapshot files (e.g., 3 PNGs all 25,213 bytes) because they all captured the same login redirect.
- **Mobile snapshots can drift silently.** Phase 8 PRs that touch mobile screens (typography, mobile shell, semantic h1, parity ports, IA polish) all change the rendered output. After landing one, run `npm run test:e2e:update -w apps/web` to regenerate the four `*-mobile-darwin.png` baselines, then eyeball each one in Preview before committing — the byte-size signature is a useful sanity check (login-redirect captures all weigh ~25 KB).
- **`prisma migrate deploy` / `migrate dev` hang against the pgbouncer pooler.** Prisma migrate uses advisory locks for coordination, and pgbouncer transaction-mode (`?pgbouncer=true`) doesn't support them — the command silently sits forever. Symptom: 0-byte output file, process alive but doing nothing. The `migrate deploy` command may even exit 0 without actually running the DDL. Workaround that does work: `npx prisma db execute --file <migration.sql> --schema prisma/schema.prisma` to run the DDL, then `npx prisma migrate resolve --applied <migration_name>` to record it in `_prisma_migrations`. Hand-write the migration SQL (matches what the previous `enable_rls_on_public_tables` and `usergame_perf_indexes` migrations already do). Permanent fix would be adding a `directUrl` to the Prisma datasource block — defer until convenient.

See `docs/PLAN.md` → Phase Status table for full live status.

All phases complete through Phase 8. App is deployed, accessible (WCAG 2.1 AA), and feature-aligned across desktop and mobile. Email/password and Google OAuth login both verified end-to-end. Steam OpenID still works locally and just needs the same redirect URI verification on prod.

**Test commands:**
- `npm run test` — 115 API tests + 69 web tests, all passing
- `npm run test:e2e -w apps/web` — Playwright E2E suite (auto-starts both `dev:api` + `dev:web`). Includes:
  - `screens.spec.ts` — assertions + visual snapshots for every route
  - `a11y.spec.ts` — axe-core (WCAG 2.1 A + AA) on Dashboard / Library / Upcoming / GameDetail / Settings / Login on desktop + mobile (12 tests)
- `npm run test:e2e:update -w apps/web` — same, but regenerate visual snapshots
- `npm run test:e2e:offline -w apps/web` — Playwright offline E2E (3 tests) against production preview build with active service worker

**CI workflows:**
- `.github/workflows/ci.yml` — lint + format + typecheck + tests + builds on every PR. Lint includes `eslint-plugin-jsx-a11y` (added Phase 8 PR 3) — `<div onClick>` without keyboard support, missing form labels, and similar a11y patterns block CI.
- `.github/workflows/lighthouse.yml` — Lighthouse CI on PRs touching `apps/web/**`. Thresholds: Performance ≥ 80, Accessibility ≥ 95 (raised from 90 in PR 3), Best-practices ≥ 90. Local run shows 99 / 100 / 100. PWA category was retired in Lighthouse 12 — installability is verified by the offline E2E test instead.

**Recent fixes landed (most recent first):**
- **Post-8 PR A — Interaction debt cleanup (2026-05-06).** All 9 items shipped in one batch. **A4** `MobileHeader` now defaults `onBack` to `navigate(-1)` (was undefined → silent dead UI on every Settings + PlatformDetail sub-page); new `.m-icon-btn` utility delivers 44×44pt Apple HIG hit area + `:active` press flash + `navigator.vibrate(8)` haptic across mobile icon buttons; DashboardMobile's unwired `<Icon name="menu">` override removed (default search button returns). **A5** `html, body` get `overflow: hidden; overscroll-behavior: none` and inner scroll surfaces (`.thin-scroll`, `.app-content`, `.app-mobile-content`, `PullableScroll`) get `overscroll-behavior: contain` — kills body-level rubber-band so the mobile shell stops wiggling on drag. **A3** Library shelves view simplified — sort + platform-filter chips + view-mode chips + the `prefs.libraryView` setting all gone (column kept in schema as no-op default per D5); skeletons match. **A1** `LibraryDesktop` "find" field is now a real `<input>`, hitting the existing `?q=` server filter (case-insensitive title match scoped to UserGames); typing swaps the shelves view for a flat result grid; `/` shortcut focuses the input on `/library*` (skips when already in another input). LibraryMobile gets the same input minus the keyboard shortcut. **A2** Cmd-K binding was already in `useSearchModal` — confirmed working; comment clarifies the dual-shortcut pattern. **A6/A7** four Settings stubs (Library/Notifications/Privacy/Data export) now show a real `ComingSoonPanel` with v2 description; Account profile-visibility radios + sessions list get a `// v2` chip + `opacity: 0.5; pointer-events: none`. **A8** `GameDetailMobile` receipt block extended with all three HLTB rows (main / extras / 100%). **A9** Dashboard "see full upcoming feed →" → real `<Link>`; now-playing buttons wired (`resume` → game detail, `+ note` → game detail with `?focus=notes` which auto-opens the editor on land; `log session` deleted as no v1 model); GameDetail HLTB chip → real `<a target="_blank">` to `howlongtobeat.com/game/{hltbId}` (search-URL fallback when no id); GameDetailDesktop gets a `← back` chip; Upcoming month-strip tabs (desktop + mobile) functional with an "all" pseudo-tab — clicking a month filters featured + agenda. 125 API + 69 web tests pass; lint 0 errors.
- **Post-8 PR D — HLTB layered fallback chain (2026-05-06).** Migration `20260506140000_game_hltb_id_gog_id_hltb_source` adds `Game.hltbId` + `Game.gogAppId` (captured from the codepotatoes.de payload — unblocks real HLTB deep-links and future GOG sync) and `HltbData.source` (`'hltb'` / `'igdb'`). New `getTimeToBeat(igdbId)` in `apps/api/src/services/igdb.ts` hits IGDB's dedicated `/game_time_to_beats` endpoint (mid-PR correction — `time_to_beat` is NOT a sub-field on `/games`, it's a separate endpoint keyed by `game_id`; the games-endpoint approach silently returned nothing). New `fetchHltbWithFallback` orchestrator runs Steam-ID lookup → IGDB time_to_beat in order. New `scripts/audit-hltb.ts` (read-only diagnostic) and `scripts/backfill-missing-hltb.ts` (one-time backfill). Backfill ran end-to-end: 264 new HLTB rows (46 HLTB-sourced + 218 IGDB-sourced). Coverage moved 318/929 → 586/929 (34.2% → 63.1%). 125 API tests pass. See `docs/INTERACTION_DEBT_PLAN.md` PR D section.
- **Post-8 — Interaction debt audit + hot fixes from Luigi's first test (2026-05-06).** Commit `6c624a0`: PSN sync was placing every imported game in Backlog because `runSync` hardcoded `status: 'Backlog'` on create. The "Steam → On Hold if played" rule Andrea remembered came from a one-time `scripts/backfill-status.ts` run, not from the runner. Fixed: status now derived from total merged playtime (`> 0 → OnHold`, else `Backlog`) — platform-agnostic. Steam connect button on `PlatformDetailDesktop` used a bare `/api/auth/steam` path which on production resolves to `gamehoardr.com/api/auth/steam` (Vercel 404, `fra1::...`); same button on `PlatformDetailMobile` had no onClick at all. Both fixed via `API_BASE` prefix matching the LoginScreen pattern. Production data corrected via `scripts/backfill-status.ts`: 384 Backlog → OnHold, 287 (no playtime) stayed. Commit `de2090e`: Library single-shelf filter+sort port — desktop now matches the mobile-filtered view (state + handlers were already wired; only JSX missing). Then drafted `docs/INTERACTION_DEBT_PLAN.md` capturing two systematic audits (data-flow + interaction) and a 14-decision PR plan (PRs A–D).
- **Phase 8 — Mobile Parity, iOS-HIG & Accessibility (5 PRs, 2026-05-05).** Composite mobile UX score moved from ~3/10 to ~8/10. Headlines:
  - **PR 1** — typography scale + line-height tokens, `:focus-visible` styles, `prefers-reduced-motion`, chip/btn/field min sizes raised, `--paper-faint` text contrast fixed (`.t-faint` remapped to `--paper-dim`), inline `fontSize` literal sweep across 24 components.
  - **PR 2** — fake "9:41" status bar deleted, mobile tab bar fixed (4-col grid, safe-area insets, 2 px amber active border, press feedback, haptic tick), `viewport-fit=cover` + `100dvh`, `MobileHeader` search wired to `SearchOverlay`, tab-bar icons replaced with meaningful glyphs (`home`/`rows`/`clock`/`user`).
  - **PR 3** — full WCAG 2.1 AA pass: `eslint-plugin-jsx-a11y` (90 lint errors → 0), ~50 `<div onClick>` → `<button>`, semantic `<h1>`/`<h2>`/landmarks, `<label htmlFor>` everywhere, `role="dialog"` + focus traps + Escape on every modal, `useDocumentTitle` per route, skip-link, `Cover.tsx` alt-text strategy, `axe-core` E2E (12/12 passing), Lighthouse a11y threshold 90 → 95, rate limiter skips in dev, Playwright `webServer` starts both API + web.
  - **PR 4** — mobile parity port (15 items): `GameDetailMobile` is now a real editor (status bottom-sheet, notes editor, action buttons), `DashboardMobile` gets backlog picker + tappable now-playing + genre breakdown, `LibraryMobile` gets filter chips on filtered view + cover-density preference, `UpcomingMobile` gets scope toggle + DLC/remake labels, `PlatformDetailMobile` gets sync-frequency radios + scope checklist, `SettingsMobile` platform rows expanded. Skipped: view-mode toggle, activity log tab.
  - **PR 5** — empty / first-run states with CTAs across Dashboard / Library / Upcoming, retry buttons on every data-fetching screen, URL state for Library `?sort=`/`?view=` and Upcoming `?scope=`, pull-to-refresh on mobile data screens via `usePullToRefresh` hook + `PullableScroll` primitive, `navigate(-1)` audit complete.
- **scripts/list-users.ts and scripts/delete-users.ts** — debugging utilities for the User table; `delete-users.ts` carries a history block of what was deleted and when. Tested 2026-05-05 by purging 5 stale sign-ups (test/diag/unused accounts).
- Lint cleanup: 86 pre-existing errors → 0 errors (2 non-blocking HMR warnings remain). ESLint config gained a `scripts/**` override; test middleware mocks now use proper Express types; Express `Request`/`Response` are type-only imports across all routes; `auth.test.ts` mocks `dotenv/config` so OAuth env-dependence is deterministic regardless of local `.env`.
- Supabase RLS: enabled on all 7 public tables. Captured in migration `20260504100000_enable_rls_on_public_tables`. Closes 8 Supabase Security Advisor errors (rls_disabled_in_public + sensitive_columns_exposed on User.password).
- Phase 7 — Production deploy + Google OAuth + custom domain: API on Railway (`api.gamehoardr.com`), web on Vercel (`gamehoardr.com`), DNS at Porkbun, SSL auto-provisioned. Google OAuth client wired with new origins/redirect URIs. iOS Safari + Chrome incognito both work because both subdomains share `.gamehoardr.com` parent (cookies are first-party).
- Cross-origin auth fixes: SameSite=None+Secure cookies in production; `<RequireAuth>` wrapper bouncing unauthenticated users to /login; `VITE_API_URL` base URL prefix in api client; `app.set('trust proxy', 1)` for Railway's proxy; `?pgbouncer=true&connection_limit=5` on `DATABASE_URL` for Supabase transaction pooler (later raised from `1` to `5` — see Operational gotchas).
- Test suite restored to green: 4 stale mocks fixed (hltb fetch mock, platforms `$queryRaw`, auth `deleteMany`, TopBar Router wrapper); added Phase 3 integration tests for games/dashboard/stats/upcoming/igdb routes (38 new tests).
- Phase 6 testing deliverables completed: Playwright offline simulation (`apps/web/tests/e2e-offline/offline.spec.ts`) + Lighthouse CI workflow + thresholds config (`apps/web/lighthouserc.json`).
- `GET /api/games/counts` endpoint — sidebar shelf counts always accurate on every route.
- Shelf order: Playing → On Hold → Completed → Backlog → Dropped → Wishlist.
- Library shelf cards fill viewport width exactly via `ResizeObserver`; "view all" always occupies last slot.
- Game Detail: status picker + notes editing fully wired (`PATCH /api/games/:id`, optimistic update).
- HLTB rewritten: `howlongtobeat` npm package was broken (HLTB changed API); replaced with `hltbapi.codepotatoes.de/steam/{steamAppId}`.
- `steamAppId Int? @unique` added to `Game` model; stored during Steam sync; wired through HLTB background triggers.
- Full Steam backfill: 488 Steam app IDs matched, HLTB data fetched for ~300 games.
- PSN sync fully implemented (`psn-api` v2.18.0); `syncPsnLibrary` fetches paginated library with ISO 8601 duration parsing.
- PSN title cleaning: `cleanPsnTitle()` strips ®/™ and PS4/PS5 platform suffixes before IGDB search; 94% match rate (132/140).
- PSN HLTB backfill (`scripts/backfill-psn-hltb.ts`): Steam Store search for App IDs; 48 HLTB records added for cross-platform PSN games.
- Dashboard genres chart: bars now proportional to max count (`count / maxCount * 100%`) instead of hardcoded multiplier.
- Shareable receipt: OWNED ON + PROGRESS sections converted from `<pre>` to flexbox `.row` divs with CSS dotted spacers and self-sizing section header lines.

**Known gaps (low priority, none blocking):**
- Steam OpenID on production blocked by missing `API_URL` env var on Railway (discovered 2026-05-06 when Luigi tried to connect his Steam account and Steam redirected him back to `localhost:3001`). [auth.ts:40](../apps/api/src/routes/auth.ts#L40) defaults to `localhost:3001` when `API_URL` is unset; Steam's `return_to` + `realm` are derived from it. Fix: set `API_URL=https://api.gamehoardr.com` in Railway → API service → Variables. Documented in `docs/ENV.md`.
- Xbox / GOG library sync: stubs returning `[]`. Manual add covers the gap (same approach as Nintendo / Epic).
- `package.json#prisma` config block is deprecated in Prisma 6.19 — Prisma 7 will require `prisma.config.ts`. Migrate when convenient (warning only, not blocking).
- Phase 8 success criteria deferred to pre-launch verification (not blocking):
  - Manual VoiceOver / TalkBack walkthroughs (axe-core covers structural a11y; manual screen-reader passes are pre-launch)
  - WAVE browser-extension audit (covered by axe-core's WCAG 2.1 A + AA tags)
  - Real-device pull-to-refresh test on iPhone + Android Chrome
  - OfflineBanner z-index audit on real devices
- Phase 8 deferred features (intentional v2 punts, not bugs):
  - Quick-sync trigger from Sidebar / TopBar (sync currently buried in `Settings → Platforms → {platform}`)
  - Page-transition animations on route changes (skipped to preserve the terminal aesthetic's instant-feedback character)
  - Library view-mode toggle on mobile (mobile too narrow for useful list/grid distinction)
  - Activity-log tab on `PlatformDetailMobile` (low value, lots of vertical space)
- Pre-existing flaky E2E assertion tests (Pragmata / Death Stranding 2 in Upcoming agenda; ELDEN RING in GameDetail) hard-code titles that vary with the live IGDB feed. Real fix is to assert on selectors / regex patterns rather than literal game names — worth a quick test cleanup pass when convenient.
- **Interaction debt** — see `docs/INTERACTION_DEBT_PLAN.md` for the full enumerated audit (~20+ unwired controls, 4 stub Settings sections, mobile back-button bug across Settings + PlatformDetail, Upcoming wishlist scope semantics, etc.). PRs A–D are scoped and ready to start.
