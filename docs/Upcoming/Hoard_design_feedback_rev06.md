# Hoard — Design Feedback rev06
## Releases page — final cleanup pass

---

## Context

rev05 closed every structural and behavioral question on the Releases page. This rev resolves three remaining issues identified in side-by-side review of the rev05 output, formalizes a previously-implicit rule about the right rail, and lists a few small punch-list items for engineering handoff that don't warrant their own mocks.

After this rev the Releases page is ready to ship.

---

## Summary of changes from rev05

| Decision | rev05 | rev06 |
|---|---|---|
| Right rail in Quarter views | Present (Q3 active, TBA) / absent (Q4 drilldown, inconsistent) | **Removed from all Quarter views** |
| Quarter view main column layout | 2-column card grid alongside rail | **3-column card grid**, full width |
| Rail rule | "Rail in All Releases mode, no rail in Wishlist mode" | **"Rail exists when the main column is grouped, not when it's flat"** |
| Mobile All Releases time navigation | Sparkline + bucket header bar; no interactive time strip | **Add horizontally-scrolling 6-month strip + MONTHS/QUARTERS toggle**, matching Mobile Wishlist |
| `_ReleasesQuartersToggled_retired_unused` | Kept in source | **Deleted before engineering handoff** |

---

## 1. The rail rule — make it explicit

The right-rail Agenda has been a moving target across revs. Up through rev05 the rule was effectively *"rail in All Releases mode, no rail in Wishlist mode,"* which got us most of the way there but failed for Quarter views: in Quarter views the main column is already a flat chronological list, so the rail was duplicating the same data in a denser shape.

The honest underlying principle is:

> **The right rail exists when the main column is grouped. When the main column is already a flat chronological list, the rail is redundant and should be removed.**

This rule, applied consistently:

| View | Main column shape | Rail? |
|---|---|---|
| All Releases · MONTHS · *month* active | Grouped under `// {month} · N releases` markers | **Yes** — rail provides flat chronological view |
| All Releases · QUARTERS · *quarter* active | Flat chronological list of items in the quarter | **No** — main column is already flat |
| All Releases · QUARTERS · TBA active | Flat list of items, sorted by hype descending | **No** |
| Wishlist · MONTHS · *month* active | 3-col grid of starred items in the month | **No** — sparse data, no flatten benefit |
| Wishlist · QUARTERS · *quarter* active | Flat list of starred items in the quarter | **No** |
| RECENT page (any mode) | Flat with green-prominent + "also out" sub-grouping | **No** (already implemented) |

This is one principle instead of two arbitrary mode-based exceptions. It's also forward-compatible — if we add a hypothetical "Year overview" view later, the rule tells us immediately whether the rail belongs.

---

## 2. Quarter views — rail removal

### Apply uniformly to:
- `ReleasesQuartersActive` (Q3 active)
- `ReleasesQuartersDrilldown` (Q4 active)
- `ReleasesQuartersTBA` (TBA active)

### Layout change

The current 2-column card grid (`gridTemplateColumns: 'repeat(2, 1fr)'`) sat alongside a 420px right rail. With the rail removed, the main column expands to full width. The card grid becomes **3-column** (`gridTemplateColumns: 'repeat(3, 1fr)'`), matching what we already did for Wishlist mode in rev05.

This gives Quarter views more cards visible per screen — appropriate, because Quarter views span 3 months of releases and the user is here for the at-a-glance view, not deep per-card consideration.

### What's preserved

- The `// {quarter label} · N releases` marker with the zoom-context caption (`· jul → sep` for Q3, `· oct · nov · dec` for Q4, `· sorted by hype` for TBA).
- The active-tab amber accent in the time strip (already correct).
- No "all quarters" breadcrumb (already correctly removed in rev05).
- Card layout unchanged — `ReleaseCard` component as designed.

---

## 3. Mobile All Releases — fill the navigation gap

`ReleasesMobileAll` currently jumps from the sparkline strip directly to a non-interactive bucket header bar (`MAY · 4 releases · SCOPE MY PLATFORMS`) and into the card list. There's no way to navigate from MAY to JUN. This is a functional gap, not a polish issue.

### What to add (matching Mobile Wishlist)

1. **Horizontally-scrolling 6-month time strip** with the same per-tab treatment Mobile Wishlist uses: 64px-min-width pill, label + count + 3px bar, amber active state. Six buckets, scroll for the rest.
2. **MONTHS · QUARTERS toggle** in the same position as Mobile Wishlist (right-aligned, above the strip, on its own row).

### Position in the artboard

After the scope toggle, before the sparkline. Order from top to bottom becomes:

1. Mode switch (`wishlist · all`)
2. Scope toggle (`my-platforms · all`) — All mode only
3. Banner (when firing)
4. MONTHS/QUARTERS toggle
5. Time strip (horizontally scrollable)
6. Sparkline strip (kept — it's a complementary year-shape glance, not a navigation surface)
7. Card list

### What about the bucket header bar?

The current `MAY · 4 releases · SCOPE MY PLATFORMS` non-interactive bar becomes redundant once the time strip is interactive — the active tab in the strip carries the same info. **Remove the bucket header bar** and let the time strip + the existing `// may 2026 · N releases on your platforms` marker above the cards do the work.

### Sparkline relationship to time strip

The sparkline and the time strip are complementary, not redundant. The sparkline shows year-shape (peaks, valleys, where the heavy months sit relative to each other) — read-only. The time strip is navigation — tap-to-switch. Keep both.

---

## 4. Wishlist · QUARTERS — not separately mocked

The combination of Wishlist mode + QUARTERS toggle exists logically (user can toggle to QUARTERS in either mode) but isn't separately mocked because the layout follows mechanically from the rules already locked:

- Wishlist mode → no rail (rule from §1)
- Wishlist scope → flat list of starred items in the active quarter
- Layout → 3-column grid, same as Wishlist Months mode
- No banner (banner is event-driven, not zoom-dependent)
- Hero countdown still present above the time strip — countdown is mode-dependent, not zoom-dependent

Implementation note for the engineer: this view exists in the page's state space and should render correctly when reached. No separate spec needed.

---

## 5. Pre-handoff cleanup

- **Delete `_ReleasesQuartersToggled_retired_unused`** before engineering handoff. Useful traceability during design iteration; design-time scaffolding doesn't ship.
- The "retired" naming pattern was helpful for review — recommend the same convention if the design agent ever needs to deprecate components in future revs.

---

## 6. Punch list — communicated at handoff, no separate mocks

These are small enough that they don't need new artboards. The implementing engineer can address as-is or coordinate with the designer if any are unclear.

- **Mobile RECENT page** could benefit from a `// just out · starred` marker above the starred list for symmetry with the `// also out · not starred` marker below. Optional polish — the green banner at the top arguably already serves as a section header.
- **Mobile MONTHS/QUARTERS toggle placement** is slightly inconsistent with desktop (separate row above the strip on mobile vs. same row as the strip on desktop). Defensible given mobile width constraints; flag for awareness only.
- **Hyped-muted banner ellipsis behavior** with very long titles needs verification at narrow viewports. The current implementation uses `text-overflow: ellipsis` on the line, which truncates the whole line including the "+N" suffix. Consider preserving the "+N" by ellipsizing inside the title list only, e.g., `Hades II 1.0, Pragm…, +2 · last 14 days`.

---

## 7. Final artboards expected from this rev

The design agent should produce:

1. **`ReleasesQuartersActive` (desktop)** — Q3 active, no rail, 3-column main column. Updated.
2. **`ReleasesQuartersDrilldown` (desktop)** — Q4 active, no rail, 3-column main column. Updated.
3. **`ReleasesQuartersTBA` (desktop)** — TBA active, no rail, 3-column main column. Updated.
4. **`ReleasesMobileAll`** — adds horizontally-scrolling time strip + MONTHS/QUARTERS toggle, removes bucket header bar. Other elements preserved.

`_ReleasesQuartersToggled_retired_unused` is deleted from the source.

No other artboards change.

---

## 8. Engineering constraints — final

No schema work introduced. All changes are presentational. Specifically:

- The rail rule is enforced in the page's render logic (`gridTemplateColumns` switches based on whether the active view is grouped or flat). One conditional, no new state.
- Quarter view 3-column grid is a CSS change, no data model change.
- Mobile time strip is the same `TimeNav` component already on Mobile Wishlist, with the same `mode="all"` and `counts={MONTH_COUNTS_ALL}` props that match desktop All Releases.

---

## Decision log — locked through rev06

| Decision | Resolution |
|---|---|
| Right rail rule | Exists when main column is grouped; absent when main column is flat |
| Quarter views (Q3, Q4, TBA) — desktop | No rail, 3-column card grid |
| Wishlist QUARTERS view | Follows the rule mechanically; no separate mock |
| Mobile All Releases time navigation | Add interactive time strip + MONTHS/QUARTERS toggle |
| Mobile All Releases sparkline | Kept as complementary year-shape glance |
| Mobile All Releases bucket header bar | Removed (redundant with active strip tab) |
| `_ReleasesQuartersToggled_retired_unused` | Deleted before handoff |
| Mobile RECENT marker symmetry | Punch list, optional |
| Mobile MONTHS/QUARTERS toggle placement | Punch list, defensible as-is |
| Hyped-muted banner ellipsis at narrow widths | Punch list, engineer verifies |

---

## Closing note

This is the last rev I expect for the Releases page on the design side. The structural decisions from rev03 (two modes, scope decoupling, hero in Wishlist only, RECENT as a 14-day surface) have held through every iteration. What's changed across revs has been execution detail and consistency cleanup — exactly what an iterative design loop is supposed to converge.

Recommended next steps after rev06 mocks land:

1. Quick visual verification pass on the four changed artboards.
2. Engineering handoff with the rev03–rev06 documents as supporting context.
3. Move attention to other Hoard surfaces still in flight.
