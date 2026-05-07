# Hoard — Agent Project Brief

Read this before starting any task. It covers what Hoard is, why decisions were made, and the full context any agent needs to work aligned with the project's direction.

For phase-by-phase deliverables, success criteria, and testing requirements, read `docs/PLAN.md`. For operational commands and hard rules, read `CLAUDE.md`.

---

## What Is Hoard

Hoard is a personal game tracking PWA. It connects to your gaming accounts across Steam, PlayStation, Xbox, and GOG, pulls your libraries automatically, and gives you one place to see everything you own, everything you're playing, and everything you're waiting for.

The name is intentional. A hoard is a collection that got out of hand — and that's the point. Hoard doesn't judge the backlog. It celebrates it.

**This is a personal tool, not a SaaS product.** It is built for one user (andrea) and designed accordingly — dense, a little obsessive, and proud of it. Do not make it generic. Do not soften the aesthetic. Do not add features to appeal to a broader audience.

**Live URLs:**
- Web: `https://gamehoardr.com` (Vercel)
- API: `https://api.gamehoardr.com` (Railway)
- DB: Supabase (single shared project for dev + prod)

---

## Design Philosophy

The visual language is non-negotiable:

- **Terminal aesthetic.** Monospace fonts everywhere. Uppercase labels. Dollar-sign prompt characters. ASCII bar charts. The UI looks like a well-worn inventory screen, not a wellness app.
- **Data density.** Numbers are shown. Progress is shown. Playtime is shown per platform. HLTB estimates sit next to your own hours so you can see at a glance where you are. Nothing is hidden behind vague rings.
- **Collector culture.** The game detail view is designed to feel like something worth screenshotting — a receipt, a record, a collector's entry. The dashboard feels like a control panel.
- **Respects the user's intelligence.** Shows the data. Doesn't simplify.

**The design source of truth is `project/`.** Those are HTML/CSS/JS prototypes exported from a design tool. All implementation must match them visually. Read the source directly — dimensions, colors, layout rules are all spelled out. Do not improvise.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | No Next.js — this is a pure SPA with a separate API |
| Styling | Custom CSS variables (no Tailwind) | Design system is hand-crafted; every token is defined. 11-step typography scale (`--text-3xs` → `--text-display`) and 4-step line-height scale enforce floors for interactive / body text (Phase 8 PR 1). |
| Routing | React Router v6 | Client-side only. URL state for Library `?sort=`/`?view=` and Upcoming `?scope=` (Phase 8 PR 5). |
| Backend | Node.js + Express + TypeScript | Deployed to Railway. Rate limiter skips in dev / CI; production-only. |
| Database | PostgreSQL via Supabase | |
| ORM | Prisma | Schema in `packages/db/` |
| Frontend hosting | Vercel | SPA config |
| Auth | Email/password + Google OAuth + Steam OpenID | JWT in HTTP-only cookies — never localStorage |
| Delivery | PWA | Installable on desktop (Chrome) and mobile (Safari/Chrome). `viewport-fit=cover` + `100dvh` + `env(safe-area-inset-*)` for notch / home indicator. |
| Accessibility | WCAG 2.1 AA enforced | `eslint-plugin-jsx-a11y` blocks regressions in CI; `@axe-core/playwright` runs against every route on every PR; Lighthouse Accessibility threshold ≥ 95. |
| Game metadata | IGDB via Twitch OAuth | Covers search, upcoming releases, cover art |
| How Long to Beat | `hltbapi.codepotatoes.de` (HLTB community proxy) + IGDB `/game_time_to_beats` fallback | Layered chain: Steam-ID → IGDB time_to_beat. Captures `Game.hltbId` + `Game.gogAppId` from the codepotatoes.de payload. |
| Steam library | Steam Web API (`IPlayerService/GetOwnedGames`) | Via OpenID OAuth |
| PSN library | `psn-api` npm + NPSSO token | User pastes token from browser cookies |
| Xbox library | OpenXBL API | Requires API key from user |
| GOG library | GOG community OAuth | Undocumented — treat as fragile |

**Why no Tailwind?** The design system is custom, dense, and uses a lot of utility classes that map directly to CSS variables. Mapping all of that through Tailwind's config would add complexity without benefit. The CSS is written once and reused everywhere.

**Why a separate Express API instead of Next.js API routes?** The backend has significant non-HTTP workload: background sync jobs, platform OAuth flows, IGDB caching, HLTB fetching. An Express service on Railway gives full control. The frontend is a pure SPA that consumes the API.

---

## Repository Structure

```
hoard/
├── apps/
│   ├── web/                  # React + TypeScript frontend (Vercel)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── primitives/   # Icon, Chip, Btn, Cover, Plat, StatusSigil, etc.
│   │   │   │   ├── layout/       # Sidebar, TopBar, MobileFrame, MobileTabBar, etc.
│   │   │   │   └── screens/      # Dashboard, Library, Upcoming, GameDetail, Settings
│   │   │   ├── hooks/            # useBreakpoint, useGames, useDashboard, etc.
│   │   │   ├── lib/              # api.ts (typed fetch client), mockData.ts, utils
│   │   │   ├── styles/
│   │   │   │   ├── tokens.css    # All CSS variables — single source of truth
│   │   │   │   └── global.css    # Base reset + all utility classes
│   │   │   └── main.tsx
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── icons/
│   │   └── vite.config.ts
│   └── api/                  # Node.js + Express backend (Railway)
│       └── src/
│           ├── routes/           # /api/games, /api/dashboard, /api/upcoming, /api/auth, etc.
│           ├── middleware/       # auth, validation (Zod), rate limiting, error handler
│           ├── services/
│           │   ├── platforms/    # steam.ts, psn.ts, xbox.ts, gog.ts
│           │   ├── igdb.ts       # IGDB API client with LRU cache
│           │   └── hltb.ts       # HowLongToBeat fetcher
│           └── index.ts
├── packages/
│   ├── db/                   # Prisma schema, migrations, seed script
│   └── types/                # Shared TypeScript interfaces (GameStatus, PlatformCode, etc.)
├── docs/
│   ├── PLAN.md               # Execution plan — phases, deliverables, success criteria
│   └── ENV.md                # Environment variables reference
├── project/                  # Design source — HTML/CSS/JS prototypes (read-only)
│   ├── styles.css            # Design system CSS
│   ├── primitives.jsx        # Shared React primitives (design reference)
│   ├── screens-dashboard.jsx # Earlier screen sketches (dashboard, library, upcoming)
│   ├── screens-library.jsx
│   ├── screens-upcoming.jsx
│   └── Hoard.html            # Full hi-fi mockup — ALL screens including settings, platform
│                             # connect, PSN guided flow, delete account (sections 01–11)
├── CLAUDE.md                 # Claude Code operational guide
├── AGENT.md                  # This file
└── package.json              # npm workspaces root
```

---

## Screens & Routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Dashboard | Stats, now-playing, ASCII platform bars, activity heatmap, wishlist countdown, random backlog picker |
| `/library` | Library | Horizontal shelves by status, HLTB hints on backlog |
| `/library/:status` | Library filtered | Same view, filtered to one status shelf |
| `/upcoming` | Upcoming releases | Featured countdown, timeline, month tabs, agenda list |
| `/game/:id` | Game detail | Receipt-style record, HLTB block, per-platform playtime, notes |
| `/settings` | Settings / platforms | Account, Platforms, Preferences, Danger Zone — design in `project/Hoard.html` sections 05–11 |
| `/login` | Auth | Email/password + Google + Steam — no design file; implement with design system conventions |

Breakpoint: `≥ 1024px` renders desktop layout (sidebar + topbar). Below renders mobile layout (status bar + tab bar).

Design components exist for all screens in `project/Hoard.html`. Settings and platform connect screens (sections 05–11) were added and Phase 4 is now fully unblocked. The `/login` screen has no design file — implement using design system conventions.

---

## Data Model

```
User
  id, email, name, createdAt
  hypeThreshold: Int @default(5)       -- IGDB upcoming feed filter
  libraryView: String @default("shelves")  -- 'shelves' | 'grid' | 'list'
  showHltb: Boolean @default(true)
  coverDensity: String @default("standard")  -- 'cozy' | 'standard' | 'dense'
  terminalCursor: Boolean @default(true)
  (multi-user schema from day one — all records scoped to userId)

Platform
  id, userId
  code: STEAM | PSN | XBOX | GOG | NINTENDO | EPIC
  credentials: encrypted JSON (null for NINTENDO / EPIC)
  syncable: bool (false for NINTENDO and EPIC)
  lastSyncAt, syncStatus: ok | syncing | error | stale | manual
  syncFrequency: FIVE_MIN | FIFTEEN_MIN | HOURLY | MANUAL  -- read by client useAutoSync hook

Game
  id, igdbId (unique), title, developer
  steamAppId (unique, nullable) — populated during Steam sync; used for HLTB lookups
  hltbId (nullable) — HLTB internal game id; captured from codepotatoes.de payload; enables real HLTB deep-link
  gogAppId (nullable) — captured from codepotatoes.de payload; future GOG sync key
  releaseYear, genres: String[]
  coverUrl (from IGDB), metadata: JSON  [metadata field is currently unused — flagged for cleanup]

UserGame
  id, userId, gameId
  status: Playing | Backlog | Completed | OnHold | Dropped | Wishlist
  playtimeByPlatform: JSON { ST: minutes, PS: minutes, … }
  lastPlayedAt, notes: String, rating: 1–10 | null
  addedAt, updatedAt

HltbData
  id, gameId (unique)
  mainStory, mainExtras, completionist (all in minutes)
  source: 'hltb' | 'igdb' (default 'hltb') — distinguishes HLTB community data from IGDB time_to_beat fallback
  fetchedAt (refreshed every 30 days)

WishlistRelease
  id, igdbId, title, developer
  releaseDate: Date | null
  releaseDateCategory: YYYY | Q1-Q4 | TBA
  platforms: String[], genres: String[]
  coverUrl: String | null
  synopsis: String | null
  hype: Int | null
  category: Int @default(0) — IGDB category (0=main_game, 2=DLC, 8=remake) — drives DLC/remake chip on Upcoming
  userId (tracks whether this user is tracking it)
```

---

## Key Decisions

All of these are closed and final for v1. Do not re-open them.

**1. Settings screen**
In scope for v1. Design delivered in `project/Hoard.html` (sections 05–11). Layout: `SettingsNav` sidebar with 8 sections (Account, Platforms, Library, Notifications, Appearance, Privacy, Data export, Danger zone). Platforms section uses a dedicated per-platform page (Variant B — `ConnectDedicatedDesktop`) with tabs (auth / scope / sync / log) and a stats sidebar. PSN NPSSO flow is a 5-step guided walkthrough (`GuidedFlowDesktop`) with a live browser-mock showing the user exactly what to copy.

**2. Nintendo / Epic platforms**
No sync — no viable public API exists and none is coming. These platforms appear as selectable labels only. Games are added manually: user searches IGDB, picks the game, assigns `platformLabel: "Nintendo"` or `"Epic"`, chooses a status. No CSV import.

**3. Stats / Wrapped screen**
Deferred to v2. The Dashboard covers the key numbers. Building a stats screen before there is real accumulated data is designing in a vacuum.

**4. Random backlog picker**
Permanent, minimal Dashboard feature. Not an Easter egg. One suggested game from the backlog (weighted toward shorter HLTB estimates and games already started), one shuffle button. Sits inline on the dashboard — no dedicated route, no algorithm surface, no modal.

**5. Auth providers**
Three at launch: email/password, Google OAuth 2.0, Steam OpenID. Steam OpenID infrastructure is already needed for the Steam library sync, so the incremental cost is low.

**6. Multi-user schema**
Schema is multi-user-ready from day one (all records scoped to `userId`). No user-facing multi-user features in v1.

**7. Production deployment**
Web: Vercel at `gamehoardr.com`. API: Railway at `api.gamehoardr.com`, **EU West (Amsterdam)** region. Database: Supabase at `aws-0-eu-west-1.pooler.supabase.com:6543` (transaction pooler) — single project shared across dev and prod (Option A). Custom domain registered at Porkbun, DNS at Porkbun, SSL auto-provisioned by Vercel and Railway. Both subdomains share `.gamehoardr.com` parent so auth cookies are first-party — required for iOS Safari + Chrome incognito to work. **Region match between API host and DB is load-bearing:** the API was originally in us-west and every DB query paid ~150-200 ms transatlantic RTT, putting the dashboard at ~10 s end-to-end. Moving to EU West dropped it 22×. `DATABASE_URL` query string must include `?pgbouncer=true&connection_limit=5` — `pgbouncer=true` for transaction-mode compatibility, `connection_limit=5` so parallel `Promise.all` queries actually run in parallel (full breakdown in `CLAUDE.md` "Operational gotchas").

**8. Cross-origin auth cookie strategy**
JWT session cookie set with `SameSite=None; Secure` in production, `SameSite=Lax` in dev. Driven by `NODE_ENV === 'production'` check in `cookieOptions()` helper at `apps/api/src/routes/auth.ts`. The custom domain (key decision 7) makes cookies first-party regardless of these flags, but the SameSite=None config remains correct in case of future preview deployments under a different domain.

**9. Test isolation strategy**
Backend integration tests mock Prisma at the module level (each test file: `jest.mock('@hoard/db', () => ({ prisma: { ... } }))`). No live DB connection during `npm test`. The `hoard-test` Supabase project that earlier docs referenced was never provisioned — the value at this layer is in route logic, status code mapping, and request/response shape, not in exercising actual SQL.

**10. Supabase RLS**
RLS is enabled on every public table even though the codebase doesn't use Supabase's PostgREST API. Reason: Supabase's anon key is public (often leaked accidentally), and without RLS, anyone with the project URL + anon key can hit `https://<ref>.supabase.co/rest/v1/User` and read every row including `User.password`. Prisma uses the `postgres` role which bypasses RLS, so application queries are unaffected. Captured in migration `20260504100000_enable_rls_on_public_tables`.

**11. WCAG 2.1 AA accessibility**
Hard requirement, not a personal-tool nicety. Hoard may be released as a product later, so accessibility is enforced from launch. Triple-layered guardrails: (a) `eslint-plugin-jsx-a11y` (recommended ruleset) blocks PRs that introduce new violations — `<div onClick>` without keyboard support, missing form labels, etc. all fail lint. (b) `@axe-core/playwright` E2E (`apps/web/tests/e2e/a11y.spec.ts`) asserts zero WCAG 2.1 A + AA violations on Dashboard / Library / Upcoming / GameDetail / Settings / Login on both desktop and mobile viewports — 12 tests, all passing. (c) Lighthouse CI threshold raised to Accessibility ≥ 95 (was 90 in earlier phases). Manual VoiceOver / TalkBack / WAVE walkthroughs are pre-launch tasks, not blocking CI.

**12. Typography & line-height tokens**
Every font-size in the codebase uses `var(--text-*)` from a constrained 11-step scale (`--text-3xs` 10px → `--text-display` 96px). Floor: interactive text ≥ `--text-xs` (12 px); body content ≥ `--text-sm` (13 px). Receipt internals, barcodes, big-numbers, and the `.plat` 9 px badge are documented exceptions. `--paper-faint` is banned as a *text* color anywhere font-size < 17 px (the `.t-faint` utility class is mapped to `--paper-dim` ≥ 9.4:1 contrast); the raw `--paper-faint` token is still legitimate for decorative borders / dividers. Line-height tokens: `--lh-tight 1.15` / `--lh-snug 1.3` / `--lh-normal 1.5` / `--lh-relaxed 1.7`. Magic-number font-sizes outside the documented exceptions are a regression.

**13. Mobile parity scope (Phase 8 PR 4)**
Mobile screens are full peers of desktop, with one intentional exception: `PlatformDetailMobile` does not show the activity log tab — low-value content that needs lots of vertical space, rarely consulted on mobile. Every other Desktop interaction is wired on Mobile (status picker, notes editor, action buttons, filter chips, sort, scope toggle, sync-frequency picker, etc.). The whole-card-tap pattern is preferred over multi-button rows where viewport is tight. *(Library view-mode toggle was removed from both desktop and mobile in PR A — see decision 17.)*

**14. Mobile shell is platform-correct (Phase 8 PR 2)**
No fake / hardcoded chrome. The OS status bar is painted by `apple-mobile-web-app-status-bar-style="black-translucent"`; the app draws no chrome of its own there. Mobile tab bar uses `repeat(4, 1fr)` grid (matching the actual tab count); active tab indicated by both color + 2 px amber top border (color alone fails WCAG H1); press feedback via `:active`; light haptic via `navigator.vibrate?.(8)`; safe-area-inset respected so the home indicator gesture region is clear. `MobileFrame` renders exactly the children — no decorative shell.

**15. HLTB layered fallback chain (Post-8 PR D)**
Time-to-beat data has no single reliable source — HLTB's official site is bot-protected, the community proxy `hltbapi.codepotatoes.de` is ID-keyed only, and IGDB has its own `time_to_beat` endpoint with sparser coverage. We layer them: `/steam/{steamAppId}` → IGDB `/game_time_to_beats` (separate endpoint, NOT a sub-field on `/games`). For non-Steam games, `scripts/backfill-psn-hltb.ts` does Steam Store title-search to find an `appid` first. `HltbData.source` distinguishes `'hltb'` from `'igdb'`; `Game.hltbId` and `Game.gogAppId` are captured from the codepotatoes.de payload for future deep-links / GOG sync. `howlongtobeat-core` (Feb 2026 npm) is rejected — same fragility profile as the package that already broke once.

**16. Two distinct searches with two distinct shortcuts (Post-8 PR A — D2)**
TopBar's Cmd-K opens an IGDB-wide global search (can find games the user doesn't own and upcoming releases). The Library page's `/`-shortcut focuses a separate input that queries only the user's owned games (via `/api/games?q=`). Both are honest about scope. Library shelves view drops sort + plat-filter chips entirely (Post-8 PR A — D4) since they only operated on the top-12 per shelf returned by `/api/games/shelves` — those controls live on the filtered single-shelf page where the full set is loaded.

**17. Library view-mode is permanent shelves-only (Post-8 PR A — D5)**
The view-mode chips (shelves / grid / list) and the corresponding `prefs.libraryView` setting were removed from desktop and mobile. Grid + list layouts were never built; the chip toggle had zero observable effect. `User.libraryView` schema column is kept as a no-op default to avoid a migration. Desktop also lost the `?view=` URL param.

**18. Mobile back buttons + Apple HIG hit areas (Post-8 PR A — D6 + D7)**
`MobileHeader` defaults `onBack` to `navigate(-1)` when no handler is supplied (was silently dead UI on every Settings + PlatformDetail sub-page). Clickable mobile icons use the `.m-icon-btn` utility — 44×44pt min hit area, transparent default, `:active` press flash, `-webkit-tap-highlight-color: transparent`, paired with `aria-label` and `navigator.vibrate?.(8)`. Apple HIG-compliant touch targets enforced for all bare clickable icons.

**19. Mobile shell viewport lock (Post-8 PR A — D7)**
`html, body` get `overflow: hidden` + `overscroll-behavior: none` to kill iOS rubber-band of the entire page. Inner scroll surfaces (`.thin-scroll`, `.app-content`, `.app-mobile-content`, `PullableScroll`) get `overscroll-behavior: contain` — keeps native bounce inside the scroll surface but prevents propagation. Header + tab bar stay in place during drag.

**20. Real Upcoming wishlist scope + Path-B persistence (Post-8 PR B — D1)**
Three real scopes on `/api/igdb/upcoming`: `my-platforms` (IGDB feed, hype-filtered, your platforms), `all` (IGDB feed, hype-filtered, all platforms), `wishlist` (DB read of `WishlistRelease` rows; no hype/platform filter). The wishlist-toggle endpoint persists every IGDB field — `releaseDate`, `platforms`, `synopsis`, `hype`, `category`, `releaseDateCategory` — instead of dropping them. Without this fix, the IGDB-down fallback feed showed wishlisted games as TBA / no platforms even when we'd had the data.

**21. Wipe library scope (Post-8 PR C — D10)**
`POST /api/auth/me/wipe-library` deletes the user's `UserGame` rows and disconnects every platform (deletes the `Platform` row). **Preserves `Game`, `HltbData`, `WishlistRelease`, account, preferences, login history.** Wipe is destructive but bounded — wishlist and account state survive. Two-step typed-confirmation modal (`WIPE` keyword) mirrors the delete-account flow (`HOARD` keyword); the modal component is generalised via a `variant` prop.

**22. Releases page rename — surface only (Releases rework, shipped 2026-05-07 — D1)**
The Upcoming page was reworked into the Releases page (`docs/RELEASES_PLAN.md`). The rename is **URL + UI labels only** — internal code keeps `useUpcoming`, `IgdbUpcomingRelease`, `WishlistRelease`, `/api/igdb/upcoming`, `/api/upcoming/:igdbId/wishlist`, and the database tables. The data model (a future release date — `WishlistRelease` — and a list of upcoming items — `IgdbUpcomingRelease`) is unchanged; only the page name shifts. Future agents who find themselves doing a search-and-replace of "upcoming" across the codebase should stop and re-read `docs/RELEASES_PLAN.md` §1 before proceeding. The `SOON` mobile tab label stays — it's already abstract and ties to the page concept, not its name. Enforced by `scripts/check-rename-rule.ts` (run via `npm run check:rename-rule` locally; same script runs in CI).

**23. RECENT page server-side library filter (Releases rework — D2)**
`/releases/recent` filters the "starred" list against `UserGame.game.igdbId` server-side, not client-side. Single endpoint `GET /api/releases/recent` returns `{ starred, hyped }` rather than two separate routes. The client never joins library data with the recent feed — once a wishlist item appears in the user's library via platform sync, it disappears from RECENT automatically. Library sync is the source of truth for ownership; RECENT never mutates ownership state and intentionally has no manual "I got this" button.

**24. Muted-banner threshold is constant (Releases rework — D3)**
The muted-variant `RecentBanner` qualifier is `hype >= 80`, hard-coded in banner logic. It is **not** the user's `User.hypeThreshold` setting. The user's threshold filters the IGDB feed for All-Releases mode; the banner threshold is independent so the banner stays comparable across users. If we want to tune banner sensitivity later, the threshold lives in one place (`apps/api/src/routes/releases.ts`).

**25. Quarters zoom rolls forward; past releases invisible (Releases rework — D4)**
Quarters zoom shows 3 dated buckets (current quarter + next 2) plus a TBA catch-all. Past releases are invisible everywhere on the Releases page (the `/releases/recent` 14-day window is the explicit exception). Anything that doesn't land on one of the 3 dated quarter buckets — truly-dateless releases, far-future quarters, far-future year-only dates — falls into TBA. Months zoom shows current + next 5 with no TBA (dateless never lands in a dated month).

**26. Hero countdown hide rule (Releases rework — D5)**
The wishlist Hero countdown shows iff `wishlist.some(r => r.away >= 0)`. If the closest starred drop is in the past, the Hero hides; the conditional `RecentBanner` does the work of surfacing recent drops instead. The Hero is the page's "what am I most looking forward to" anchor, not a recency tracker — it's a global property of the wishlist (next-starred-globally), not per-bucket.

**27. Hero buttons are wishlist toggle only (Releases rework — D6)**
The `HeroCountdown` ships with only the `[on wishlist]` toggle. `[trailer]` and `[remind me]` (visible in earlier mocks) are deferred to v2 — there's no backing data to wire either to. Better to surface fewer, real buttons than a row of dead UI.

**28. RECENT response uses unified `IgdbUpcomingRelease[]` shape (Releases rework — D7)**
`GET /api/releases/recent` returns `{ starred: IgdbUpcomingRelease[], hyped: IgdbUpcomingRelease[] }` — same element shape across both lists. Server-side maps `WishlistRelease` rows into `IgdbUpcomingRelease` shape (`wishlisted: true`, drops the unused DB pk + userId). The client treats both lists with the same primitives (`ReleaseCard variant="recent"` / `MobileReleaseRow`), so two shapes would have forced casts and conditional rendering for no semantic gain.

**29. Wishlist is sync'd between two tables, not stored in one (Post-rework — 2026-05-07)**
The "wishlist" concept lives in two tables and they're kept in sync at one boundary — `POST /api/upcoming/:igdbId/wishlist`. `WishlistRelease` carries upcoming-release metadata (date, hype, category, releaseDateCategory) needed for the Releases page. `UserGame.status = 'Wishlist'` carries the library-citizen role: search results, Library Wishlist shelf, `/game/:id` detail page. Toggling on creates both atomically via `$transaction`; toggling off deletes both, but the `UserGame` is dropped only when its status is still `'Wishlist'` — preserves the user's library decision when they've manually moved a wishlisted game off the shelf. The two tables intentionally aren't merged because: (a) `WishlistRelease` carries fields `UserGame` doesn't, (b) consolidation would force schema work for zero functional gain. Per-response decoration: every `IgdbUpcomingRelease` response includes a `userGameId: string | null` field via a `userGameMap(userId, igdbIds)` helper, so the client can route to `/game/${userGameId}` without a separate lookup. RECENT page filter rule was tweaked alongside: drop a starred row only when its `UserGame.status !== 'Wishlist'` (i.e., the user actually owns it via sync or manual move) — the prior "drop if any UserGame exists" rule would have dropped every starred drop after the auto-creation kicked in.

**30. Platform sync cadence is client-side, not server-side cron ("feel alive" batch — 2026-05-07)**
`Platform.syncFrequency` is read by `apps/web/src/hooks/useAutoSync.ts` — mounted once at `AppShell` — which fires `POST /api/platforms/:code/sync` for any platform whose `lastSyncAt` is older than its frequency window. Triggers: on mount, on `visibilitychange` (returning to the tab), and on a once-per-minute interval while the tab is visible. The picker label intentionally reads "how often hoard polls your library **while the app is open**" — that's what it does, and that's what the user actually experiences. **Decision:** server-side cron (Railway cron job or `node-cron` inside the API process) was rejected for v1 because (a) Hoard is a one-user personal tool — running a long-lived scheduler for one user is disproportionate, (b) Steam/PSN library data doesn't change often enough to warrant background polling when the user isn't looking, and (c) honest semantics beats infrastructure: the user opens the app to check things, the app refreshes on open. If overnight catch-up becomes desirable later, a single nightly Railway cron is a small additional step on top of this — not a precondition. Default `HOURLY`. `MANUAL` opts out entirely (the explicit "sync now" button is always available regardless of cadence).

**32. IGDB title-matching uses soft-score, not results[0] (sync-quality batch — 2026-05-08)**
The platform-sync flow used to pick `results[0]` from IGDB's relevance search and call it a day. Two production bugs proved that's not enough: the Korean mobile MMO "Ragnarok: War of Gods" beat "God of War Ragnarök" on a PSN sync (keyword overlap on "ragnarok", no popularity tiebreak), and the early-access "Slay the Spire 2" beat "Slay the Spire" on a Steam sync (sequel had fresher IGDB activity). Fix: `apps/api/src/services/igdbMatch.ts` implements `pickBestMatch(query, results, platformCode)` — a soft scoring function that combines normalized title similarity (exact match +1000 / prefix +200 / all-words-contained +50), platform agreement with the syncing platform (+500 / -200 wrong / +50 unknown), and popularity (`log10(total_rating_count)*10`). **Soft scoring, not hard filtering.** A wrong-platform result with a perfect title match can still win when nothing else matches the right platform — IGDB's platform data is sometimes incomplete and we don't want false negatives. The `IgdbSearchResult` shape is extended with `platforms: string[]` + `totalRatingCount: number | null` so this matcher has the data it needs. Steam-ID lookups (`getGameBySteamId`) still bypass this matcher — an exact Steam App ID is unambiguous. Catches Slay-the-Spire-2 going forward; for already-synced rows, `scripts/audit-mismatches.ts` cross-checks IGDB platforms against synced-from platforms (catches the Ragnarok-MMO class but not the Slay-the-Spire-2 class — the sequel IS on PS5, just the wrong title; remap is user-eyeballed via Prisma Studio for v1).

**31. HeroCountdown ticks live, paused when tab hidden ("feel alive" batch — 2026-05-07)**
The Wishlist Hero's d/h/m/s grid re-renders at 1 Hz via the `useNow(intervalMs)` hook (`apps/web/src/hooks/useNow.ts`), pausing on `document.hidden` and resuming on `visibilitychange` so a backgrounded tab doesn't burn battery. `countdownParts(iso, now?)` and `daysUntil(iso, now?)` in `lib/utils.ts` accept an optional `now` parameter (default `Date.now()`) so the live value is threaded through deterministically per render — every digit in the grid reflects the same instant. The 1 Hz cadence is what makes the seconds digit visibly tick, which is what makes the page feel alive vs. frozen. Other timestamp surfaces ("synced 2h ago" labels, `T-N` pills on Agenda rows) deliberately do **not** tick — those only need to be correct on each route entry, and the constant re-render cost is unwarranted at that grain.

---

## v2 Backlog (Explicitly Deferred)

Do not build these in v1, even if they seem small:
- Stats / Wrapped annual summary screen
- Multi-user onboarding and public profiles
- Achievement tracking detail view
- "Games like this" / recommendation features (out of scope indefinitely)
- CSV import for Nintendo / Epic (manual IGDB add covers the need for v1)

---

## Platform Integration Notes

**Steam:** OpenID OAuth → Steam Web API. Same OpenID flow is reused for Steam login. Library via `IPlayerService/GetOwnedGames`. Playtime in minutes from the API.

**PSN:** The user must retrieve an NPSSO token from their browser's cookie storage after visiting the PSN website. This is non-standard — it requires step-by-step UI instructions in the Settings screen. The `psn-api` npm package handles the actual API calls. Pin the package version; the PSN API is unofficial.

**Xbox:** OpenXBL API key (user obtains from openxbl.com). Library fetch via their REST API. Validate early whether the free tier covers full library access.

**GOG:** Community-documented OAuth. The API is undocumented and has been known to change. Treat as fragile — if it breaks, the fallback is manual add.

**Nintendo / Epic:** No integration. Not planned.

---

## External Service Notes

**IGDB:** Twitch OAuth client credentials (token cached server-side, refreshed on expiry). Rate limit: 4 req/s on free tier. All IGDB responses must be cached (LRU, 5-minute TTL for search, 24-hour for upcoming). Used for: game search, metadata, cover art, upcoming releases feed.

**HowLongToBeat:** Layered fallback chain (post-Phase-8 PR D, 2026-05-06):

1. **`hltbapi.codepotatoes.de/steam/{steamAppId}`** — community proxy keyed by Steam App ID. Returns `mainStory`, `mainStoryWithExtras`, `completionist` in hours, plus `hltbId` and `gogAppId` (captured onto Game). Requires `Game.steamAppId` to be set.
2. **IGDB `/game_time_to_beats`** — IGDB's own dedicated time-to-beat endpoint, keyed by `game_id`. NOT a sub-field on `/games` — common gotcha. Returns `hastily / normally / completely` in seconds. We map `normally → mainStory`, `completely → completionist`, no `mainExtras` equivalent. Fallback used when path 1 returns nothing.

For non-Steam games (PSN/Nintendo/Epic/manual), `scripts/backfill-psn-hltb.ts` runs Steam Store title-search → if a match is found, the game gets a `steamAppId` and re-enters path 1.

The original `howlongtobeat` npm package is dead (HLTB rolled out Cloudflare bot protection requiring per-request tokens). The newer `howlongtobeat-core` (Feb 2026) reverse-engineers the bot-protected internal API and was rejected for the same fragility profile that already broke the previous package.

Fetch triggered in the background when a `UserGame` is created or status changes to `Playing`/`Backlog`. Result stored in `HltbData` with `source: 'hltb' | 'igdb'`. If every layer fails, store nothing and show "—" in the UI. Never block a user action on HLTB availability. The residual structural gap (titles in neither HLTB nor IGDB) is accepted silently.

---

## Risks to Know About

| Risk | What to watch for |
|---|---|
| PSN NPSSO token format changes | Pin `psn-api` version. If sync breaks, users re-enter their token. |
| HLTB API changes | `hltbapi.codepotatoes.de` is community-maintained — it may go down or change. Silent failure path is in place; IGDB `/game_time_to_beats` covers as a secondary fallback. If both break, store nothing and show "—". |
| IGDB rate limit | LRU cache is mandatory, not optional. Batch requests where possible. |
| GOG API instability | Degrade to manual-add gracefully if OAuth flow fails. |
| OpenXBL paid tier required | Validate whether free tier returns full library before implementing. |
| Supabase free tier limits | Monitor row count and bandwidth. Plan is to upgrade if limits approach. |

---

## What This Project Is Not

- Not a social network. No followers, feeds, or public profiles.
- Not a recommendation engine. Hoard does not tell you what to play next (except the random backlog picker, which is deliberately dumb).
- Not a review platform. Rating and notes are private only.
- Not a SaaS product. Built for one user. Multi-user is a future consideration, not a current one.
