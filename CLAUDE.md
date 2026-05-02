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
| Screen components (design) | `project/screens-dashboard.jsx`, `screens-library.jsx`, `screens-upcoming.jsx` |
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
5. **Settings screen is blocked.** Do not implement `/settings` until the design is delivered. The API routes and backend logic for platform connections can be built, but not the screen.
6. **Nintendo and Epic are manual-only.** No OAuth, no sync endpoints for these platforms. Games are added via IGDB search with a `platformLabel` string. Do not build scrapers.
7. **Never test against the production database.** Integration tests use the `hoard-test` Supabase project exclusively. The test DB is seeded fresh per run.
8. **HLTB failures must be silent.** If `howlongtobeat` throws or returns nothing, store `null` and show "—" in the UI. Never surface an error to the user for HLTB.

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
| Local dev | Supabase dev project | Manual (`prisma db seed`) |
| CI / integration tests | `hoard-test` Supabase project | Auto, before each run |
| Production | Supabase prod project | Never seeded |

Visual regression baselines: `apps/web/tests/snapshots/` — committed to repo. Regenerate with `npx playwright test --update-snapshots` only when intentional visual changes are made.

---

## Current Phase

See `docs/PLAN.md` → Section 10 (Phase Status table) for live status.

**Settings screen (Phase 4):** blocked until design is delivered by the owner.
