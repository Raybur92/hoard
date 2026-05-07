# Hoard — Releases Page · Engineering Handoff

> **Audience:** the implementing agent (Claude Code).
> **Status:** ready to build. All structural and behavioral decisions are locked.
> **Visual reference:** `Hoard_releases_mocks.html` contains hi-fi mocks for every artboard listed in §14. Open it in a browser to see the rendered designs. The HTML is a visual spec, not production code — translate it into Hoard's production stack (React + TypeScript). Match design tokens (CSS variables, typography, spacing) from the mock; ignore any artboard whose function name is prefixed with an underscore (e.g., `_ReleasesQuartersToggled_retired_unused`) — those are retired scaffolding.
> **Companion materials:** `Hoard_design_feedback_rev03.md` through `rev07.md` document the design conversation. They're useful for context but not required reading — this document is standalone.

---

## 1. What this page is

The Releases page (formerly "Upcoming") is one of Hoard's primary surfaces. It answers two questions for the user:

1. *When are the games I'm hyped for dropping?* — personal anticipation
2. *What's the shape of the next few months?* — release planning

The page has **two modes**, **two zoom levels**, **a conditional banner**, **a separate RECENT sub-surface**, and a fundamentally different information architecture between desktop and mobile. Library sync is the source of truth for ownership; this page never mutates ownership state.

---

## 2. Page anatomy at a glance

### Modes (top-level state, both desktop and mobile)

- **Wishlist** — shows the user's starred upcoming releases. Scope is fixed to `wishlist` (no hype filter; honest user-curated data). Has a hero countdown.
- **All Releases** — shows broader release feed. Scope defaults to `my-platforms` with an opt-in toggle to `all`. No hero. Hype-filtered server-side via `User.hypeThreshold`.

### Zoom levels (within a mode)

- **Months** — default. Shows 6 buckets: current month + 5 forward.
- **Quarters** — alternative zoom. Shows 4 buckets: Q3, Q4, Q1 (rolling), TBA.

A bucket is always selected; the page renders the releases scoped to it.

### The RECENT sub-surface

- A separate page reached via the `[view recent →]` button on the conditional banner. Not a tab on the time strip. Not a zoom level.
- Shows starred and high-hype releases that dropped in the last 14 days.
- Has none of the time-axis chrome (no mode switch, no scope toggle, no time strip, no zoom toggle, no banner, no hero).

### The conditional banner

- Sits above the time strip when firing.
- Two visual treatments (green-prominent, muted), driven by content rules below.
- Informational only. Has no action buttons that mutate state.

---

## 3. Routing & navigation

Both desktop and mobile share the same logical routes. URL or route-state convention is the implementer's call (recommend URL params for shareability and back-button behavior).

| Route concept | Default values when missing |
|---|---|
| `releases?mode=…&scope=…&zoom=…&bucket=…` | mode=wishlist, scope=my-platforms (only relevant in all), zoom=months, bucket=current month |
| `releases/recent` | n/a |

**Mobile-specific behavior:** when the user navigates to Releases on mobile via the bottom tab bar (`SOON`), the page lands on the deterministic default state regardless of any prior session state. This is intentional — the mobile use case is "quickly check what's coming up," and stale state from last week is a worse UX than predictable defaults.

Within a session, mobile state persists (chevron-stepping and sheet selections survive scroll, navigation away and back within the app). Across sessions, it resets.

Desktop URL params can persist across sessions naturally (browser history, deep links).

---

## 4. Data inputs

The page consumes existing data from the schema. No new schema work is required by this page.

| Input | Origin | Used for |
|---|---|---|
| `WishlistRelease[]` | Existing wishlist scope | Wishlist mode card list, hero countdown, banner starred count |
| `IgdbUpcomingRelease[]` | Existing my-platforms / all scopes, hype-filtered server-side | All Releases mode card list |
| `IgdbUpcomingRelease.hype` | Per release | HypeBars on cards, banner muted-variant qualification |
| `User.hypeThreshold` | User setting (default 60, configurable in Settings → Appearance) | Server-side filter for All Releases scopes (not consumed in UI directly) |
| `category` (game/dlc/remake/etc.) | Per release | DLC/REMAKE pills on cards |
| `releaseDateCategory` (Q1–Q4 / TBA) | Per release, server-computed | Quarters zoom bucket assignment |
| `Library` (existing library sync data) | Existing library scope | Filter releases out of RECENT once they enter library |

### RECENT-specific data rules

RECENT shows only releases that meet **all** of:

- Dropped within the last 14 days (release date in `[today - 14d, today]`)
- **Not currently in the user's library** (filter against existing library data)

The "starred" sub-list within RECENT additionally requires `WishlistRelease` membership. The "high-hype" sub-list (only relevant for the muted banner variant in All mode) requires `hype >= 80`.

### Banner qualification rules

The fixed high-hype threshold for the muted banner is **80** (a constant in banner logic, not the user's `hypeThreshold` setting).

| Banner state | Wishlist mode | All mode |
|---|---|---|
| Green-prominent | ≥1 starred drop in last 14d | ≥1 starred drop in last 14d (takes priority over muted) |
| Muted | (never) | 0 starred drops in 14d AND ≥1 release in 14d with hype ≥ 80 |
| Hidden | 0 starred drops | 0 starred drops AND no qualifying high-hype drops |

---

## 5. Components inventory

### Shared primitives

| Component | Purpose | Key props |
|---|---|---|
| `ReleaseCard` | Card representing one release. Used in month grids, Quarter drilldowns, RECENT lists, and Agenda rail. | release object, variant (`'wishlist' \| 'all' \| 'recent'`) |
| `HeroCountdown` | Big T-N display + cover + metadata. Wishlist mode only. | release object |
| `RecentBanner` | Conditional informational banner. | mode, starredCount, hypedCount, previewTitles |
| `TimeNav` | Time strip with bars/counts. Desktop only — mobile uses `MobileViewHeader` instead. | mode, zoom, active bucket, counts |
| `AgendaRail` | Right-side chronological flat list. Desktop, All Releases mode (months only). | items, mode |
| `HypeBars` | Existing primitive consuming `IgdbUpcomingRelease.hype`. Render on cards in All mode. | hype value (1–5) |

### Desktop-specific

| Component | Purpose |
|---|---|
| `ReleasesHeader` | Top header with mode switch + scope toggle (All only). Sits above the time strip. |
| Page shell | Sidebar + top bar + the page content. |

### Mobile-specific (new in rev07)

| Component | Purpose | Key props |
|---|---|---|
| `MobileViewHeader` | Top of every Releases mobile screen except RECENT. Title + tappable view label + chevrons. | label, onPrev, onNext, prevDisabled, nextDisabled |
| `MobileViewSheet` | Bottom sheet containing all view controls. Opens on label tap. | mode, scope, zoom, bucket |
| `MobileBanner` | Mobile-styled variant of `RecentBanner`. Same conditional rules; tighter copy. | mode, starredCount, hypedCount, previewTitles |
| `MobileHeader` (existing) | Used only for RECENT mobile (no view label, just back arrow + title). | title, sub, back |
| `MobileTabBar` (existing) | Bottom nav. Untouched; shows `SOON` as active when on Releases. | active |

### State-aware behaviors

- **`ReleaseCard` footer states** (two states only): future shows `T-Nd`, past shows `dropped Nd ago`. There is no `[i got it]` button. Library sync handles ownership transitions.
- **`HeroCountdown` selection logic**: shows "next starred globally," not "next starred in active bucket." If the closest starred release is 3 months out, the hero still shows it even when the user is browsing the current month. The hero is the page's emotional anchor for "what am I most looking forward to" — a global property of the wishlist, not a per-bucket property.

---

## 6. The right rail (desktop)

The rail shows up where the main column is grouped, and is omitted where the main column is already a flat list.

| View | Main column shape | Rail? |
|---|---|---|
| All Releases · Months · *month* active | Grouped under `// {month} · N releases` | **Yes** |
| All Releases · Quarters · *quarter or TBA* active | Flat list | **No** |
| Wishlist · Months · *month* active | 3-column grid of starred items | **No** |
| Wishlist · Quarters · *quarter or TBA* active | Flat list of starred items | **No** |
| RECENT page | Flat with sub-grouping | **No** |

When the rail is omitted, the main column expands to fill its space. Card grid switches to 3-column.

---

## 7. The mobile view sheet

The sheet is the single mobile surface for changing mode, scope, zoom, and bucket. Triggered by tapping the view label in `MobileViewHeader`.

### Layout (top to bottom)

1. Drag handle
2. Sheet header — `// view` label + close (X) button
3. **Mode** — segmented control (`wishlist · all`)
4. **Scope** — segmented control (`my-platforms · all`). Visible **only when mode = all**.
5. **Zoom** — segmented control (`months · quarters`)
6. **Time bucket** list — selectable rows showing label + bar (or hatched diagonal pattern for TBA) + count. List shape depends on zoom: 6 months for Months, 4 quarters (Q3/Q4/Q1/TBA) for Quarters.
7. **Done** button — full-width, applies pending changes and closes the sheet.

### Apply behavior

- **Tap-outside** (on the scrim above the sheet) — applies pending changes and dismisses.
- **Tap Done** — same.
- **Drag-down to dismiss** — same (apply pending and dismiss).
- **Tap close X** — same.

There is no "cancel" path. All exits commit pending changes. This is intentional: changes in the sheet are non-destructive and reversible (the user can just reopen the sheet and switch back), so requiring an explicit cancel adds friction without protecting the user from anything.

### Mode change persistence

When the user changes mode in the sheet (e.g., `all` → `wishlist`):

- **Bucket selection persists.** If the user was on May, they stay on May. If they were on Q3, they stay on Q3.
- **Scope value is preserved but hidden.** Wishlist mode doesn't show the Scope section, but if the user was on `scope=all` and switches to wishlist then back to all, they should see `scope=all` again. Don't reset scope on mode change.
- **Zoom selection persists.** Months stays months, quarters stays quarters.

### Zoom change behavior

When the user changes zoom (e.g., months → quarters):

- The bucket list re-renders inline to show the new zoom's buckets.
- The previously-active bucket may not have a clean equivalent in the new zoom (e.g., MAY in months has no exact 1:1 in quarters). Map to the **containing** bucket: MAY → Q2 (or whichever quarter contains May), JUL → Q3, etc. TBA buckets stay TBA.

---

## 8. The chevrons

`MobileViewHeader` shows a `[‹]` button left of the view label and a `[›]` button right of it. They step adjacent buckets in the current zoom **without opening the sheet**.

- In Months zoom, step through the 6 visible months. No wrap-around.
- In Quarters zoom, step through Q3 → Q4 → Q1 → TBA. No wrap-around.
- `prevDisabled` is true when the active bucket is the leftmost; `nextDisabled` is true when it's the rightmost. Disabled state: opacity 0.35, paper-faint color, non-interactive cursor.

If the user wants to navigate beyond the visible 6-month range, they must open the sheet and switch to Quarters. This is a deliberate constraint — the page doesn't expose a "previous year" or "two years out" navigation. Quarters covers the long-tail.

---

## 9. The banner — final spec

Sits above the time strip on desktop, above the view label on mobile. Conditional on the rules in §4.

### Green-prominent variant

Renders when ≥1 starred release dropped in the last 14 days (and is not yet in the user's library).

```
[✓ icon]  // 2 starred releases dropped in the last 14 days       [view recent →]
          they'll move to your library automatically once your platforms sync.
```

When both starred and high-hype apply (All mode only), fold the high-hype count into the eyebrow line:
```
[✓ icon]  // 2 starred · 3 high-hype · last 14 days               [view recent →]
          they'll move to your library automatically once your platforms sync.
```

The starred-prominent variant has no action buttons that mutate state — `[view recent →]` is the only button, and it navigates.

### Muted variant (All mode only)

Renders when no starred drops, but ≥1 release with hype ≥ 80 dropped in the last 14 days.

```
[i icon]  // 3 high-hype · Hades II 1.0, Pragmata, +1 · last 14 days  [view recent →]
```

Single-line, dashed border, dim background. Top 2 titles by hype descending, then `+N` for the rest. Ellipsize the title list (not the whole line) at narrow widths to preserve `+N` and `· last 14 days`.

### Persistence

The banner is **not dismissible**. There is no close button or "mark as read" gesture. Items disappear from the banner naturally as they age past 14 days or get picked up by library sync. This is intentional: the banner is informational, not a notification queue.

---

## 10. The RECENT page

Reached only via `[view recent →]` on the banner. Has no other entry points. Has no time-axis chrome.

### Desktop

- Top bar with breadcrumb `hoard / releases / recent`.
- Page header below the top bar: `[← back to releases]` link, `RECENT` title, `// last 14 days` caption.
- Green prompt strip at the top of the content area, styled like the green banner but with no action button — informational only.
- Two sections, both 2-column card grids:
  - `// just out · starred` — starred drops in last 14 days that aren't in library yet.
  - `// also released · not on your wishlist` — non-starred drops in last 14 days that meet the high-hype threshold (≥80).

### Mobile

- `MobileHeader` with back arrow, title `releases`, sub `// recent · last 14d`.
- Green panel at top, same informational treatment as desktop.
- Two sections:
  - `// just out · starred` marker followed by panel-style cards (one per row, full-width).
  - `// also out · not starred` marker followed by inline list rows (denser).

The visual asymmetry between the two sections (panels vs. rows) is intentional: starred drops get more visual weight because they're the user's stuff.

### What was removed

The earlier specs included `[i got it]` and `[mark all owned]` actions for moving wishlist items into the library manually. These are removed in the final spec because library sync is the source of truth for ownership. RECENT shows "starred drops not yet in library"; once library sync picks them up, they disappear from RECENT automatically.

### Known limitation: non-synced platforms

The v1 platform set (Steam, PSN, Xbox, GOG) all support library sync. Nintendo and Epic are excluded from v1. If a user owns a starred game on a non-synced platform, library sync won't pick it up and the game will linger in RECENT. Acceptable for v1 — flag for v2 consideration if manual ownership marking becomes necessary.

---

## 11. Empty states

### Wishlist mode, zero upcoming starred releases (anywhere)

Show the existing Wishlist Empty State design: "nothing on the horizon" + "// hot this month · on your platforms" panel showing 3 starred-eligible releases with HypeBars + quick-add `+` buttons. The empty state replaces the entire main content area (no hero, no cards). Time strip and toggles still render.

### Wishlist mode, zero starred releases in the active bucket (but ≥1 elsewhere)

Show:
```
// {bucket label} · 0 starred
nothing starred this {month/quarter}.   [skip ahead →]
```

The `[skip ahead →]` action navigates to the next non-empty bucket in the current zoom (chevron-equivalent jump, possibly skipping multiple empty buckets). The hero countdown still renders above (showing next-starred-globally). Time strip still shows the empty bucket as currently active with its 0 count.

### All Releases mode, zero releases in the active bucket

Same shape as above, with copy adjusted:
```
// {bucket label} · 0 releases
nothing on your platforms this {month/quarter}.   [skip ahead →]
```

### RECENT, no qualifying drops at all

The banner won't be firing in this case (banner qualification mirrors RECENT's filter). So the user can't reach RECENT from a banner. If the user reaches RECENT via direct URL (e.g., `/releases/recent`), show:
```
// nothing in the last 14 days
no starred or high-hype releases dropped recently.   [back to releases →]
```

---

## 12. Punch list — items not directly visible in the mocks

The following items are either subtle, distributed across multiple states, or interpretive calls that the implementer should be aware of.

1. **Hero countdown is always "next starred globally,"** not "next starred in active bucket." Implement the selection as `wishlist.filter(r => r.away >= 0).sort(by(r => r.away))[0]`, scoped to the user's wishlist regardless of active month/quarter.

2. **Mobile cards are list rows, not desktop-style cards.** The mobile pattern uses a `40px 36px 1fr auto` grid (date column / 36×48 cover / title-meta / T-N + star). This divergence is deliberate; maintain it. Don't try to reuse desktop's `ReleaseCard` 60/76/1fr layout on mobile.

3. **Banner copy variants**: green-prominent has a two-line message + view-recent button. Muted has a single line + view-recent button. Mobile may compact further by dropping the subline in green-prominent (acceptable due to mobile width).

4. **Banner ellipsis at narrow widths**: in the muted variant, ellipsize the comma-separated title list (`Hades II 1.0, Pragm…, +2 · last 14 days`), not the whole line. The `+N` and `· last 14 days` should always be visible.

5. **Sheet "scope" section visibility**: only render when `mode === 'all'`. When mode is wishlist, skip the section entirely (don't render a disabled or hidden version — the section's gone). Preserve the scope value in state across mode changes.

6. **Sheet bucket list rendering**: when zoom is months, render 6 rows. When zoom is quarters, render 4 rows. Each row is independently tappable; tapping commits the bucket selection but doesn't auto-close the sheet (user can keep adjusting). Sheet closes via the dismissal paths in §7.

7. **TBA bucket has no bar**: in both desktop `TimeNav` and mobile sheet's bucket list, TBA shows count only with a hatched/diagonal pattern in the bar's space (not a 0-fill bar — that would lie about the data). The hatched pattern signals "this exists but isn't measurable on this scale."

8. **Quarter-to-month context caption**: the `// q3 2026 · N releases` marker on Quarter views includes a context caption (`· jul → sep` for Q3, `· oct · nov · dec` for Q4, `· sorted by hype` for TBA). The mobile view label includes this context too (`// all · my-platforms · q3 2026 · jul → sep ▾`).

9. **Desktop RECENT has two header rows visually**: the global TopBar with the `hoard / releases / recent` breadcrumb, and the page-level header below it with the `[← back to releases]` link and `RECENT` title. This is intentional — top bar is global app chrome, the page-level header is content chrome. Don't consolidate them.

10. **Mobile chevron disabled state**: opacity 0.35 + paper-faint color + non-interactive cursor. Ensure both the visual disabled state and the actual button `disabled` attribute are set, so screen readers and keyboard navigation behave correctly.

11. **Retired artboards in the mock source** (`_ReleasesQuartersToggled_retired_unused`, `_ReleasesMobileWishlist_rev05_retired`, `_ReleasesMobileAll_rev06_retired`) are design-time scaffolding for traceability. Do **not** ship them. They should not appear in the production component tree.

---

## 13. State summary for the implementer

```
Releases page state (mobile and desktop, per-session):
  mode: 'wishlist' | 'all'                  // default: 'wishlist'
  scope: 'my-platforms' | 'all'             // default: 'my-platforms', preserved across mode changes
  zoom: 'months' | 'quarters'               // default: 'months'
  bucket: string                            // default: current month label
  
Mobile-only:
  sheetOpen: boolean                        // default: false
  
RECENT page state:
  (no local state; data is filtered in §4)
```

On mobile, navigating to Releases via `SOON` resets mode/scope/zoom/bucket to defaults. On desktop, URL params hydrate state on load; missing params use defaults.

---

## 14. Done criteria

> Artboard names below correspond to function names in `Hoard_releases_mocks.html`. To inspect a specific artboard visually, find its function in the HTML source or use the rendered preview.

The page is considered complete when:

- [ ] All desktop artboards render correctly: `ReleasesWishlistBars`, `ReleasesWishlistNoBanner`, `ReleasesAllBars`, `ReleasesAllNoBanner`, `ReleasesQuartersActive`, `ReleasesQuartersDrilldown`, `ReleasesQuartersTBA`, `ReleasesRecent`, `ReleasesWishlistEmpty`.
- [ ] All mobile artboards render correctly: `ReleasesMobileWishlist` (with and without banner), `ReleasesMobileAll` (with and without banner), `ReleasesMobileSheetMonths`, `ReleasesMobileSheetQuarters`, `ReleasesMobileRecent`.
- [ ] Banner conditional logic respects mode and the hype ≥ 80 threshold for muted variant.
- [ ] Library sync filters items out of RECENT and the banner naturally; no manual ownership controls anywhere on the page.
- [ ] Hero countdown shows next-starred-globally regardless of active bucket.
- [ ] Right rail appears only where the main column is grouped (per §6 table).
- [ ] Mobile sheet exits (tap-outside, Done, drag-down, X) all apply pending changes.
- [ ] Mode change in sheet preserves bucket and (hidden) scope value.
- [ ] Zoom change in sheet maps the active bucket to its containing bucket in the new zoom.
- [ ] Mobile chevrons step through buckets and disable correctly at extremes.
- [ ] Empty states render per §11.
- [ ] No retired artboards appear in production code.
- [ ] No `[i got it]` or `[mark all owned]` buttons anywhere.

---

## 15. Open for v2

Not in scope for this build. Documented for future reference:

- Filter chips on All Releases (category, platform sub-filter, sort options).
- Sparkline / year-shape visualizations (deferred to a future Stats surface).
- Manual ownership marking for non-synced platforms (Nintendo, Epic).
- Banner dismissal / "mark as read" gestures.
- Last-used state persistence across mobile sessions.
- More elaborate Quarter overviews (per-quarter heatmaps, hype distributions).
