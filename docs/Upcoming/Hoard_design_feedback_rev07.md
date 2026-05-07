# Hoard — Design Feedback rev07
## Releases page — mobile rework and RECENT chrome cleanup

---

## Context

rev06 closed the desktop design and cleaned up the rail rule. Side-by-side review of the mobile output revealed two problems:

1. **The RECENT view on desktop still shows time-axis chrome** that's nominally for "you are at one of these time buckets," but RECENT isn't a time bucket — it's a fixed 14-day past window reached via banner. Same kind of structural lie we caught in the QUARTERS overview in rev04.
2. **Mobile has accumulated too much chrome.** Across the iteration loop, every rev added something to mobile (scope toggle, MONTHS/QUARTERS toggle, sparkline, time strip) without stepping back to ask whether the cumulative result was usable. The Mobile All artboard in rev06 had ~6 rows of controls before the first card. That's a control panel, not a release-tracking page.

This rev addresses both. The mobile change is meaningful enough to be its own pivot, so it gets the bulk of the document. The RECENT cleanup is small but worth being explicit about.

---

## Summary of changes from rev06

| Decision | rev06 | rev07 |
|---|---|---|
| Time-axis chrome on RECENT page | Time strip and toggle persist | **Removed entirely.** RECENT is its own surface, not a time bucket |
| Mobile controls visible by default | Mode switch + scope toggle + MONTHS/QUARTERS toggle + time strip + sparkline | **Header label + chevrons only.** All other controls live in a view sheet |
| Mobile sparkline | Kept as year-shape glance | **Removed.** Out of scope for Releases; revive on a future Stats page if useful |
| Mobile mode switch | Always visible row | **In view sheet** |
| Mobile scope toggle | Always visible row (All mode) | **In view sheet** (All mode only) |
| Mobile MONTHS/QUARTERS toggle | Always visible row | **In view sheet** |
| Mobile time strip | Horizontally-scrolling 6-month strip | **Replaced** by header label + chevrons + sheet's time picker |
| Mobile time-bucket switching | Tap a tab in the strip | **Chevrons** (adjacent buckets) or **sheet** (any bucket) |
| Mobile default landing state | Whatever was last set | **Wishlist + Months + current month** (predictable, ignores prior session) |

---

## 1. RECENT view — drop the time-axis chrome

### The structural rule

The time-axis chrome (mode switch, scope toggle, banner, time strip, MONTHS/QUARTERS toggle, hero countdown) implies *"you are looking at a time-axis view."* RECENT is not a time-axis view — it's a fixed 14-day past window reached as a separate surface via the banner's `[view recent →]` button. Putting time-axis chrome on it is the same kind of inconsistency we caught and fixed in the QUARTERS overview in rev04: the chrome lies about where you are.

### What RECENT keeps

- Top bar with breadcrumb (`hoard / releases / recent`)
- A clear "back to releases" affordance (the breadcrumb already does this; an explicit back button is fine if the implementer prefers)
- The page's existing content: green prompt strip → `// just out · starred` list with `[mark all owned]` → `// also released · not on your wishlist` list

### What RECENT loses

- Releases header (mode switch, scope toggle)
- Banner (you came from the banner; showing it again is redundant)
- Time strip
- MONTHS/QUARTERS toggle
- Hero countdown

### Apply to:

- **`ReleasesRecent` (desktop)** — strip out any time-axis chrome currently present. Header should be minimal: title bar with breadcrumb and a back affordance.
- **`ReleasesMobileRecent`** — already mostly correct (uses `MobileHeader` with a back arrow and skips the time strip). Verify no time-axis controls are present.

This is small but worth stating explicitly, because the same logic ("RECENT is its own surface") is what justifies treating mobile RECENT as a special case in §2 below.

---

## 2. Mobile rework — overview

The cumulative mobile chrome problem isn't fixable by tightening rows. It's fixable by recognizing that **mobile and desktop are doing the same job with different real estate, and the right answer is different information architecture, not compressed desktop IA.**

### The principle

> **Functional parity, interface leanness.** Every control desktop has, mobile has. But mobile shows by default only what's needed for the current view; everything else is one tap away in a view sheet.

### Default landing state on mobile

When the user navigates to Releases on mobile, the page shows:

1. **Mobile header** — `RELEASES` title and a compact view label below it. The label communicates current state and is tappable.
2. **Header chevrons** — small `‹` and `›` controls flanking the view label (or adjacent to it) that step through adjacent time buckets in the current zoom level.
3. **Banner** — when firing, full-width below the header. Same conditional rules as desktop (mode-respecting, hype ≥ 80 threshold for muted variant, etc.).
4. **Hero countdown** — Wishlist mode only, when there's at least one starred upcoming release.
5. **Card list** — releases for the active time bucket.
6. **Bottom tab bar** — untouched.

That's the entire page. No always-visible mode switch, no scope toggle row, no zoom toggle, no time strip, no sparkline.

### Default state values

The mobile page lands on a deterministic default each time the user navigates to it:

- **Mode:** Wishlist
- **Scope:** Not applicable in Wishlist mode (Wishlist always uses the `wishlist` scope)
- **Zoom:** Months
- **Time bucket:** Current month (or earliest month with content if current month is empty)

Rationale: the mobile use case is "quickly check what's coming up." Wishlist mode + current month gives the user the most directly useful view on arrival. If they want something else, the sheet is one tap away.

This intentionally does *not* persist last-used state across sessions. A user who was browsing Q4 last week shouldn't open the app and still be in Q4 — they should land on what's imminent. Persistence would be smarter; predictability is more useful here.

---

## 3. The header label

The compact view label in the header is the user's anchor on mobile. It does three things:

1. **Communicates current state** — what mode, what time bucket, sometimes a contextual hint.
2. **Acts as the tap target to open the view sheet.**
3. **Sits between two chevrons** that step through adjacent time buckets without opening the sheet.

### Format

The label is a single line of mono-caps text, structured as:

```
// {mode} · {time bucket} [ · {contextual hint} ]
```

### Examples by state

| Mode | Zoom | Bucket | Banner active? | Label |
|---|---|---|---|---|
| Wishlist | Months | May | yes | `// wishlist · may 2026 · 2 starred · last 14d` |
| Wishlist | Months | May | no | `// wishlist · may 2026 · next in 12d` |
| Wishlist | Months | Aug (no items) | no | `// wishlist · aug 2026 · 0 starred` |
| Wishlist | Quarters | Q3 | no | `// wishlist · q3 2026 · jul → sep` |
| All | Months | May | no | `// all · my-platforms · may 2026` |
| All | Months | May | scope=all | `// all · global · may 2026` |
| All | Quarters | TBA | no | `// all · my-platforms · tba · sorted by hype` |

The contextual hint trails after a `·` separator and is optional. Use it when there's a meaningful state worth surfacing (banner activity, the hero's countdown, an empty bucket). Skip it otherwise.

### Affordance

The label needs to look tappable. Suggestions for the design agent (pick what fits the Hoard aesthetic):

- A small dot/caret indicator at the end of the label (`// wishlist · may 2026 ▾`)
- Underline-on-active-state
- Adjacent settings/filter icon (less preferred — adds a tap target)

Whatever is picked, the chevrons next to the label must be visually distinct from the label itself, since they have different behaviors (chevrons step buckets, label opens sheet).

### Chevron behavior

- **`‹`** — step to previous bucket in current zoom. Disabled (or absent) at the earliest bucket.
- **`›`** — step to next bucket in current zoom. Disabled (or absent) at the latest visible bucket.
- In Months zoom, the visible range is the same 6 months desktop shows (current month + 5 forward). Chevrons don't scroll past that range; if the user wants to see further out, they open the sheet and switch to Quarters.
- In Quarters zoom, chevrons step Q3 → Q4 → Q1 → TBA. TBA is the rightmost; no step past it.

### Banner-driven label state

When the RECENT banner is firing and the user is in Wishlist mode, the contextual hint surfaces it (`· 2 starred · last 14d`). When the banner is *not* firing, the hint shows the next imminent countdown if there is one (`· next in 12d`) or the bucket count (`· 0 starred`). Mode logic from desktop carries over — Wishlist mode never shows hyped-but-unstarred hints, even in the label.

---

## 4. The view sheet

Tapping the header label opens a sheet that slides up from the bottom of the screen, occupying roughly half the viewport. The sheet contains every control that's not on the page.

### Sheet contents

Vertical layout, top to bottom:

1. **Sheet header** — title `// view`, close affordance (X icon top-right or swipe-down).
2. **Mode** section — segmented control with `wishlist · all`. Active state highlighted.
3. **Scope** section (only when mode = All) — segmented control with `my-platforms · all`. Active state highlighted.
4. **Zoom** section — segmented control with `months · quarters`. Active state highlighted.
5. **Time bucket** section — list of selectable buckets at the current zoom level:
   - When zoom = Months: 6 months as tappable rows, each showing label + count + bar (same indicator system as desktop). Active month highlighted.
   - When zoom = Quarters: Q3, Q4, Q1, TBA as tappable rows, same indicator treatment. Active quarter highlighted. TBA shows count only, no bar (as designed in rev03).
6. **Done / Apply** button at the bottom (full-width). Closing the sheet via tap-outside or swipe-down also applies pending changes.

### Behavior

- Changing mode/scope/zoom updates the time bucket list inline (e.g., switching zoom from Months to Quarters re-renders the list as quarters).
- The Done button is mostly for users who prefer explicit confirmation; tap-outside is the faster path.
- Sheet state persists during the session — reopening the sheet shows the current state, not a reset.

### Why a sheet vs. an expanded inline section

Sheets are universal on mobile (Spotify, Apple Music, Twitter, iOS native settings all use them). They get out of the way completely when closed and provide enough vertical real estate when open to make the time bucket list comfortable to tap. An inline expandable section would either crowd the page or be too small to be tappable.

---

## 5. Mobile RECENT — special case

RECENT is reached via banner and is its own surface (per §1 above). On mobile, this means:

- **No header label peeker** (no current "view" to label).
- **No chevrons** (RECENT is not a time bucket; you can't step into an adjacent one).
- **No view sheet** (the sheet's controls are all about choosing a time-axis view, which RECENT isn't).

The mobile RECENT page is just: `MobileHeader` with back arrow → green prompt strip → starred list with `[i got it]` per card → `// also out · not starred` list. This is already what `ReleasesMobileRecent` looks like in rev05 and is correct.

**Punch-list polish from rev06 still applies:** add a `// just out · starred` marker above the starred list for symmetry with the `// also out · not starred` marker below.

---

## 6. Banner on mobile

Banner placement and conditional rules are unchanged from rev05. The banner sits above the header label area when firing — full-width within the page padding, same green-prominent or muted treatment as desktop.

When the banner is firing in Wishlist mode, the header label's contextual hint mirrors the banner's signal (`· 2 starred · last 14d`). This creates two visible references to the same fact, but they're at different fidelities — the banner is the actionable surface (`[view recent →]`), the label is the persistent breadcrumb of "what's worth knowing right now." Acceptable redundancy.

---

## 7. What's gone from mobile

Itemized for the design agent:

- Mode switch row (`WISHLIST · 7 / ALL · 17`) — replaced by mode in sheet.
- Scope toggle row (`SCOPE [my-platforms · all]`) — replaced by scope in sheet, only visible in All mode.
- MONTHS/QUARTERS toggle row — replaced by zoom in sheet.
- Horizontally-scrolling 6-month time strip — replaced by header label + chevrons + sheet's time bucket list.
- Sparkline strip (`// shape of the year · peak · jul`) — removed, deferred to future Stats page.
- Non-interactive bucket header bar (`MAY · 4 releases · SCOPE MY PLATFORMS`) — already removed in rev06 plan.

The mobile page goes from 6+ rows of chrome to roughly 1.5 (header with label + chevrons, then optional banner). Content earns the screen.

---

## 8. Sparkline — final disposition

The sparkline was added in rev04 as a mobile-only solution to the "can't fit 6 month tabs side-by-side" problem. With the time strip moving into the sheet, the workaround it was solving for is gone. The sparkline itself is also genuinely a "shape of the year" visualization more aligned with stats/analytics than with release tracking, so removing it from Releases keeps the page focused.

If a future Stats surface is built, sparklines (year-shape, hype distribution, month-over-month trends, etc.) are a natural fit there. Out of scope for Releases v1.

---

## 9. Final mobile artboards expected from this rev

The design agent should produce:

1. **`ReleasesMobileWishlist` — landing state.** Header with view label + chevrons → no banner → hero countdown → cards. Lean.
2. **`ReleasesMobileWishlist` — banner-firing state.** Same as above with banner inserted between header and hero, label hint reflecting banner.
3. **`ReleasesMobileAll` — landing state.** Header with view label + chevrons → cards. No hero (per rev03 rule).
4. **`ReleasesMobileAll` — banner-firing state.** Same as above with banner inserted.
5. **`ReleasesMobileViewSheet` — sheet open over the page.** Shows mode + scope (visible because demo state is All mode) + zoom + time bucket list + Done. Probably mocked twice: once with zoom=Months showing the 6-month list, once with zoom=Quarters showing Q3/Q4/Q1/TBA list.
6. **`ReleasesMobileRecent`** — verify time-axis chrome is fully absent; add the `// just out · starred` marker above the starred list.

Existing mobile artboards (`ReleasesMobileWishlist`, `ReleasesMobileAll`, `ReleasesMobileRecent`) should be replaced or marked retired with the underscore-prefix convention used previously.

---

## 10. Desktop changes from this rev

Only one: **`ReleasesRecent` (desktop)** strips out time-axis chrome (mode switch, scope toggle, time strip if present, MONTHS/QUARTERS toggle if present). Header becomes minimal: top bar with `hoard / releases / recent` breadcrumb. Page content unchanged.

All other desktop artboards from rev05/rev06 are unaffected.

---

## 11. Engineering constraints — final

No schema work introduced. All changes are presentational and routing-level. Specifically:

- The view sheet is a new component but consumes the same state and props the existing inline controls do. No data model change.
- Header label content is derived from existing state (mode, scope, zoom, bucket) plus banner state (which already exists for the banner component itself).
- Chevrons compose `step(currentBucket, direction)` over the existing bucket list. No new state.
- Mobile default landing state means the page resets mode/scope/zoom/bucket on each navigation to Releases. If the implementer wants to keep these as URL params or per-mount state for deep linking, that's fine — but they should always default to the rev07 values when no params are provided.
- RECENT page chrome cleanup is purely a render change in `ReleasesRecent`; no routing change.

---

## Decision log — locked through rev07

| Decision | Resolution |
|---|---|
| RECENT page chrome | No time-axis chrome anywhere; minimal header with breadcrumb only |
| Mobile information architecture | Different from desktop. Functional parity, interface leanness |
| Mobile default landing state | Wishlist + Months + current month, deterministic per navigation |
| Mobile primary controls on page | Header label + two chevrons. Nothing else |
| Mobile mode/scope/zoom/time picker | View sheet, opened via header label tap |
| Mobile sparkline | Removed; deferred to future Stats surface |
| Mobile time strip | Removed; replaced by header label + chevrons + sheet |
| Mobile RECENT | Special case — no label, no chevrons, no sheet. Same as today, plus `// just out · starred` marker addition |
| Header label format | `// {mode} · {time bucket} [ · {contextual hint} ]` |
| Chevron behavior | Step adjacent buckets in current zoom. Disabled at extremes |
| Sheet behavior | Slides from bottom; tap-outside applies; explicit Done available |
| State persistence across sessions | None for mobile defaults |

---

## Closing note

The Releases page has now been through seven revs. The structural decisions from rev03 still hold; everything since has been execution detail. This rev is the largest single departure because it acknowledges that mobile needed a different IA, not just a denser version of desktop's.

Recommended next steps after rev07 mocks land:

1. Visual verification pass on the new mobile artboards.
2. One end-to-end usability check on mobile — open the page, find each control, perform common tasks (switch mode, jump to next month, open RECENT, change scope). If any task takes more than two taps, flag it.
3. Engineering handoff with rev03–rev07 documents as supporting context.
4. Move attention to other Hoard surfaces.
