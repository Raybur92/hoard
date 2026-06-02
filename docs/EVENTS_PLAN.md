# Events workstream plan (EV-series)

Source spec: `docs/PAGES_PLAN.md` §6 (PAGES v2 functional analysis). This doc carries that section forward into a per-PR plan with locked decisions, open questions to resolve before code, schema + route shape, and a status table.

**Workstream branch:** `ev-pr1-foundation` (git worktree at `../Hoard-events`). Lives alongside the parallel DEALS-PR2.5 workstream on `main`.

---

## 0. Status tracking

| PR | Scope | Status | Notes |
|---|---|---|---|
| EV-PR1 | Foundation: schema + IGDB sync + `/events` list + `/events/:slug` detail + sidebar nav + `.ics` export | Drafting plan | This doc |
| EV-PR2 | Filter chips + search + year-jump + game-grid filter (my-platforms / wishlisted / all) | Not started | Picked up after EV-PR1 lands |
| EV-PR3 | Live-stream embedding + Dashboard "you missed" widget + `EventGame.announcementType` derivation + GameDetail back-link wiring (closes OQ-GD-7) | Not started | Depends on GD-PR5 placeholder for back-link |
| EV-PR4 | Polish: mobile layout pass + axe-core a11y verification + per-vendor calendar deep-links (Google / Apple / Outlook) | Not started | EV-PR1 already ships `.ics` per OQ-EV-10 |

---

## 1. Context

Events is a net-new top-level surface. Two clear time-axis states (upcoming / past) mirror GameDetail v2's state-pair split. Primary user job per Andrea's framing: **"I missed [State of Play / Direct / Showcase] — what was announced?"** (retrospective). Secondary: anticipation of upcoming showcases (prospective).

IGDB's `events` endpoint returns per-event metadata (`name`, `slug`, `description`, `start_time`, `end_time`, `live_stream_url`, `time_zone`, `event_logo`, `event_networks`, `videos`) **plus a `games` array** giving direct game-to-event association — no inference needed.

The cron+DB+render pattern is reused from Deals (let cron own the freshness; render from DB). Nightly sync + admin manual-refresh button covers the freshness story per OQ-EV-2.

---

## 2. Locked decisions (carried over from PAGES_PLAN §6.6)

These were already locked during the PAGES_PLAN v2 spec session (2026-05-29). Re-stated here for the workstream's working memory; do not reopen without explicit Andrea-led revisit.

### EV-D1 — Sync cadence (OQ-EV-2 locked)
Nightly cron + admin manual-refresh button. No tiered cadence (no separate hourly upcoming / 5-min live). The nightly job handles new-event discovery + community-curation backfill; the manual `[refresh events]` button on `/admin` handles the "I want to see what just got added" case without infrastructure cost.

### EV-D2 — Live stream embedding (OQ-EV-5 locked)
Embed inline + deep-link fallback rendered immediately below. CSP gains `frame-src https://www.youtube.com https://player.twitch.tv`. Embed handles streaming UX natively (autoplay, fullscreen, captions); broken embeds (region lock, uploader disabled embedding) degrade to the fallback `[watch on YouTube/Twitch →]` link. **Lands in EV-PR3, not EV-PR1.**

### EV-D3 — Calendar export (OQ-EV-10 locked)
`.ics` file download in EV-PR1. Per-vendor deep-links (Google / Apple / Outlook) in EV-PR2 as a ~30-line URL-builder enhancement. Subscription feeds (`webcal://`) and PWA push reminders explicitly deferred — they need infra Hoard doesn't have yet; `.ics` covers the actual reminder use case.

### EV-D4 — URL key (OQ-EV-1 recommendation accepted)
Use IGDB's `slug` as the URL key (`/events/state-of-play-2026-04`). Server resolves slug → IGDB event → DB row. Cleaner share-links, easier debugging.

### EV-D5 — Sparse-data events (OQ-EV-4 recommendation accepted)
Show what we have + a `// game list is community-curated · X games linked so far` disclaimer. Even a sparse list is useful right after the event airs, before community catches up. No event-hiding heuristic.

### EV-D6 — Past-events archive depth (OQ-EV-7 recommendation accepted)
Store all past events ever (IGDB has ~10+ years; storage is cheap). List view default to last 24 months; deeper years accessible via year-jump filter (lands in EV-PR2).

### EV-D7 — Cross-link from `Game` to its events (OQ-EV-8 sequencing accepted)
`Game.events` reverse relation makes this trivial. GameDetail v2 OQ-GD-7's placeholder slot consumes it. Coordination: GameDetail v2 ships the placeholder (already done in GD-PR1+2+3); Events ships the data (EV-PR1 schema); the cross-link goes live when GD-PR5 wires the placeholder to the data (lands as part of EV-PR3 per the EV-series sequencing).

---

## 3. Open questions to lock before EV-PR1 code

Each carries a recommendation; lock or override during plan review.

### OQ-EV1-1 — IGDB endpoint shape + query strings
IGDB's `events` endpoint hasn't been exercised by Hoard before. The query needs to fetch nested data in one round-trip (a la the existing `getReleaseDetails` pattern). Concrete proposal:

```
fields name, slug, description, start_time, end_time, live_stream_url,
       time_zone, event_logo.image_id, event_logo.width, event_logo.height,
       event_networks.network_type.name, event_networks.url,
       videos.video_id, videos.name,
       games.id, games.name;
where start_time != null;
sort start_time desc;
limit 500;
```

**Recommendation: ship as above for EV-PR1.** Sort + window applied client-side (cheaper than running multiple queries per window — IGDB's hard ceiling is 500 per query, same as the Releases page). Past-events archive depth (EV-D6) means we'll need pagination in EV-PR2; for EV-PR1 the most-recent 500 events covers Andrea's actual scan needs (last ~24 months).

### OQ-EV1-2 — Sync write strategy
Per-event upsert by `igdbId` (matches every other IGDB-backed surface). `EventGame` rows: replace-all on sync (delete + recreate the join rows for that event) vs. diff-and-update. **Recommendation: replace-all.** Simpler, idempotent, and the join is small (typically 5-100 games per event). The performance cost is trivial at our scale; the diff-and-update code path is the kind of premature optimisation that bites on weird edge cases (an event game gets removed → diff might leave it stale).

### OQ-EV1-3 — Empty `games` array on sync — write the Event row, or skip?
Some upcoming events arrive with `games: []` because the lineup hasn't been curated yet. **Recommendation: write the Event row regardless.** Per EV-D5 we show sparse events with a disclaimer; an empty-games upcoming event ("State of Play: TBA — June 2026") is exactly the case the user wants to see.

### OQ-EV1-4 — IGDB Game resolution on `EventGame` writes
The IGDB `events.games` array gives us `{id, name}` per game. Two paths:
1. **Resolve to Hoard's `Game` table at sync time.** Match by IGDB id (with title-search + N-FIX URL-pattern fallback if not in Hoard's catalogue yet). Upsert missing Game rows from IGDB. Drives the GameDetail cross-link cleanly.
2. **Store the IGDB id+name on `EventGame` and resolve at read time.** No sync-time Game upserts; the Event detail view does a batched IGDB lookup for cards that aren't in Hoard's catalogue yet.

**Recommendation: #1.** Mirrors what `Game.upsert` already does in syncRunner / wishlistImport / routes/upcoming / routes/games. Keeps the `EventGame.gameId` FK honest and the GameDetail cross-link a single Prisma query away. Cost: a sync of 500 events × avg ~20 games = 10k Game.upsert calls; rate-limited by the existing IGDB 4 req/s cap. Mitigation: pre-batch IGDB lookups (50 ids per `where id = (X, Y, Z)` call — IGDB's standard batch shape).

### OQ-EV1-5 — Detail view live-state logic when `endTime` is null
Some IGDB events carry only `start_time` (the duration is unknown — common for indie showcases and one-off announcements). When `endTime` is null, can we ever render the "live" state?

**Recommendation: yes, with a 4h default window.** If `start_time ≤ now ≤ start_time + 4h` AND `endTime` is null, treat as live. 4h covers the longest-running event types (Summer Game Fest typically 3h, The Game Awards ~3h, big Direct events ~1h). Edge case: a 30-minute Indie Direct lingers "live" for 3.5h after it ends — acceptable; the embed degrades gracefully (the stream URL still works, just shows a "stream ended" page). Encode as a single helper `getEventState(event, now)` returning `'upcoming' | 'live' | 'past'`.

### OQ-EV1-6 — Hero countdown — show *next-soonest globally* or *next-soonest among user's relevant networks*?
PAGES_PLAN §6.4 says "next-soonest upcoming event across all networks, ungated by filter (always shows the actual next thing)". Per-network filtering is OQ-EV-6 deferred to EV-PR2 anyway, so this is moot for EV-PR1 — global next-soonest is the only shape we ship.

**No new decision needed; locked by OQ-EV-6 deferral.**

### OQ-EV1-7 — Mobile tab bar — what gets dropped to fit Events?
MobileTabBar currently holds 5 tabs after DEALS-PR1 widened it (`Dashboard / Library / Releases / Deals / Settings`). Adding Events makes 6, which breaks the `repeat(5, 1fr)` grid + crowds tap targets below comfortable thumb width on iPhone SE / older Androids.

Three options:
1. **Move Settings off the tab bar.** Replace with a hamburger or move into the user-avatar menu. Settings is the least frequently accessed of the 5 — once-per-session at most. Tab bar becomes `Dashboard / Library / Releases / Events / Deals`.
2. **Move Deals off the tab bar.** Less defensible — Deals is more transactional than Settings (a sale expires; settings don't).
3. **Add Events as a 6th tab, accept narrower tap targets.** 6 tabs at 360px viewport = 60px each, still above the Apple HIG 44pt min but visually crowded.

**Recommendation: #1.** Andrea's been clear about valuing tab-bar real estate; Settings access is the natural casualty. **Coordinate with deals agent — this change touches MobileTabBar.tsx in shared scope.** Andrea's call.

### OQ-EV1-8 — `.ics` export — what timezone do we encode?
`.ics` files carry either a UTC timestamp or a timezone-aware local timestamp. IGDB events expose `time_zone` per event (e.g. `"America/Los_Angeles"` for a State of Play). Two paths:
1. **Always UTC.** Calendar apps localize at display time. Simple, robust.
2. **Use the event's source timezone.** `.ics` carries a `TZID=America/Los_Angeles` block; calendar apps render in that zone with a parenthetical "your time: X:XX in your local zone". Matches how event organisers communicate ("starts at 3PM PT").

**Recommendation: #1 for EV-PR1, #2 as a polish item in EV-PR4.** UTC is what every other Hoard surface uses internally; the `.ics` consumer (Google/Apple/Outlook) handles localization correctly on its end. The TZID approach is a quality-of-life enhancement, not a correctness one.

### OQ-EV1-9 — Detail view: handle 404 (slug not in DB) vs. "sync hasn't run yet"
Two failure modes for `/events/:slug`:
- Slug doesn't exist in IGDB at all — proper 404
- Slug exists in IGDB but Hoard's nightly sync hasn't picked it up yet (rare, but: someone shares a link to an event minutes after it's posted to IGDB)

**Recommendation: on 404 from DB, attempt a single on-demand IGDB lookup by slug.** If found, sync that one event inline (cheap — one event = one IGDB query + a small batch of game upserts), then render. If not found, real 404. Adds resilience for the "shared link to a brand-new event" case without coupling to nightly sync timing.

### OQ-EV1-10 — Migration timestamp coordination
The parallel deals agent's most recent migration is `20260531180000_deals_foundation`. EV-PR1's migration should use a timestamp **strictly after that** to avoid collision. **Recommendation: `20260602...` or later.** Pick the timestamp at write time (just before applying), not at planning time, to reflect actual workstream landing order.

---

## 4. Schema design

Hand-written migration (the pattern Hoard uses for all schema PRs).

```prisma
model Event {
  id            String   @id @default(cuid())
  igdbId        Int      @unique
  slug          String   @unique
  name          String
  description   String?
  startTime     DateTime
  endTime       DateTime?
  liveStreamUrl String?
  timeZone      String?
  logoUrl       String?
  networks      Json?    @default("[]")  // [{name, type, url}, ...]
  videos        Json?    @default("[]")  // [{youtubeId, name}, ...]
  games         EventGame[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([startTime])
  @@index([slug])
}

model EventGame {
  id               String @id @default(cuid())
  eventId          String
  gameId           String
  announcementType String?  // nullable per PAGES_PLAN; EV-PR3 derives if patterns extractable
  event            Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  game             Game   @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([eventId, gameId])
  @@index([gameId])
}
```

Existing `Game` model gains the reverse relation: `events EventGame[]`.

**Migration file:** `packages/db/prisma/migrations/<timestamp>_events_foundation/migration.sql`. Hand-written SQL with `CREATE TABLE IF NOT EXISTS` for idempotency (matches every other Hoard migration since I1). Apply via documented `prisma db execute` + `migrate resolve --applied` recipe + Node `$executeRaw` fallback if pgbouncer advisory-lock hangs (see operational gotchas in CLAUDE.md).

**RLS:** new tables get RLS enabled in the same migration to match the existing public-table policy (precedent: I1's `InviteCode` table).

---

## 5. IGDB events service

New file: `apps/api/src/services/events.ts`.

Exports:
- `getEventsBatch(opts?: { limit?: number; offset?: number })` — paginated IGDB query, returns `IgdbEvent[]` (new type in `@hoard/types`)
- `getEventBySlug(slug: string)` — single-event on-demand lookup (powers OQ-EV1-9 resilience)
- `syncAllEvents()` — orchestrator: fetch batch → per-event upsert Event row → resolve Game ids in batched IGDB lookups (50 per call) → replace EventGame join rows → write activity log
- `syncSingleEventBySlug(slug: string)` — single-event variant used by the 404 fallback
- `getEventState(event, now?: Date): 'upcoming' | 'live' | 'past'` — helper per OQ-EV1-5 (4h default window when endTime null)

Uses the existing IGDB `getToken()` + `searchCache`-style in-memory cache (24h TTL on the events batch).

New type in `packages/types/src/index.ts`:
```typescript
export interface IgdbEvent {
  igdbId: number;
  slug: string;
  name: string;
  description: string | null;
  startTime: string; // ISO
  endTime: string | null;
  liveStreamUrl: string | null;
  timeZone: string | null;
  logoUrl: string | null;
  networks: Array<{ name: string; type: string; url: string | null }>;
  videos: Array<{ youtubeId: string; name: string | null }>;
  gameIgdbIds: number[]; // IGDB ids; resolution to Hoard Game rows happens at sync orchestrator
}
```

---

## 6. API routes

New file: `apps/api/src/routes/events.ts`. Mounted at `/api/events` in `apps/api/src/index.ts`.

| Route | Auth | Returns | Notes |
|---|---|---|---|
| `GET /api/events` | `requireUser + requireActive` | `EventsListResponse` (upcoming + recent + past sectioned) | List view payload. Server applies the 24-month default depth window (EV-D6); EV-PR2 adds year-jump |
| `GET /api/events/:slug` | `requireUser + requireActive` | `EventDetailResponse` | Slug lookup. 404-with-sync-fallback per OQ-EV1-9. Carries the full game grid joined to `UserGame` so the personalisation chip ("on your wishlist") can render |
| `GET /api/events/:slug/ics` | `requireUser + requireActive` | `text/calendar` body | `.ics` export per EV-D3 / OQ-EV1-8 |
| `POST /api/admin/events/sync` | `requireUser + requireActive + requireAdmin` | `{ scanned, eventsUpserted, gamesUpserted, gameLinksUpserted }` | Manual refresh button on admin |

Response types in `packages/types/src/index.ts`:
```typescript
export interface EventsListResponse {
  hero: EventListRow | null; // next-soonest upcoming, global
  upcoming: EventListRow[];
  recent: EventListRow[];     // ≤ 30d ago
  past: EventListRow[];       // > 30d ago, within 24-month window
  counts: { upcoming: number; past: number };
}

export interface EventListRow {
  slug: string;
  name: string;
  startTime: string;
  endTime: string | null;
  liveStreamUrl: string | null;
  logoUrl: string | null;
  networks: Array<{ name: string; type: string; url: string | null }>;
  gameCount: number;
  state: 'upcoming' | 'live' | 'past';
}

export interface EventDetailResponse {
  event: EventDetailRow;
  games: EventGameRow[];
  personalisation: {
    onWishlistCount: number;
    onLibraryCount: number;
  };
}

export interface EventDetailRow extends EventListRow {
  description: string | null;
  timeZone: string | null;
  videos: Array<{ youtubeId: string; name: string | null }>;
}

export interface EventGameRow {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  heroImageUrl: string | null;
  announcementType: string | null;
  userGame: { id: string; status: string } | null; // null when user doesn't have it
}
```

Cron entry: new Railway scheduled job at 03:00 UTC hitting `POST /api/admin/events/sync` (admin token in header). **Pre-deploy operational task** — Andrea sets up the cron entry after EV-PR1 ships.

---

## 7. Frontend — list view (`/events`)

New page: `apps/web/src/components/screens/EventsDesktop.tsx` + `EventsMobile.tsx`. Lazy-loaded per the existing pattern.

**Composition order (desktop):**
1. `// EVENTS · N upcoming · M past` heading
2. `EventHeroCountdown` — span-12 dominant card; reuses `HeroCountdown` shape from `screens/releases/` directly (extract or wrap; see OQ-EV1-A below)
3. `// upcoming` section — vertical list of `EventListRow` cards (compact, not card-grid; PAGES_PLAN §6.4 mock shows list layout)
4. `// recent · last 30 days` section — same shape, only renders when `recent.length > 0`
5. `// archive · YYYY` sections — grouped by year, only renders when `past.length > 0` (EV-PR2 adds the year-jump nav)

Each row links to `/events/:slug`. The hero card's `[+ remind me]` button triggers `.ics` download (EV-D3).

**Mobile:** same composition, single-column. Hero card stays the dominant element; rows compress to `EventMobileRow` (40/1fr/auto grid: icon · name+meta · `Xd` countdown).

**Open question OQ-EV1-A — HeroCountdown reuse strategy:**
The Releases page `HeroCountdown` component is in `screens/releases/`. Events needs the same visual + behaviour. Two paths:
1. **Lift to a shared location** — promote `HeroCountdown` from `screens/releases/` to `components/primitives/` or `components/shared/`. One source of truth.
2. **Wrap or duplicate** — create `screens/events/EventHeroCountdown.tsx` that imports `HeroCountdown` from releases and adds event-specific glue (network label, `[+ remind me]` action).

**Recommendation: #2 for EV-PR1.** The Releases HeroCountdown is tightly coupled to release-specific data (`IgdbUpcomingRelease` shape, wishlist toggle). A clean lift would require generalising the props, which is the kind of premature abstraction that bites. Wrapper approach: events have a separate `EventHeroCountdown` that internally uses `useNow(1000)` directly (the hook IS reusable; the surrounding card chrome differs enough that sharing helps less than it hurts). Revisit promotion when a third surface needs it.

---

## 8. Frontend — detail view (`/events/:slug`)

New page: `apps/web/src/components/screens/EventDetailDesktop.tsx` + `EventDetailMobile.tsx`. Lazy-loaded. State branch on `getEventState(event)`:

**Upcoming (`startTime > now`):**
- Hero: event logo + name + network + time-zone-aware date + giant countdown (dominant)
- Description block
- Actions: `[+ add to calendar]` (downloads `.ics`) + `[watch on YouTube/Twitch →]` if `liveStreamUrl` present
- Planned-reveals grid (only if `games.length > 0`)

**Live (`startTime ≤ now ≤ endTime || startTime + 4h`):**
- Hero: same as upcoming MINUS countdown PLUS `// LIVE NOW` red banner
- **Live stream embed** — DEFERRED TO EV-PR3 per EV-D2. EV-PR1 renders only the `[watch on YouTube/Twitch →]` fallback link with a `// live now — open stream` hint
- Game grid (filling in real-time as IGDB updates)

**Past (`endTime < now`):**
- Hero: event logo + name + network + air date + "// aired N days/weeks ago" caption
- Game grid (dominant)
- Video recap embeds — DEFERRED TO EV-PR3 per EV-D2. EV-PR1 renders only deep-link rows to each video

**Game grid (all 3 states when `games.length > 0`):**
- 2-col on mobile (per OQ-EV-9), 4-col on desktop
- Each card: cover + title + announcement-type chip (if `announcementType` non-null — EV-PR3 derives, EV-PR1 always null) + personalisation chip (`on your wishlist` amber / `in your library` paper-dim) when `userGame` non-null
- Click → `/game/:igdbId` (the V2 dispatcher route from GD-PR1)

**Sparse-data disclaimer (EV-D5):**
When `gameCount < 5` AND `state !== 'upcoming'`, render `// game list is community-curated · X games linked so far` above the grid. Upcoming events are exempt — sparse upcoming events are expected.

---

## 9. Navigation chrome — coordination with deals agent

**Sidebar.tsx** — adds an `Events` entry between `Releases` and `Deals`. Icon: reuse the `clock` glyph (or pick a new one — Andrea's call during plan review). Single-line change in the nav array; merge-safe with deals agent unless they re-order nav for sale-event sub-routes.

**MobileTabBar.tsx** — see OQ-EV1-7. Adding Events to the existing 5-tab grid is the surgical change; Andrea's call drives which existing tab moves. **The change is structurally small but lives in the same file the deals agent already widened in DEALS-PR1.** Merge conflict highly likely if both workstreams land close together — plan to land Events after current Deals PR merges, OR split the tab-bar change into its own tiny landing PR after both workstreams stabilise.

**Settings menu fallback (if OQ-EV1-7 recommendation accepted):**
Settings access moves to a user-avatar menu / hamburger affordance in TopBar (desktop already has the topbar settings link; mobile would gain a header icon → menu). Out-of-scope for EV-PR1 itself; flagged here so the tab-bar swap is reviewable holistically.

---

## 10. Test scope (target ~30-40 new tests)

**Backend (Jest):**
- `events.service.test.ts` (~12 tests) — IGDB query shape, batch resolution, replace-all join behaviour, sparse-event handling, slug lookup, game-id batching, error paths
- `getEventState.test.ts` (~6 tests) — upcoming / live / past / endTime-null 4h window / boundary cases / live-now-with-endTime-known
- `events.route.test.ts` (~10 tests) — list response shape (hero + sections), detail 200 happy, detail 404 with sync-fallback, .ics export content-type + body shape, admin sync 200, admin sync 403-non-admin

**Frontend (Vitest):**
- `EventsDesktop.test.tsx` + `EventsMobile.test.tsx` (~6 tests) — hero countdown surfaces next-soonest, sections render conditionally, empty state, year grouping
- `EventDetailDesktop.test.tsx` + `EventDetailMobile.test.tsx` (~8 tests) — state branching (upcoming/live/past), sparse disclaimer threshold, personalisation chip when userGame present, .ics download wiring

**Snapshot/visual:** add `/events` + `/events/:slug` (one upcoming + one past) to `screens.integration.spec.ts` + `a11y.integration.spec.ts`. Two new visual baselines × desktop+mobile = 4 new PNGs.

---

## 11. Pre-deploy operational checklist

1. Pick migration timestamp strictly after `20260531180000_deals_foundation` (e.g. `20260602120000_events_foundation`).
2. Apply migration:
   ```
   npx prisma db execute --file packages/db/prisma/migrations/<timestamp>_events_foundation/migration.sql \
     --schema packages/db/prisma/schema.prisma
   npx prisma migrate resolve --applied <timestamp>_events_foundation \
     --schema packages/db/prisma/schema.prisma
   ```
   Fall back to Node `$executeRaw` migration-record insert if `migrate resolve` hangs on pgbouncer (documented recipe in CLAUDE.md operational gotchas).
3. Verify RLS enabled on `Event` + `EventGame` tables (matches I1's `InviteCode` precedent).
4. Bump SWR cache version `v5 → v6` in `apps/web/src/lib/cache.ts` per the persisted-cache shape-change rule (new GameDetail responses will eventually carry `events: EventGameRow[]` when GD-PR5 wires the placeholder; even though EV-PR1 doesn't ship that wiring, future workstream WILL — invalidate now to avoid a stale-shape crash later).
5. Set up Railway scheduled job at 03:00 UTC hitting `POST /api/admin/events/sync` (admin token in header). One-shot manual run via `[refresh events]` admin button to seed initial data.
6. Verify CSP headers — EV-PR1 does NOT need the `frame-src` exception yet (EV-PR3 will). Defer the CSP update.

---

## 12. Decisions log (post-review additions)

Andrea-led decisions during plan review land here. Each entry: ID · date · decision · rationale.

**2026-06-02 — Andrea reviewed §3 + accepted all recommendations as-is.** All OQ-EV1-1 through OQ-EV1-10 + OQ-EV1-A locked per the recommendations in §3. Promoted to working decisions:

- **EV-D8 (OQ-EV1-1):** Single IGDB query, 500 limit, sort by `start_time desc`, server-side window slicing. Pagination deferred to EV-PR2.
- **EV-D9 (OQ-EV1-2):** Replace-all join strategy on EventGame sync (delete + recreate per event).
- **EV-D10 (OQ-EV1-3):** Write Event row even when `games` is empty (upcoming events without published lineups are exactly the case Andrea wants surfaced).
- **EV-D11 (OQ-EV1-4):** Sync-time `Game.upsert` for every event's game references; batch IGDB lookups (50 ids per call) to stay under rate limit.
- **EV-D12 (OQ-EV1-5):** `getEventState` returns `'live'` when `start_time ≤ now ≤ start_time + 4h` AND `endTime` is null. 4h covers all known showcase formats with graceful degradation when wrong.
- **EV-D13 (OQ-EV1-6):** Hero countdown is next-soonest upcoming event globally, ungated. Network filtering deferred to EV-PR2.
- **EV-D14 (OQ-EV1-7):** Mobile tab bar restructure — Settings moves off the tab bar into a TopBar/header affordance; tab bar becomes `Dashboard / Library / Releases / Events / Deals`. **Lands as the final sub-phase of EV-PR1 to minimise overlap with the parallel deals agent.**
- **EV-D15 (OQ-EV1-8):** `.ics` export uses UTC timestamps for EV-PR1; TZID-aware encoding deferred to EV-PR4 polish.
- **EV-D16 (OQ-EV1-9):** Detail-view 404 attempts one on-demand IGDB lookup by slug before responding 404; new events shared minutes after IGDB posting resolve without waiting for nightly sync.
- **EV-D17 (OQ-EV1-10):** Migration timestamp picked at apply time, strictly after `20260531180000_deals_foundation`.
- **EV-D18 (OQ-EV1-A):** HeroCountdown — wrap (event-specific `EventHeroCountdown` component using `useNow` directly) rather than lift the Releases primitive. Revisit promotion when a third surface needs the chrome.

---

## 13. Cross-references

- `docs/PAGES_PLAN.md` §6 — source spec
- `docs/PAGES_PLAN.md` §3.5 OQ-GD-7 — GameDetail back-link placeholder slot (consumed by EV-PR3)
- `docs/PAGES_PLAN.md` §7 Dashboard — "you missed" widget candidate (consumed by EV-PR3, deferred to that PR's session)
- `docs/DEALS_PR2_5_PLAN.md` — parallel workstream on `main`; merge-conflict zones flagged in §9 above
- `CLAUDE.md` operational gotchas — migration apply recipe, SWR cache version-bump rule, IGDB rate-limit cold-cache behaviour
- IGDB API ref — `events` endpoint at https://api-docs.igdb.com/#event

---

## Notes for review

**What's locked vs. what needs Andrea's call:**
- EV-D1 through EV-D7 are pre-locked from PAGES_PLAN §6.6; cited here for completeness, do not reopen.
- OQ-EV1-1 through OQ-EV1-10 + OQ-EV1-A are new this session — recommendations + rationale included; Andrea locks during review.
- The biggest single decision is **OQ-EV1-7 (mobile tab bar restructure)** — it has the largest blast radius and is the only one that requires coordination with the parallel deals agent.

**What this PR explicitly does NOT ship:**
- Live-stream embeds (EV-PR3, EV-D2)
- Video recap embeds (EV-PR3, EV-D2)
- Dashboard "you missed" widget (EV-PR3)
- Network filter chips (OQ-EV-6, EV-PR2)
- Game-grid filter on detail view (EV-PR2)
- Year-jump in past archive (EV-PR2)
- Per-vendor calendar deep-links (EV-PR4, EV-D3 — `.ics` ships here)
- `EventGame.announcementType` derivation (EV-PR3 — column ships nullable in EV-PR1)
- GameDetail back-link wiring (depends on GD-PR5)
