# Hoard — Agent Project Brief

Read this before starting any task. It covers what Hoard is, why decisions were made, and the full context any agent needs to work aligned with the project's direction.

For phase-by-phase deliverables, success criteria, and testing requirements, read `docs/PLAN.md`. For operational commands and hard rules, read `CLAUDE.md`.

---

## What Is Hoard

Hoard is a personal game tracking PWA. It connects to your gaming accounts across Steam, PlayStation, Xbox, and GOG, pulls your libraries automatically, and gives you one place to see everything you own, everything you're playing, and everything you're waiting for.

The name is intentional. A hoard is a collection that got out of hand — and that's the point. Hoard doesn't judge the backlog. It celebrates it.

**This is a personal tool, not a SaaS product.** It is built for one user (andrea) and designed accordingly — dense, a little obsessive, and proud of it. Do not make it generic. Do not soften the aesthetic. Do not add features to appeal to a broader audience.

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
| Styling | Custom CSS variables (no Tailwind) | Design system is hand-crafted; every token is defined |
| Routing | React Router v6 | Client-side only |
| Backend | Node.js + Express + TypeScript | Deployed to Railway |
| Database | PostgreSQL via Supabase | |
| ORM | Prisma | Schema in `packages/db/` |
| Frontend hosting | Vercel | SPA config |
| Auth | Email/password + Google OAuth + Steam OpenID | JWT in HTTP-only cookies — never localStorage |
| Delivery | PWA | Installable on desktop (Chrome) and mobile (Safari/Chrome) |
| Game metadata | IGDB via Twitch OAuth | Covers search, upcoming releases, cover art |
| How Long to Beat | `howlongtobeat` npm package | Unofficial scraper — treat it as fragile |
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
│   ├── screens-dashboard.jsx
│   ├── screens-library.jsx
│   ├── screens-upcoming.jsx
│   └── Hoard.html            # Full hi-fi mockup (includes game detail screen)
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
| `/settings` | Settings / platforms | Platform cards, connect/disconnect, sync status — **blocked pending design** |
| `/login` | Auth | Email/password form + Google + Steam login |

Breakpoint: `≥ 1024px` renders desktop layout (sidebar + topbar). Below renders mobile layout (status bar + tab bar).

Design components exist for all screens in `project/`. `/settings` and `/login` are not yet designed — they will be added before Phase 4 implementation.

---

## Data Model

```
User
  id, email, name, createdAt
  (multi-user schema from day one — all records scoped to userId)

Platform
  id, userId
  code: STEAM | PSN | XBOX | GOG | NINTENDO | EPIC
  credentials: encrypted JSON (null for NINTENDO / EPIC)
  syncable: bool (false for NINTENDO and EPIC)
  lastSyncAt, syncStatus: ok | syncing | error | stale | manual

Game
  id, igdbId (unique), title, developer
  releaseYear, genres: String[]
  coverUrl (from IGDB), metadata: JSON

UserGame
  id, userId, gameId
  status: Playing | Backlog | Completed | OnHold | Dropped | Wishlist
  playtimeByPlatform: JSON { ST: minutes, PS: minutes, … }
  lastPlayedAt, notes: String, rating: 1–10 | null
  addedAt, updatedAt

HltbData
  id, gameId (unique)
  mainStory, mainExtras, completionist (all in minutes)
  fetchedAt (refreshed every 30 days)

WishlistRelease
  id, igdbId, title, developer
  releaseDate: Date | null
  releaseDateCategory: YYYY | Q1-Q4 | TBA
  platforms: String[], genres: String[]
  userId (tracks whether this user is tracking it)
  hype: 1–5, synopsis
```

---

## Key Decisions

All of these are closed and final for v1. Do not re-open them.

**1. Settings screen**
In scope for v1. Design will be delivered before Phase 4 starts. Layout: one card per platform showing connected/disconnected state, last sync time, connect/disconnect action. PSN card has inline NPSSO retrieval instructions — not a link to external docs, actual numbered steps with code-formatted cookie names.

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

**HowLongToBeat:** Community-maintained npm package (`howlongtobeat`) — unofficial scraper, not an API. Treat it as fragile. Fetch triggered in the background when a `UserGame` is created or status changes to `Playing`/`Backlog`. Cache result in `HltbData`. If the fetch fails for any reason, store `null` and show "—" in the UI. Never block a user action on HLTB availability.

---

## Risks to Know About

| Risk | What to watch for |
|---|---|
| PSN NPSSO token format changes | Pin `psn-api` version. If sync breaks, users re-enter their token. |
| HLTB scraper breaks | Silent failure path must be tested. Show "—", never an error. |
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
