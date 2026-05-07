# Hoard — Design Feedback rev04
## Releases page — refinements after first design pass

---

## Context

The design agent's first pass on Releases (rev03) produced a strong foundation. This rev refines the result based on side-by-side review of the artboards. It locks in the variants that won, cuts what didn't earn its space, restructures the time nav around a cleaner mental model, and resolves a few interaction gaps.

The structural decisions from rev03 (two-mode page, scope decoupling, hero-in-Wishlist-only, RECENT as a 14-day surface, Quarters via `releaseDateCategory`) all stand. This document is about execution, not architecture.

---

## Summary of changes from rev03

| Decision | rev03 | rev04 |
|---|---|---|
| Time nav structure | `RECENT · MAY · JUN · JUL · AUG · QUARTERS` (mixed shapes in one strip) | **Months only.** RECENT becomes a conditional banner; QUARTERS becomes a zoom toggle. |
| Months visible | 4 | **6** |
| Indicator variant | Bars *and* sparkline mocked side-by-side | **Bars only.** Sparkline cut on desktop. |
| RECENT entry point | Tab in the time strip | **Conditional banner** above the time strip / hero |
| QUARTERS entry point | Tab in the time strip | **`MONTHS · QUARTERS` toggle** next to the time strip |
| Right-rail Agenda | `AllBars` (with rail) vs. `AllNoRail` (without) | **Keep the rail.** Cut the no-rail variant. |
| "Below hype threshold" sub-section | Surfaced filtered-out items | **Cut.** Server-side filter shouldn't surface what it filtered. |
| Filter chips on All Releases | Invented (category/platform/sort) | **Cut from v1.** Defer to v2. |
| Quarters click behavior | Unspecified | **Drill into a flat list** scoped to the quarter, same shape as month view |
| Mobile sparkline strip | In `ReleasesMobileAll` | **Keep** — different role than desktop sparkline |
| Mobile All scope toggle | Missing | **Add** — needs UI for `my-platforms` ↔ `all` |

---

## Why "months only" — the rationale

In rev03, the time strip mixed three structurally different things into one row: a fixed 14-day window (RECENT), four month buckets (MAY–AUG), and a zoom-out toggle (QUARTERS). The agent's bar-rendering logic special-cased two of the six items (`isBucket` excluded RECENT and QUARTERS from the max calculation; RECENT got a fixed 0.25 bar; QUARTERS got no bar).

When two of six items need exceptions in the rendering logic, those items don't belong in the set. They're different shapes wearing the same costume.

**The rev04 model treats each shape correctly:**

- **Months** are peers — same length, same indicator logic, same click behavior. Six of them in one strip, all comparable via bars.
- **RECENT** is a conditional past-window surface — it appears only when there's something meaningful to surface, sized by relevance, not by calendar.
- **QUARTERS** is a zoom level on the same time axis — toggle the strip to render quarters instead of months. Same strip, different zoom.

This is more honest about what each element is, removes the rendering exceptions, and earns enough strip width to fit 6 months instead of 4 (the meaningful planning horizon for game releases, which are seasonal and back-loaded toward fall).

---

## Time nav — the new structure

### Strip composition

```
[ MAY  6 ████░ ] [ JUN  4 ██░ ] [ JUL  2 █░ ] [ AUG  1 ░ ] [ SEP 12 █████ ] [ OCT 18 ██████ ]   ⟂   MONTHS · QUARTERS
```

- **6 month buckets** by default, rolling window starting from the current month.
- **Bars scale relative to the heaviest visible month.** No exceptions, no special cases — every bar uses the same formula.
- **Active tab** gets the amber accent on count + bar, plus the bottom-edge underline (per rev03 design — that part works).
- **MONTHS · QUARTERS toggle** sits to the right of the strip, small segmented control, mono caps. Toggling re-renders the strip area as quarter buckets.

### QUARTERS state of the strip

When toggled to QUARTERS, the strip area renders as quarter buckets in place of the 6 months: `Q3 2026 · Q4 2026 · Q1 2027 · TBA`. Same bar logic (TBA gets no bar, only count, per rev03 — that part works). Clicking a quarter behaves the same as clicking a month: drills into a flat chronological list of releases scoped to that quarter, same card layout as the month view.

The Quarters drilldown panel grid the agent designed (4-column panel with mini bar + 5-item preview list per quarter) is still useful, but **as the *content* of the QUARTERS-toggled view**, not as a separate page. When the user toggles to QUARTERS, the page below the strip shows the panel grid; clicking into a quarter replaces that with the flat list.

### Indicator system — locked at bars

Cut the sparkline variant on desktop. Reasons:

- The sparkline duplicates information the bars already carry (same data, same scale).
- To fit it, the agent had to strip the bars from the tabs (`variant="none"`), so it's not additive — it's a *replacement* for a more legible indicator.
- The "// shape of the year · starred" header is narration, not information.

**Mobile is the exception.** `ReleasesMobileAll` uses a sparkline strip at the top of the page as a standalone year-shape glance, separate from the horizontally-scrolling tab strip below it. That's a legitimate use — mobile can't show 6 month tabs side-by-side, so a separate sparkline gives the at-a-glance overview that the tab strip can't. **Keep mobile sparkline. Cut desktop sparkline.**

---

## RECENT — the banner

RECENT is no longer a tab. It's a conditional banner that appears above the hero (Wishlist mode) or above the time strip (All mode), only when there's something meaningful to surface.

### Visibility rules

The banner respects the active mode.

**Wishlist mode banner:**
- **Shown** when ≥1 starred release dropped in the last 14 days.
- **Hidden** otherwise. (Unstarred high-hype drops aren't relevant in Wishlist mode — the user is here for their own list.)

**All mode banner:**
- **Green/prominent** when ≥1 starred release dropped in the last 14 days. Starred treatment dominates.
- **Muted** when no starred drops, but ≥1 release dropped with hype ≥ 80 (a fixed high-hype threshold, not the user's `hypeThreshold` from settings, which is a *floor* and would fire too often). Engineering note: 80 is a constant in the banner logic, no schema work.
- **Hidden** when neither condition is met.

### Banner content

- **Starred case (green/prominent, both modes):**
  `// 2 starred releases dropped in the last 14 days   [mark all owned]   [view recent →]`

- **Hyped-but-unstarred case (muted, All mode only):**
  `// 3 high-hype releases dropped recently   [view recent →]`

- **Both signals present (All mode):**
  Starred treatment wins. The high-hype count folds into the secondary line:
  `// 2 starred · 3 high-hype · last 14 days   [mark all owned]   [view recent →]`

### Banner click behavior

`[view recent →]` navigates to the full RECENT page (already designed in rev03 — the green prompt strip + the two grouped lists `// just out · starred` and `// also released · not on your wishlist`). That page is **kept as designed** in rev03, just reached via banner instead of tab.

### Visual treatment

Reuse the green-bordered panel pattern the agent already designed for the in-page RECENT prompt strip. Same component, hoisted to be a page-level entry point.

---

## What's kept from the design agent's output (no change)

These items from rev03 are good as designed and need no further iteration:

- **Hero countdown (desktop and mobile).** The 180×240 cover + T-N display + D/H/M/S boxes + dev/genre/platforms metadata + HypeBars + three buttons (`on wishlist / trailer / remind me`). Mobile compresses intelligently.
- **TimeNav bars rendering** (the indicator, not the strip composition). Active-state amber accent, count in display font, 72px bar with relative scaling. Just remove the RECENT/QUARTERS special cases now that those items leave the strip.
- **ReleaseCard.** 60/76/1fr grid. DLC/REMAKE pills via `category`. State-aware footer (`T-Nd / dropped Nd ago / "i got it"`).
- **RECENT page (desktop).** Green prompt strip + `// just out · starred` and `// also released · not on your wishlist` subsections. Reached via banner instead of tab now, but the page itself is unchanged.
- **Wishlist Empty State.** "nothing on the horizon" + "// hot this month · on your platforms" panel with quick-add buttons. The 64×64 star-bordered marker is a strong moment.
- **Quarters panel grid (4-column with mini bar + preview list).** Repurposed as the *content* of the QUARTERS-toggled view rather than a standalone page.
- **Mobile RECENT page.** The full-button "i got it" treatment per starred card is more prominent than desktop and that's appropriate.
- **Mobile Wishlist hero.** Compressed countdown + cover + meta layout.

---

## What's cut

- **Sparkline desktop variant** (both `ReleasesWishlistSparkline` and any implied `ReleasesAllSparkline`). Bars win.
- **`ReleasesAllNoRail` artboard.** The rail wins for All Releases mode — it's the "I just want a chronological list" escape valve and the 2-column main + rail layout reads better than 3-column main without rail.
- **"Below your hype threshold (60)" sub-section** in `ReleasesAllBars`. Don't surface server-side-filtered items on the page where the filter applies. If users want to lower the threshold, they go to Settings → Appearance.
- **Chip filter row** (`category: all / plat: PS·ST·XB·GG / sort: chronological`) from `ReleasesAllNoRail`. Not specced. Defer to v2.
- **The dashed "star more from all releases →" placeholder card** in the Wishlist grid. The "// hidden: 2 unstarred" caption above the grid is sufficient.
- **The "// honest user-curated · no hype filter" caption string** in the Wishlist mode header. Developer-facing language. Either reword for users or cut. Recommend cut — the absence of a scope toggle in Wishlist mode communicates the structure already.
- **RECENT and QUARTERS as tabs in the time strip.** Replaced by banner and toggle, respectively.

---

## What's deferred to v2

- **Filter chips on Releases.** Category filter (hide DLC, hide remakes), platform sub-filtering within `my-platforms`, sort options. The agent's invented row is a reasonable v2 starting point, just not v1.
- **More elaborate Quarters drilldown.** Currently each quarter card shows a 5-item preview list. v2 could expand this into per-quarter heatmaps, hype distribution, etc.

---

## Open items for rev04 mocks

The design agent should produce updated artboards for the following:

1. **Releases / Wishlist mode (desktop), bars-only, 6 months, with banner-when-applicable.** Two states: with banner (starred drop in last 14d) and without banner (nothing recent).
2. **Releases / All mode (desktop), bars-only, 6 months, rail kept, banner conditional.** Two states: with banner (any qualifying drop) and without.
3. **Releases / Quarters-toggled state (desktop).** Strip area shows quarter buckets; page below shows the 4-column panel grid.
4. **Releases / Quarters drilldown (desktop).** User clicks Q4 in the panel grid → page renders flat chronological list scoped to Q4, same card layout as month view.
5. **Mobile All Releases scope toggle.** Add UI affordance for switching `my-platforms` ↔ `all`. Likely a small segmented control or a row near the mode switch. Designer's call on placement.

---

## Engineering constraints reconfirmed

No new schema work introduced by this rev. Specifically:

- The fixed high-hype threshold for the muted banner (80) is a constant in banner logic, not a user preference.
- `releaseDateCategory` powers QUARTERS (already there).
- `User.hypeThreshold` continues to apply server-side to All Releases mode only.
- `IgdbUpcomingRelease.hype` is consumed by HypeBars on cards and by the banner threshold check.
- `category` continues to power DLC/REMAKE pills on cards.
- Mobile inner-scroll constraint respected — banner sits inside the same scroll surface as the rest of the page.

---

## Decision log — locked

| Decision | Resolution |
|---|---|
| Time strip composition | Months only, 6 buckets, rolling from current month |
| Indicator | Bars on desktop. Bars + standalone sparkline strip on mobile |
| RECENT entry point | Conditional banner; respects mode |
| RECENT banner threshold (All mode, muted state) | Hype ≥ 80 (fixed constant) |
| RECENT banner threshold (Wishlist mode) | Starred only; no muted state |
| QUARTERS entry point | `MONTHS · QUARTERS` toggle next to the time strip |
| QUARTERS click | Drill into flat list scoped to the quarter |
| QUARTERS-toggled view content | Reuse the agent's 4-column panel grid |
| Right-rail Agenda | Kept (All Releases mode and Wishlist mode, desktop only) |
| Filter chips | Cut from v1, deferred to v2 |
| "Below hype threshold" sub-section | Cut |
| Sparkline desktop | Cut |
| Sparkline mobile | Kept |
| Empty state | Kept as designed in rev03 |
| Quarters panel grid | Repurposed as QUARTERS-toggled view content |
