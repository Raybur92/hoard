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

**Active: No active phase — production deploy live**

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
- Prisma migration history reconciliation — RLS migration is committed and the SQL is applied on Supabase, but `_prisma_migrations` doesn't have a record of it. Cosmetic; `migrate status` shows it as pending. Doesn't affect runtime.
- `react-refresh/only-export-components` warnings (2) in `PreferencesContext.tsx` — only impact dev-server HMR experience, not builds.
