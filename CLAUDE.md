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
npm run typecheck    # TypeScript check across all packages
npm run lint         # ESLint + Prettier across all packages
npm run test         # all tests (Vitest + Jest)
npm run test:web     # Vitest (frontend unit + component)
npm run test:api     # Jest + Supertest (backend integration)
npm run test:e2e     # Playwright E2E

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
| Performance & UX workstream (active) | `docs/PERFORMANCE_PLAN.md` |
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
`.sidebar` `.topbar` `.m-status` `.m-tabbar`

---

## Responsive Breakpoint

- `≥ 1024px` → desktop layout (sidebar + topbar)
- `< 1024px` → mobile layout (status bar + tab bar)
- Use the `useBreakpoint()` hook — do not use media queries directly in component logic

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

**Active: Performance & UX workstream — see `docs/PERFORMANCE_PLAN.md`**

App is deployed and stable. Active work is a focused performance/UX pass to fix the "clunky and slow" feel reported in production: shell flicker on navigation, username flashing to `…`, shelf counters disappearing, noise-screen flash between routes. Plan is in `docs/PERFORMANCE_PLAN.md` with 14 fix items, prioritized, each with tests + success criteria. Six PRs total; PR 1 + PR 2 alone are expected to address all four reported symptoms.

**PR 1 landed (F1 + F2 + F3, 2026-05-04):** persistent shell via `AppShell` layout route + `UserProvider` context + `RequireAuth` at layout. Sidebar/TopBar/MobileTabBar mount once per session. `api.me` fetched once instead of 4–5× per navigation. New integration tests in `apps/web/src/__tests__/shell-persistence.test.tsx`. 103 API + 43 web tests passing.

**PR 2 landed (F4 + F8 + F9, 2026-05-04):** stale-while-revalidate request cache (`apps/web/src/lib/cache.ts` + `apps/web/src/hooks/useQuery.ts`); all four data hooks (`useDashboard`/`useGames`/`useGame`/`useUpcoming`) plus Sidebar's `gameCounts`/`platformStatus` use it. Mutation invalidation wired centrally in `lib/api.ts`. `Cache-Control: private, max-age=10/30` on shell endpoints. SW `StaleWhileRevalidate` for `/api/(auth/me|games/counts|platforms/status)`. Tests: 106 API + 59 web (added 3 cache-header + 7 cache unit + 4 useQuery + 5 invalidation = 19 new). After PR 1+2, revisiting a page within 30s shows real data instantly with no skeleton; mutations propagate to all listening hooks automatically.

**PR 3 landed (F5 + F6, 2026-05-04):** `/api/dashboard` no longer loads the full library — split into parallel `groupBy` for counts, `findMany take:3/30` for now-playing/backlog, lightweight selects for aggregations. Backlog pool capped at 30 (shuffle picks among shortest-HLTB). New `GET /api/games/shelves?perStatus=N` endpoint replaces Library's `?limit=2000`; `useShelves` hook on the client. `/api/games` limit capped at 500 (was 2000). Library Desktop uses `useShelves(12)`, Mobile uses `useShelves(4)`. Shared `mapUserGame` extracted to `apps/api/src/lib/mappers.ts`. Tests: 114 API + 59 web (added 8 new: 5 shelves endpoint, 2 limit-cap, 1 dashboard lightweight-select). Dashboard payload drops ~5–10× on a 700-game library; Library Desktop mount stops paying the 2000-game cost.

**PR 4 landed (F7 + F11, 2026-05-04):** Covers now use `loading="lazy"`, `decoding="async"`, and intrinsic `width`/`height`. New `apps/web/src/lib/igdbCover.ts` swaps IGDB URL size variants — mobile shelves (84×112) request `t_cover_small` (90×128) instead of `t_cover_big` (264×374), about 6× less bandwidth per image. Preconnect + dns-prefetch added to `index.html` for `api.gamehoardr.com` and `images.igdb.com`. Tests: 114 API + 69 web (added 10: 6 igdbCover unit + 4 Cover component). Mobile cold-load image bandwidth drops dramatically; cold cross-origin handshake to API and IGDB now overlaps HTML parse. **Same-day follow-on:** Library Desktop and Library Mobile skeleton states rewritten to mirror the real layout (filter bar + 6 shelves at the right cover dims, plus filtered-shelf back-bar variant) so the cold-load skeleton-to-content swap is seamless instead of jolting.

**PR 5 landed (F10 + F12 + F13, 2026-05-04):** Composite indexes added to schema (`UserGame(userId, status)`, `UserGame(userId, lastPlayedAt DESC)`, `WishlistRelease(userId, releaseDate)`) — migration `20260504200000_usergame_perf_indexes` ready to apply via `npx prisma migrate deploy`. `React.memo` on `Sidebar`, `TopBar`, `MobileTabBar`, `Heatmap`, `Gauge`; `useMemo`/`useCallback` for `applyFilters` + `shelves` in Library, `asciiChart` in Dashboard. Each screen now `React.lazy()` in `App.tsx` with one `<Suspense>` boundary. **Initial JS bundle dropped from 105.68 KB to 75.38 KB gzipped (~30%)**, each screen ~3–5 KB. 114 API + 69 web tests still passing.

**PR 6 landed (F14, 2026-05-04):** Activity heatmap is no longer synthetic. New `ActivityHeatmap` type. `/api/dashboard` adds `lastPlayedAt` to the lightweight aggregation select and computes a 24-week × 7-day cell grid (column-major, row 0 = Sunday) — each game contributes one cell on the day its `lastPlayedAt` falls. Heatmap primitive rewritten to take `cells: number[]`, mapping counts (0..6+) to 6 visual levels. Mobile slices the rightmost 16 weeks. Markers re-labeled "// games last-played · Nwk" so the visual is read correctly. **Decision (PERFORMANCE_PLAN.md §7):** without a session log, this is "games last-touched per day," not "playtime per day" — sparse but real. 115 API + 69 web tests passing.

Production URLs:
- Web: **https://gamehoardr.com** (Vercel)
- API: **https://api.gamehoardr.com** (Railway)
- Database: Supabase (single project shared with dev — Option A from Phase 7)
- Domain: gamehoardr.com via Porkbun (DNS at Porkbun)
- Fallback URLs (still active, for emergencies): `hoard-liard.vercel.app`, `hoardapi-production.up.railway.app`

See `docs/PLAN.md` → Phase Status table for full live status.

All phases complete through Phase 7. App is deployed and reachable from anywhere. Email/password and Google OAuth login both verified end-to-end. Steam OpenID still works locally and just needs the same redirect URI verification on prod.

**Test commands:**
- `npm run test` — 103 API tests + 40 web tests, all passing
- `npm run test:e2e` — Playwright E2E (28 tests) against dev server
- `npm run test:e2e:offline --workspace=apps/web` — Playwright offline E2E (3 tests) against production preview build with active service worker

**CI workflows:**
- `.github/workflows/ci.yml` — lint + format + typecheck + tests + builds on every PR
- `.github/workflows/lighthouse.yml` — Lighthouse CI on PRs touching `apps/web/**`; thresholds: Performance ≥ 80, Accessibility ≥ 90, Best-practices ≥ 90 (all errors); local run shows 99 / 100 / 100. PWA category was retired in Lighthouse 12 — installability is verified by the offline E2E test instead.

**Recent fixes landed (most recent first):**
- Lint cleanup: 86 pre-existing errors → 0 errors (2 non-blocking HMR warnings remain). ESLint config gained a `scripts/**` override; test middleware mocks now use proper Express types; Express `Request`/`Response` are type-only imports across all routes; `auth.test.ts` mocks `dotenv/config` so OAuth env-dependence is deterministic regardless of local `.env`.
- Supabase RLS: enabled on all 7 public tables. Captured in migration `20260504100000_enable_rls_on_public_tables`. Closes 8 Supabase Security Advisor errors (rls_disabled_in_public + sensitive_columns_exposed on User.password).
- Phase 7 — Production deploy + Google OAuth + custom domain: API on Railway (`api.gamehoardr.com`), web on Vercel (`gamehoardr.com`), DNS at Porkbun, SSL auto-provisioned. Google OAuth client wired with new origins/redirect URIs. iOS Safari + Chrome incognito both work because both subdomains share `.gamehoardr.com` parent (cookies are first-party).
- Cross-origin auth fixes: SameSite=None+Secure cookies in production; `<RequireAuth>` wrapper bouncing unauthenticated users to /login; `VITE_API_URL` base URL prefix in api client; `app.set('trust proxy', 1)` for Railway's proxy; `?pgbouncer=true&connection_limit=1` on `DATABASE_URL` for Supabase transaction pooler.
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
- Steam OpenID on production not yet click-tested — wiring is in code and was working locally; just needs you to log in once via `https://gamehoardr.com/login` to confirm the redirect URI resolves correctly.
- Xbox / GOG library sync: stubs returning `[]`. Manual add covers the gap (same approach as Nintendo / Epic).
- `package.json#prisma` config block is deprecated in Prisma 6.19 — Prisma 7 will require `prisma.config.ts`. Migrate when convenient (warning only, not blocking).
