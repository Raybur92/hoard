# Hoard — Interaction Debt & Audit Plan

> **Scope:** Drafted 2026-05-06 after the Phase 8 close, triggered by friend Luigi's first real-world test. Captures three things: (1) the hot fixes that shipped immediately when bugs surfaced, (2) two systematic audits (data-flow source→schema→UI map, and an interaction-by-interaction sweep across every screen), (3) the locked PR plan to clear the interaction debt before the next feature workstream (Upcoming rework).
>
> **Status:** **Audits complete; hot fixes shipped; PRs A–D pending start.** Hot fixes (PSN status logic + Steam connect 404 + Library single-shelf filter+sort) landed same day. PR D (HLTB diagnostic) is the next action.
>
> **Why a separate doc:** `docs/PLAN.md` covers feature phases and is already large. `docs/PERFORMANCE_PLAN.md` set the precedent for capturing a focused workstream as a permanent record. This file follows that template.

---

## 1. Session origins (2026-05-06)

Luigi tested the production app and surfaced two bugs immediately:

1. **PSN library imports went entirely into Backlog.** The "playtime > 0 → On Hold" behaviour Andrea remembered for Steam was never actually built into the sync runner — it came from a one-time `scripts/backfill-status.ts` run after the Steam sync. The runner itself hardcoded `status: 'Backlog'` for every new game.
2. **Steam connect on production returned a Vercel 404 page** (`fra1::668rl-...`). The connect button in `PlatformDetailDesktop` used a bare `/api/auth/steam` path; on production that resolves to `gamehoardr.com/api/auth/steam` (Vercel) instead of `api.gamehoardr.com/api/auth/steam` (Railway). The same button on `PlatformDetailMobile` had no `onClick` at all.

Both were fixed in commit [`6c624a0`](https://github.com/Raybur92/hoard/commit/6c624a0). Andrea also asked to port the per-shelf filter + sort UI from `LibraryMobile` to `LibraryDesktop` (the state and logic were already wired — only the JSX was missing) — landed in [`de2090e`](https://github.com/Raybur92/hoard/commit/de2090e).

Then the conversation expanded: "before we rework Upcoming, what other interactions are broken or missing?" That led to the two systematic audits captured in §2 and §3, and the locked PR plan in §4–5.

### Hot fixes shipped this session

| Commit | Date | What | Files |
|---|---|---|---|
| [`6c624a0`](https://github.com/Raybur92/hoard/commit/6c624a0) | 2026-05-06 | `runSync` now derives status from total merged playtime — `> 0 → OnHold`, else `Backlog` — so the rule applies to every platform automatically. Steam connect button uses `API_BASE` prefix on both desktop and mobile. | [syncRunner.ts:99-117](../apps/api/src/services/syncRunner.ts#L99-L117), [syncRunner.test.ts](../apps/api/src/services/syncRunner.test.ts), [PlatformDetailDesktop.tsx](../apps/web/src/components/screens/PlatformDetailDesktop.tsx), [PlatformDetailMobile.tsx](../apps/web/src/components/screens/PlatformDetailMobile.tsx) |
| (data) | 2026-05-06 | `scripts/backfill-status.ts` run on production: 384 games corrected from Backlog → OnHold (had playtime); 287 with zero playtime correctly stayed in Backlog. Cleared the legacy gap for PSN games and any Steam stragglers. | n/a — operational |
| [`de2090e`](https://github.com/Raybur92/hoard/commit/de2090e) | 2026-05-06 | Platform filter chips + sort cycle button added to `LibraryDesktop` filtered single-shelf view (e.g. `/library/Backlog`). Mirrors the unfiltered layout but compact. Skeleton matches so layout doesn't shift. | [LibraryDesktop.tsx](../apps/web/src/components/screens/LibraryDesktop.tsx) |

Verification across all three: typecheck clean, 116 API + 69 web tests passing, lint 0 errors.

---

## 2. Data-flow audit (Source → Schema → UI)

Goal: know exactly what each integration provides, what we persist, and what we surface in the UI. Done before any rework so we can spot data we have but never display, or display but stale-source.

### 2.1 Per-source provenance

| Source | What we use | What we drop | Notes |
|---|---|---|---|
| **Steam** ([steam.ts:15-45](../apps/api/src/services/platforms/steam.ts#L15-L45)) | `appid`, `playtime_forever`, `rtime_last_played`, `name` | nothing notable | `appid` stored as `Game.steamAppId` only as HLTB join key — never displayed |
| **PSN** ([psn.ts:32-62](../apps/api/src/services/platforms/psn.ts#L32-L62)) | cleaned `name`, `playDuration` (ISO 8601), `lastPlayedDateTime` | no `steamAppId` equivalent → HLTB needs the `backfill-psn-hltb.ts` Steam-Store fallback | Title cleaning: ®/™ + PS4/PS5 platform-suffix strip ⇒ 94% IGDB match rate |
| **Xbox / GOG** | both stubs return `[]` | full path unwritten | If implemented they'd produce identical `SyncedGame[]` shape (`apps/api/src/services/platforms/steam.ts:3-9`): `igdbSearchTitle`, `playtimeMinutes`, `lastPlayedAt`, `platformCode` `XB`/`GG` |
| **IGDB game** ([igdb.ts](../apps/api/src/services/igdb.ts)) | `name`, `cover`, `genres`, `developer`, `releaseYear` | `summary` (only used in upcoming feed); all genres after `[0]` | `Game.metadata` (`schema.prisma:85`) is **declared but never written, never read — fully dead** |
| **IGDB upcoming feed** | enough to render the live feed at `/api/igdb/upcoming` | wishlist persistence (path B) drops 5+ fields | See §2.2 |
| **HLTB** ([hltb.ts](../apps/api/src/services/hltb.ts)) | `mainStory` everywhere; extras + completionist on desktop | extras + completionist on **mobile** (fetched, stored, never rendered) | `hltbapi.codepotatoes.de/steam/{appId}`; requires `Game.steamAppId` |

### 2.2 Two paths populate Upcoming — they disagree

| Path | Behaviour | Outcome |
|---|---|---|
| **A — live feed** (`/api/igdb/upcoming`, [igdb.ts:194-248](../apps/api/src/services/igdb.ts#L194-L248)) | Returns full IGDB upcoming releases. Never persists. | When IGDB is up, Upcoming displays full data |
| **B — wishlist toggle** (`POST /api/upcoming/:igdbId/wishlist`, [upcoming.ts:87-99](../apps/api/src/routes/upcoming.ts#L87-L99)) | Hardcodes `releaseDate: null`, `platforms: []`, `releaseDateCategory: 'TBA'`. **Drops `synopsis`, `hype`, `category` entirely**. | When IGDB is rate-limited or down, the offline fallback shows the user's wishlist as TBA / no countdown / no platforms — even for games whose data we already had |

**Net consequence:** any `WishlistRelease` row written via path B is impoverished compared to the live feed. The "wishlist scope" semantic fix in PR B will pair with a Path-B persistence fix so wishlisted releases keep `releaseDate`, `platforms`, `synopsis`, `hype`, `category`, `releaseDateCategory`.

### 2.3 Upcoming "hype meter" — orphaned

The `HypeBars` primitive at [HypeBars.tsx](../apps/web/src/components/primitives/HypeBars.tsx) is a 4-line `Gauge total=5` wrapper. Exported from `primitives/index.ts:34`. Imported **only in the unit test** (`primitives/__tests__/primitives.test.tsx:13,210-220`). Zero production renders. The data flows fine — IGDB returns `hypes`, the API exposes it as `IgdbUpcomingRelease.hype` ([igdb.ts:243](../apps/api/src/services/igdb.ts#L243)), `WishlistRelease.hype` exists in the schema (`schema.prisma:134`) — but no UI consumes any of it. `User.hypeThreshold` exists too and is used only as a server-side filter ([igdb.ts:208](../apps/api/src/services/igdb.ts#L208)).

This is the cleanest "wire what's already there" win available. Belongs to the future Upcoming rework, not PR A.

### 2.4 Gaps & opportunities

**Captured but never displayed:**

- IGDB `hypes` (numeric 0–500+) — see §2.3
- `WishlistRelease.releaseDateCategory` (`Q1/Q2/Q3/Q4/TBA`) — captured in feed, never persisted via path B, never shown
- `Game.metadata` (`Json?`) — fully dead schema field
- `Game.genres[1..n]` — only `genres[0]` rendered anywhere
- HLTB `mainExtras` / `completionist` on **mobile** (PR A item)
- `IgdbRawGame.total_rating_count` / IGDB rating — fetched in upcoming filter only, never surfaced
- `Platform.lastSyncAt` only surfaces on the Platform detail page — could power a "synced 2h ago" tooltip in Sidebar
- `playtimeByPlatform` per-platform rows — shown on GameDetail; never rolled up as a stat anywhere

**Hardcoded / stale:**

- `mockData.ts:190-197` upcoming list still carries hand-crafted `hype: 1-5` values — referenced only by E2E flake tests
- Path-B wishlist persistence (§2.2)

---

## 3. Interaction audit

Every interactive element across every screen, traced JSX → onClick → handler → effect. An interaction is "wired" only if the click ultimately changes data, navigates, or visibly mutates the UI. Findings grouped by severity.

### 3.1 Broken: looks active, does nothing

| Screen | Element | File:Line | Symptom |
|---|---|---|---|
| LibraryDesktop unfiltered | "find" search box | [LibraryDesktop.tsx:403-410](../apps/web/src/components/screens/LibraryDesktop.tsx#L403-L410) | Static `<div className="field">` with `<span>`s. No `<input>`, no onClick. The "K" hint suggests Cmd-K but that shortcut isn't bound either |
| LibraryDesktop | view-mode chips (shelves / grid / list) | [LibraryDesktop.tsx:413-415](../apps/web/src/components/screens/LibraryDesktop.tsx#L413-L415) | State persists to URL/prefs but JSX always renders shelves. Grid + list layouts don't exist |
| DashboardDesktop | now-playing "resume" / "log session" / "+ note" Btns | [DashboardDesktop.tsx:252-254](../apps/web/src/components/screens/DashboardDesktop.tsx#L252-L254) | `<Btn>` rendered without `onClick` |
| DashboardDesktop | "see full upcoming feed →" hint | [DashboardDesktop.tsx:387-388](../apps/web/src/components/screens/DashboardDesktop.tsx#L387-L388) | Styled CTA, no link |
| DashboardMobile | top-right `<Icon name="menu" />` | [DashboardMobile.tsx:154](../apps/web/src/components/screens/DashboardMobile.tsx#L154) | Static SVG, not a button. Side-effect: overrides MobileHeader's `right` slot, **hiding the search button on the mobile dashboard entirely** |
| SettingsDesktop platforms | "sync all" Btn | [SettingsDesktop.tsx:225](../apps/web/src/components/screens/SettingsDesktop.tsx#L225) | No onClick |
| SettingsDesktop account | profile-visibility radios + sessions list | [SettingsDesktop.tsx:155-167](../apps/web/src/components/screens/SettingsDesktop.tsx#L155-L167) | Radios are hardcoded `on={…}` literals; sessions list is a plain `<pre>` |
| SettingsDesktop appearance | "auto" theme radio | [SettingsDesktop.tsx:354](../apps/web/src/components/screens/SettingsDesktop.tsx#L354) | No onClick (consistent with v1 dark-only but presented as selectable) |
| SettingsDesktop danger | "wipe library" Btn | [SettingsDesktop.tsx:448-450](../apps/web/src/components/screens/SettingsDesktop.tsx#L448-L450) | No onClick |
| SettingsMobile danger | "wipe library" Btn | [SettingsMobile.tsx:355-357](../apps/web/src/components/screens/SettingsMobile.tsx#L355-L357) | No onClick |
| SettingsMobile sub-pages | back arrow in MobileHeader | [SettingsMobile.tsx:138](../apps/web/src/components/screens/SettingsMobile.tsx#L138) | `back` true, `onBack` not supplied → tap is a no-op. Affects every settings sub-page on mobile |
| PlatformDetailMobile | back arrow | [PlatformDetailMobile.tsx:80](../apps/web/src/components/screens/PlatformDetailMobile.tsx#L80) | Same root cause |
| PlatformDetail (desktop+mobile) scope | scope checkboxes (library / playtime / trophies / friends) | [PlatformDetailDesktop.tsx:354-361](../apps/web/src/components/screens/PlatformDetailDesktop.tsx#L354-L361), [PlatformDetailMobile.tsx:220-234](../apps/web/src/components/screens/PlatformDetailMobile.tsx#L220-L234) | Hardcoded `<span>`s with check marks |
| PlatformDetail (desktop+mobile) sync | sync-frequency radios (5m / 15m / 1h / manual) | [PlatformDetailDesktop.tsx:373-378](../apps/web/src/components/screens/PlatformDetailDesktop.tsx#L373-L378), [PlatformDetailMobile.tsx:243-246](../apps/web/src/components/screens/PlatformDetailMobile.tsx#L243-L246) | No onClick. CLAUDE.md PR 4 claims they're wired but the handlers were never written |
| PlatformDetail auth (PSN) | "auto-refresh" Toggle | [PlatformDetailDesktop.tsx:323-325](../apps/web/src/components/screens/PlatformDetailDesktop.tsx#L323-L325), [PlatformDetailMobile.tsx:196](../apps/web/src/components/screens/PlatformDetailMobile.tsx#L196) | No onClick |
| PlatformDetailDesktop auth | "reveal" Btn next to NPSSO | [PlatformDetailDesktop.tsx:315](../apps/web/src/components/screens/PlatformDetailDesktop.tsx#L315) | No onClick |
| Upcoming month-strip tabs | both desktop + mobile | [UpcomingDesktop.tsx:142-153](../apps/web/src/components/screens/UpcomingDesktop.tsx#L142-L153), [UpcomingMobile.tsx:137-145](../apps/web/src/components/screens/UpcomingMobile.tsx#L137-L145) | Styled like tabs (one highlighted) but `<div>`s with no onClick |
| GameDetailDesktop | "howlongtobeat.com" external chip | [GameDetailDesktop.tsx:237-245](../apps/web/src/components/screens/GameDetailDesktop.tsx#L237-L245) | `<span>`, not `<a>`. No href, no onClick |

### 3.2 Partial: works in one place, missing in another

| Screen | Element | File:Line | Symptom |
|---|---|---|---|
| Upcoming (desktop+mobile) | "wishlist" scope chip | [UpcomingDesktop.tsx:100,156](../apps/web/src/components/screens/UpcomingDesktop.tsx#L100), [UpcomingMobile.tsx:128-130](../apps/web/src/components/screens/UpcomingMobile.tsx#L128-L130) | Chip is **labelled "wishlist"** but actually toggles `scope=my-platforms` vs `scope=all`. There's **no real "wishlisted only" scope.** Toggling +wishlist persists fine, but the wishlisted release doesn't appear in the chip's view if it's outside the user's platforms or below the hype threshold |
| LibraryDesktop unfiltered | sort + plat-filter chips | [LibraryDesktop.tsx:418-432](../apps/web/src/components/screens/LibraryDesktop.tsx#L418-L432) | Operate only on the top-12 items per shelf returned by `/api/games/shelves?perStatus=12`. Sorting by playtime re-orders the top-12-by-last-played, not the full shelf. Misleading. (Resolution: PR A removes both controls from this view — they remain on filtered single-shelf pages where the full set is loaded.) |
| TopBar (desktop) | Cmd-K shortcut | [TopBar.tsx:50-56](../apps/web/src/components/layout/TopBar.tsx#L50-L56) | Aria label says "Search games (Cmd+K)" but no global keybinding is bound anywhere |
| GameDetailDesktop | back navigation | [GameDetailDesktop.tsx:113-114](../apps/web/src/components/screens/GameDetailDesktop.tsx#L113-L114) | No in-page back button. Mobile has `navigate(-1)`. Browser back works but inconsistent |
| DashboardDesktop wishlist preview | "tracking" amber star | [DashboardDesktop.tsx:422-424](../apps/web/src/components/screens/DashboardDesktop.tsx#L422-L424) | `<span>`, not a button. Can't untrack from Dashboard |

### 3.3 Settings — stubs vs working

| Section | Desktop | Mobile | Status |
|---|---|---|---|
| Account | working (display name, email, sign out) | working | Visibility radios + session list dead UI |
| Platforms | working (rows route to PlatformDetail) | working | "sync all" Btn unwired |
| Appearance | working (`libraryView` *will be removed in PR A — orphans the column*; `showHltb`, `coverDensity`, `terminalCursor`, `hypeThreshold`) | working | "auto" theme radio dead, OK (v2) |
| Danger zone | partly (delete-account works) | partly | "wipe library" Btn unwired |
| **Library** | **STUB** | STUB | "// coming soon" |
| **Notifications** | **STUB** | STUB | "// coming soon" |
| **Privacy** | **STUB** | STUB | "// coming soon" |
| **Data export** | **STUB** | STUB | "// coming soon" |

4 of 8 settings sections are placeholder content on both viewports.

### 3.4 Decorative / placeholder (intentional, no fix)

ASCII platform chart, heatmap cells, gauge segments, barcodes, receipt body, Plat badges, status sigils, Marker labels, mobile Dashboard "// dropping soon" header. All are styled-but-not-interactive on purpose and are flagged here only so the user knows not to expect interactivity.

---

## 4. Locked decisions for PR A

Each decision below was made during the planning conversation on 2026-05-06.

| # | Decision | Why |
|---|---|---|
| **D1** | **Real wishlist scope server-side.** Add `?scope=wishlist` to `/api/igdb/upcoming` returning the user's `WishlistRelease` rows directly (regardless of platform/hype). Pair with a Path-B persistence fix so the rows have full data. Lives in PR B. | The chip label is honest about what the user expects; the persistence fix removes the offline-fallback degradation in one move |
| **D2** | **Cmd-K for global search; `/` for library search.** Two distinct searches. Cmd-K opens the existing global SearchOverlay (IGDB-wide, can find games the user doesn't own and upcoming releases). `/` focuses the Library "find" input which queries **only the user's own games**. | "We have two searches visible — top-bar searches games I do not own; library should look only for games I own." |
| **D3** | **Library "find" input is its own component, hits a new server endpoint.** `/api/games?q=...` (case-insensitive title match, capped at 50, restricted to the user's UserGames). While the query has any value, hide shelves and render a flat result grid. | Honest scope; doesn't reuse SearchOverlay (which is IGDB-wide) |
| **D4** | **Library shelves view: remove sort + platform filter chips entirely.** Both controls stay on filtered single-shelf pages. | Sort + filter on shelves operate only on the top-12 — misleading. Honest UX trumps decorative-feeling controls |
| **D5** | **Library view-mode (shelves / grid / list) chips: remove.** Drop the `viewMode` URL param and the `prefs.libraryView` row in Settings → Appearance. Keep the schema column for now (no migration). | Grid + list layouts don't exist; the chip choice has zero observable effect |
| **D6** | **Mobile back buttons + every clickable icon → Apple HIG.** `MobileHeader` defaults `onBack` to `navigate(-1)` when not supplied. Sweep every clickable `<Icon>` and wrap in `<button>` with 44×44pt min hit area, `:active` press state, `aria-label`, `navigator.vibrate?.(8)` for key actions. | Mobile back buttons are universally broken in Settings + PlatformDetail today; touch targets need HIG compliance |
| **D7** | **Mobile shell stops wiggling on drag.** Body locked (`overflow: hidden; position: fixed; height: 100dvh; overscroll-behavior: none`). Header + tab bar `position: fixed`. Inner content area is the only scroll surface, with `overscroll-behavior: contain`. | Per Andrea's request: "header and footer must stay in place" |
| **D8** | **Settings: 4 stub sections show "coming soon — v2" panels (visible in nav).** Library / Notifications / Privacy / Data export all route to a uniform `<ComingSoonPanel>`. Account: visibility radios + sessions list get a `// v2` chip and visually disabled, mirroring the existing "auto" theme treatment. | Hiding nav items would advertise less of what's planned; the v2 chip pattern already exists |
| **D9** | **Sync-all on Settings → Platforms is real.** Iterates connected platforms via existing `POST /api/platforms/:code/sync`. UI feedback: button enters spinner state; per-row `syncing` sigil; aria-live "// syncing N platforms…" → "// done — X imported, Y skipped". Disabled while running. | Provide proper microinteraction feedback per Andrea's UX spec |
| **D10** | **Wipe library = delete UserGames + disconnect platforms only.** Preserves `Game`, `HltbData`, `WishlistRelease`, account, preferences, login history. Two-step confirmation modal with required typed string ("wipe my library"), mirroring delete-account pattern. | Per Andrea's call: "should not affect Upcoming or anything wishlist related" |
| **D11** | **PlatformDetail unwired controls stay in place.** Sync-frequency radios, auto-refresh toggle, scope checkboxes, reveal NPSSO Btn — all kept visible but unwired in PR A. Real wiring deferred to a future workstream alongside the backing User/Platform model fields. | Per Andrea's call: "I want to build the backing model in the future." Documents the gap rather than removing visible promises |
| **D12** | **HLTB extras + completionist on mobile.** `GameDetailMobile` extends the receipt block to include all three rows (main / extras / completionist) using the existing `kv` pattern. | Data is fetched and stored; mobile parity finishes a Phase 8 PR 4 oversight |
| **D13** | **HLTB coverage diagnostic before any further fix.** Read-only `scripts/audit-hltb.ts` prints counts of: `Game` rows total, with `steamAppId`, with `HltbData`, broken down by platform (Steam-only, PSN-also, manual). Decides whether the gap is structural (PSN games can't be matched) or operational (fetches failing). | Per Andrea's report: "not all games are showing HLTB" — diagnose before fixing |
| **D14** | **Upcoming month-strip tabs become functional.** Clicking a month filters featured + agenda + 2-col grid to that month. | Bundled into PR A as a small fix — the tabs are styled like tabs already |

---

## 5. PR plan

### PR D — HLTB coverage diagnostic (run first)

**Goal:** Quantify the HLTB gap.

**Deliverable:** `scripts/audit-hltb.ts` — read-only, prints counts. No DB writes. Output decides scope of follow-up fix.

**Expected outputs:**
- Total `Game` rows
- With `steamAppId` (Steam + PSN-with-Steam-Store-match)
- With `HltbData` row, by source (Steam direct, PSN backfilled via Steam Store, manual-add)
- Coverage percentage by platform

**Decision:** based on findings, either ship a one-time backfill, fix a runner bug, or accept the gap (PSN-only / Nintendo / Epic games structurally can't have HLTB without manual Steam Store search).

---

### PR A — Interaction debt

**Goal:** Clear every fixable item from §3 without introducing new backend models. All small-to-medium changes; estimated 6–8 commits.

**Tasks (organised by area):**

#### A1. Library-only search
- Backend: extend `/api/games` to accept `?q=...` — case-insensitive `Game.title` `contains` match restricted to the user's UserGames, cap 50.
- Frontend: convert [LibraryDesktop.tsx:403-410](../apps/web/src/components/screens/LibraryDesktop.tsx#L403-L410) to a real `<input>`. While the query has any value, hide shelves and render a flat grid of matching games.
- `/` global shortcut in `AppShell` bound only when `useLocation().pathname.startsWith('/library')` and active element isn't already an editable field.
- Mobile: render the input in a sub-row under the filter chips, focused on tap (no `/` since no keyboard).
- Tests: extend games-route tests for the new query param; add E2E for `/` shortcut focus + result rendering.

#### A2. Cmd-K → global search
- `useEffect` in `AppShell` listening for `keydown` matching `(metaKey || ctrlKey) && key === 'k'`. Calls `useSearchModal().open()`. Skip if active element is `<input>` / `<textarea>` / `[contenteditable]`.

#### A3. Library shelves view simplification
- Delete `view: shelves/grid/list` chips ([LibraryDesktop.tsx:413-415](../apps/web/src/components/screens/LibraryDesktop.tsx#L413-L415)) and consuming JSX path.
- Drop `viewMode`, `setViewMode`, `?view=` URL param.
- Remove the `libraryView` row from Settings → Appearance.
- Delete platform-filter chips and sort button from the unfiltered shelves filter bar (lines ~395-408). Filter bar collapses to: search field on the left, "+ add game" on the right.
- Skeleton equivalent simplifies to match.

#### A4. Mobile back buttons + clickable-icon sweep (Apple HIG)
- `MobileHeader` defaults `onBack` to `navigate(-1)`.
- Back button: 44×44pt min hit area, `:active` press state, `aria-label="Go back"`, `navigator.vibrate?.(8)` haptic.
- Sweep every `<Icon>` not wrapped in `<button>` / `<Btn>` / `<a>`. Catalog and apply 44pt + aria-label + press state to clickable ones.
- Mobile dashboard menu icon ([DashboardMobile.tsx:154](../apps/web/src/components/screens/DashboardMobile.tsx#L154)) gets removed (returns the search button to the right slot).

#### A5. Mobile shell stops wiggling
- `index.html` body / `:root`: `position: fixed; width: 100%; height: 100dvh; overflow: hidden; overscroll-behavior: none`.
- `MobileFrame`: flex column with header `flex-shrink: 0`, content area `flex: 1; overflow-y: auto; overscroll-behavior: contain`, tab bar `flex-shrink: 0`.
- Verify `usePullToRefresh` still triggers correctly with the constrained scroll surface.

#### A6 + A7. Settings stubs + Account V2 markers
- New `<ComingSoonPanel>` component used by `/settings/library`, `/notifications`, `/privacy`, `/data-export` on both viewports.
- Account section visibility radios + sessions list become visually disabled with a `// v2` chip in the section header.

#### A8. HLTB extras + completionist on mobile
- `GameDetailMobile` receipt block extended with all three rows (main / extras / completionist), conditional rendering (only show when value present).

#### A9. Bundled cleanups
| Item | Change |
|---|---|
| Dashboard "see full upcoming feed →" | Wrap in `<Link to="/upcoming">` |
| Dashboard "tracking" amber star | Wire to `POST /api/upcoming/:igdbId/wishlist` toggle (benefits from PR B's persistence fix later) |
| DashboardMobile menu icon | Delete the `right` override; default search button returns |
| GameDetail HLTB chip | Real `<a target="_blank" rel="noopener noreferrer">` to `https://howlongtobeat.com/?q={title}` (we don't store HLTB id; search URL is the workable fallback) |
| GameDetailDesktop back affordance | Add a `← back` chip in the topbar slot, parity with mobile |
| Upcoming month-strip tabs | Make tabs functional — clicking a month filters featured + agenda + 2-col grid to that month |
| Dashboard now-playing buttons | `resume` → `navigate('/game/:id')`; `+ note` → `navigate('/game/:id?focus=notes')` (game detail reads `?focus` and focuses the textarea); **delete `log session`** (no v1 model) |

#### Tests + verify
- API: extend games-route tests for `?q=` query param.
- Web: smoke render on changed components; update Library E2E for shelves filter-bar layout change.
- Manual: typecheck + tests + lint + visual on `/`, `/library`, `/library/Backlog`, `/upcoming`, `/game/:id`, `/settings/*` on both viewports.
- Regenerate mobile snapshots after the shell-wiggle fix lands.

---

### PR B — Real wishlist scope + Path-B persistence fix

**Goal:** Fix the misleading "wishlist" chip semantics and stop dropping wishlist data on persistence.

**Tasks:**
- `/api/igdb/upcoming?scope=wishlist` returns the user's `WishlistRelease` rows directly. New scope value alongside `my-platforms` and `all`.
- Wishlist-toggle endpoint `POST /api/upcoming/:igdbId/wishlist` ([upcoming.ts:87-99](../apps/api/src/routes/upcoming.ts#L87-L99)) extended to capture `releaseDate`, `platforms`, `synopsis`, `hype`, `category`, `releaseDateCategory` from `getGame(igdbId)` (or a one-shot upcoming feed call).
- One-time backfill: `scripts/backfill-wishlist-fields.ts` walks existing `WishlistRelease` rows and re-fetches missing fields from IGDB.
- `useUpcoming` adds `?scope=wishlist` to its options; chip handler updates `scope` in URL state.
- "wishlist · {N}" chip count uses the actual wishlist row count, not `items.length`.
- Tests: integration tests for new scope; persistence assertion on the toggle endpoint.

---

### PR C — Sync-all + Wipe library

**Goal:** Wire two Settings actions properly with full feedback.

**Tasks:**
- **Sync-all**: parallel iteration over connected platforms via existing per-platform sync endpoint. Button spinner; per-row syncing sigil; aria-live status updates; success toast.
- **Wipe library**: new `POST /api/auth/me/wipe-library`. Deletes the user's UserGames (`prisma.userGame.deleteMany({ where: { userId } })`) and disconnects platforms (clears credentials, sets `syncStatus: 'available'`, `lastSyncAt: null`). Preserves Game, HltbData, WishlistRelease, account, preferences, login history. Two-step typed-confirmation modal mirroring delete-account.
- Tests: integration tests for both endpoints.

---

## 6. Status tracking

| ID | Status | PR | Date | Notes |
|---|---|---|---|---|
| Hot fix — PSN status from playtime | Done | — | 2026-05-06 | Commit `6c624a0`. `runSync` derives status from total merged playtime. 384 production rows corrected via `scripts/backfill-status.ts`. |
| Hot fix — Steam connect 404 | Done | — | 2026-05-06 | Commit `6c624a0`. `API_BASE` prefix on PlatformDetailDesktop + Mobile. |
| Hot fix — Library single-shelf filter+sort | Done | — | 2026-05-06 | Commit `de2090e`. Mobile parity ported to LibraryDesktop filtered view. |
| Data audit | Done | — | 2026-05-06 | §2 of this doc. |
| Interaction audit | Done | — | 2026-05-06 | §3 of this doc. |
| PR A — Interaction debt | Pending | — | — | Detailed plan in §5. |
| PR B — Wishlist scope + persistence | Pending | — | — | Detailed plan in §5. |
| PR C — Sync-all + Wipe library | Pending | — | — | Detailed plan in §5. |
| PR D — HLTB diagnostic | Pending | — | — | Run first; output decides scope of follow-up fix. |

---

## 7. Decisions log

> Non-obvious choices made during planning. Mirrors will land in `AGENT.md` "Key Decisions" once the corresponding PRs ship.

**D2 — Two distinct searches, two distinct shortcuts.**
**Decision:** Cmd-K opens global SearchOverlay (IGDB-wide); `/` focuses the Library page's own search input which only queries the user's owned games.
**Why:** Andrea explicitly distinguished the two use cases — "the top bar searches also for games that I do not own. and technically all the games that are announced or in the upcoming category. The library search should look only for the games I own."
**Trade-off:** Two pieces of UI to maintain instead of one; the library search needs a new endpoint. Worth it for honest scope per surface.

**D4 — Library shelves view drops sort + platform filter.**
**Decision:** Both controls remain on filtered single-shelf pages where the full set is loaded; removed from the unfiltered shelves view where they only operate on top-12.
**Why:** Sorting top-12-by-last-played by playtime is misleading — users assume sort applies to the full shelf. Removing is more honest than fixing the per-shelf endpoint to support sort/filter (which would defeat the perStatus=12 caching strategy from the Performance & UX workstream).
**Trade-off:** Users who want to sort the whole library must drill into a single shelf. Acceptable.

**D5 — `prefs.libraryView` schema column kept after UI removal.**
**Decision:** Column stays in `User` model (`schema.prisma`) but the Settings → Appearance row is removed and the LibraryDesktop chips are deleted.
**Why:** Avoid a migration purely for a UI cleanup. Column is harmless as a no-op default.
**Trade-off:** Carries dead data forward; revisit if `User` schema gets reworked.

**D11 — PlatformDetail unwired controls stay in place rather than being deleted.**
**Decision:** Sync-frequency radios, auto-refresh toggle, scope checkboxes, reveal NPSSO Btn — all visible but unwired in PR A. Real wiring deferred to future workstream alongside backing User/Platform fields.
**Why:** Andrea wants to build the backing model later; deleting visible promises now would force re-design when the work resumes.
**Trade-off:** App appears more capable than it is. Mitigation: known-gaps list in CLAUDE.md.

**D13 — HLTB diagnostic before fix.**
**Decision:** Run a read-only audit script (`scripts/audit-hltb.ts`) before assuming a backfill is needed.
**Why:** PSN games structurally can't have HLTB without a Steam Store match — what looks like "missing data" might be a real structural gap. The diagnostic separates structural from operational.
**Trade-off:** A small detour before action. Worth it.
