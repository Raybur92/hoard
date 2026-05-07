# Hoard — Design Feedback rev05
## Releases page — finalization pass

---

## Context

rev04 closed most of the structural questions. This rev resolves the remaining loose ends from side-by-side review: two genuine inconsistencies that the agent introduced (banner placement, Quarters overview semantics), three small copy/UI cuts, the right-rail decision in Wishlist mode, and propagation of the desktop time-strip restructure to mobile.

After this rev the Releases page should be ready for engineering handoff.

---

## Summary of changes from rev04

| Decision | rev04 | rev05 |
|---|---|---|
| Banner placement | Below strip in Wishlist mode, above strip in All mode | **Above strip in both modes** |
| QUARTERS toggle behavior | Strip + 4-panel overview grid below | **Drilldown directly.** No overview grid. QUARTERS behaves identically to MONTHS at a coarser zoom |
| `Quarters overview` panel grid | Default view when QUARTERS is toggled | **Cut.** Replaced by direct flat-list view of the active quarter |
| `// hidden: 2 unstarred` caption (Wishlist) | Present | **Cut** |
| `· hype ≥ 60` caption (All header, desktop + mobile) | Present | **Cut** |
| Hyped-muted banner copy | Count only (`// 3 high-hype releases dropped recently`) | **Add preview titles** (`// 3 high-hype · Hades II 1.0, Pragmata, +1`) |
| Right-rail Agenda in Wishlist mode | Present | **Cut.** Rail stays in All Releases mode only |
| Mobile time strip | RECENT/MAY/JUN/JUL/AUG/Q→ tabs | **Months only**, with banner above and zoom toggle |

---

## 1. Banner placement — above the strip, both modes

The banner is conditional and event-driven; the time strip is persistent navigation chrome. Event-driven content should sit above persistent chrome so that, when the banner fires, it's the first thing the user encounters.

**Apply uniformly:**
- **Wishlist mode:** banner (when firing) → time strip → hero countdown → month grid
- **All mode:** banner (when firing) → time strip → month grid (no hero) → right-rail Agenda alongside

In Wishlist mode, when the banner fires, it does push the hero down ~50–60px. This is acceptable because:

- The banner only fires when there's recent meaningful activity, which is a higher-priority emotional signal than "next thing coming."
- The reading order becomes coherent past → present → future: "you have a recent drop to handle (banner) → here's the next thing coming (hero) → here's what's grouped this month."
- The hero remains visually dominant by virtue of size (240px tall block vs. ~56px banner) and is still above the fold on standard viewports.

When the banner is *not* firing (the common case), the page lands directly on the time strip with no awkward gap.

---

## 2. QUARTERS toggle — drilldown only, no overview

The rev04 implementation introduced a structural inconsistency: when the user toggled QUARTERS, the time strip rendered `Q3 · Q4 · Q1 · TBA` with one quarter highlighted as "active," but the content panel below showed *all four quarters* as a panel grid. The active-tab signal was a lie — the page was not scoped to the active quarter.

**Resolution: kill the overview. QUARTERS toggle behaves identically to MONTHS.**

- User toggles QUARTERS. Strip becomes `Q3 · Q4 · Q1 · TBA`, with the nearest quarter (Q3) active by default.
- Page below the strip shows the **flat chronological list of releases scoped to the active quarter**, using the same `ReleaseCard` 2-column grid as the month views.
- Clicking another quarter tab switches the list. Same behavior as clicking JUN to switch from MAY.
- TBA tab, when active, shows a flat list of releases without confirmed dates, sorted by hype descending.

This makes QUARTERS feel like what it conceptually is: a zoom level on the same time axis. The strip + active tab + scoped content pattern is identical to MONTHS. No special-case rendering, no inconsistency.

### What's lost and why it's OK

The 4-panel overview grid the agent designed in rev03/rev04 (mini bar + count + 5-item preview list per quarter) was a nice artifact but wasn't necessary. The user's questions ("when are my hyped games coming?" / "what's the shape of the next few months?") are already answered by the strip's bars at any zoom level. A third visualization in a fourth shape was bloat.

### Small enhancement worth considering (optional)

When a quarter is active and the user hasn't manually clicked into it (i.e., default landing on the nearest quarter), the flat list could carry a section header summary: `// q3 2026 · 9 releases · jul → sep`. This gives a quick "you're zoomed out" cue without reintroducing a separate overview view. Designer's call on whether this is worth the chrome.

### Drilldown breadcrumb

The rev04 breadcrumb design (`← all quarters / Q4 2026 · 6 releases · OCT · NOV · DEC`) was for the rev04 model where there was a separate overview to "go back to." With no overview, **the breadcrumb's "all quarters" link is meaningless and should be removed.** The strip itself is now the only quarter-switching surface, which is consistent with how MONTHS works.

The right-side context (`OCT · NOV · DEC`) is still useful and can be kept as a subtle caption next to the active-quarter label, e.g., adjacent to the `// q3 2026 · 9 releases` marker.

---

## 3. Right-rail Agenda — Wishlist mode cut

In rev04, both Wishlist and All modes show the AgendaRail. Reviewing side-by-side: in Wishlist mode, a typical user has 10–30 starred items, and the main column already groups and displays them by month. The rail just shows the same data again, chronologically, in a denser format. It's redundant.

In All Releases mode, the rail genuinely earns its space — there are many more items, and the chronological flat list is a legitimate "I just want a list" escape valve from the month-grouped main column.

**Apply:**
- **Wishlist mode (desktop):** main column expands to fill the space the rail occupied. Either widen the cards (3-column grid instead of 2-column) or keep 2-column with more breathing room. Designer's call.
- **All Releases mode (desktop):** rail stays as designed in rev04.
- **Both modes (mobile):** no rail (already true).

---

## 4. Small copy/UI cuts

### Cut "// hidden: 2 unstarred" from Wishlist mode

This caption sits next to the `// may 2026 · 2 starred releases` marker in both `ReleasesWishlistBars` and `ReleasesWishlistNoBanner`. It surfaces what was filtered out, which is exactly the same UX problem as the cut "below hype threshold" sub-section in rev04. Wishlist mode is honest user-curated data; pushing the user toward "go star more things" via passive nagging is noise.

**Cut.** The starred-only grid is the entire point of Wishlist mode.

### Cut "· hype ≥ 60" caption from All Releases header

Sits next to the scope toggle in the desktop header (`ReleasesHeader` when `mode === 'all'`) and the mobile All Releases scope row. Same problem as the cut "// honest user-curated · no hype filter" caption — it's developer-facing language leaking into UI. Users don't think in hype thresholds; the threshold is configurable in Settings → Appearance for those who want to tune it.

**Cut on both desktop and mobile.** The scope toggle alone communicates the structure.

### Add preview titles to the hyped-muted banner

Current rev04 copy: `// 3 high-hype releases dropped recently   [view recent →]`. This is informational at best; the user has no hook to decide whether to click through.

**Updated copy:** `// 3 high-hype · Hades II 1.0, Pragmata, +1 · last 14 days   [view recent →]`

Implementation: take the top 2 titles (sorted by hype descending) and a `+N` suffix for the rest. Ellipsize if titles are long. The starred-prominent variant doesn't need this treatment because it has the `[mark all owned]` action driving engagement; the muted variant earns its space by giving the user enough hook to decide.

---

## 5. Mobile — propagate the time-strip restructure

The desktop time-strip restructure (months only + banner + QUARTERS toggle) didn't get propagated to mobile in rev04. Mobile Wishlist still uses the old `RECENT/MAY/JUN/JUL/AUG/Q→` horizontally-scrolling tab strip, and mobile All has the time tabs but RECENT is still in the strip.

**Apply the same model to mobile:**

- **Time strip:** months only, horizontally scrollable (mobile can't fit 6 tabs side-by-side, scroll is fine here — this is the legitimate place for it). Each tab keeps its compact label + count + mini bar treatment from rev04.
- **MONTHS · QUARTERS toggle:** sits above or below the strip on mobile. Designer's call on placement, but it should be small mono-caps consistent with desktop.
- **Banner:** when firing, sits above the strip, full-width minus the 16px page padding. Same conditional rules as desktop.
- **Sparkline strip:** stays. It's mobile-specific and earns its space precisely because mobile can't show all 6 month tabs simultaneously. Already handled in rev04.

Mobile RECENT remains as a separate page reachable from the banner's `[view recent →]` button (already designed in rev03/rev04).

---

## What's locked from earlier revs (no change)

These items continue from rev03/rev04 and should be preserved:

- Two-mode page (Wishlist / All Releases) with mode switch
- Scope decoupling: Wishlist = `wishlist` scope; All Releases = `my-platforms` default with opt-in `all` toggle
- Hero countdown in Wishlist mode only, always shown when ≥1 starred upcoming release exists
- ReleaseCard (60/76/1fr grid, DLC/REMAKE pills, state-aware footer with "i got it")
- TimeNav bars rendering (active-state amber accent, count + 72px bar)
- Wishlist Empty State (the "nothing on the horizon" page with hot-this-month panel)
- RECENT page content (green prompt strip + grouped lists), reached via banner
- All Releases right rail (Agenda) — desktop only
- HypeBars consuming `IgdbUpcomingRelease.hype` on cards
- Mobile sparkline as a year-shape glance
- Mobile All scope toggle (added in rev04)

---

## Open items for rev05 mocks

The design agent should produce updated artboards for the following:

1. **Releases / Wishlist mode (desktop), banner-above-strip variant.** No right rail. Main column fills the space. Two states: with banner firing, without.
2. **Releases / All mode (desktop), banner-above-strip variant.** Right rail kept. Two states: with banner (starred + hyped), with banner (hyped-only muted with preview titles), without banner.
3. **Releases / QUARTERS-toggled state (desktop).** Strip shows `Q3 · Q4 · Q1 · TBA` with Q3 active. Content area shows flat chronological list of Q3 releases. No overview panel grid. Optional zoom-context caption next to the marker (`// q3 2026 · 9 releases · jul → sep`).
4. **Releases / TBA-active state (desktop).** Same shell as the quarters drilldown but with TBA selected. List sorted by hype descending. Confirms the TBA tab does real work.
5. **Mobile time strip propagation.** All three mobile artboards (Wishlist, All, Recent) updated to use months-only horizontally-scrolling strip + MONTHS/QUARTERS toggle + banner-above-strip. RECENT is no longer a tab on mobile either.

---

## Engineering constraints reconfirmed

No new schema work introduced. Specifically:

- Removing the QUARTERS overview means one less rendered shape; no schema impact.
- Mobile time-strip change is presentational only; the underlying scope/zoom data model is shared with desktop.
- Hyped-muted banner preview titles use top-N-by-hype from the same data the banner already queries; no new fields.
- Right-rail removal in Wishlist mode is presentational only.
- All copy cuts are string-level only.

---

## Decision log — locked through rev05

| Decision | Resolution |
|---|---|
| Banner placement | Above the time strip, both modes |
| QUARTERS behavior | Drilldown directly; no overview grid; same UX as MONTHS at coarser zoom |
| QUARTERS overview panel grid | Cut |
| Quarters drilldown breadcrumb | Removed (no overview to return to) |
| Right-rail Agenda — Wishlist mode | Cut |
| Right-rail Agenda — All Releases mode | Kept (desktop) |
| `// hidden: 2 unstarred` caption | Cut |
| `· hype ≥ 60` caption | Cut (desktop + mobile) |
| Hyped-muted banner copy | Includes top-2 preview titles + `+N` |
| Mobile time strip | Months only, horizontally scrollable, banner above, MONTHS/QUARTERS toggle |
| Mobile RECENT | Reached via banner only (no longer a tab) |
| Mobile sparkline | Kept as standalone year-shape strip |
