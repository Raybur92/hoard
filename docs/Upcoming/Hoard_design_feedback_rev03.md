# Hoard — Design Feedback rev03
## Releases page rework (formerly "Upcoming")

---

## Context

The current Upcoming page has three problems:

1. **The hero "Next Release" countdown occupies premium real estate but answers a question the user doesn't care about.** The next release is whatever's chronologically closest — it isn't necessarily a game the user is invested in. The countdown only feels meaningful when it's tied to something starred.
2. **The Release Timeline doesn't scale.** With 50 tracked items, horizontal-axis labels collide and overlap. The pattern works for ~5–10 items, not 50.
3. **The page tries to answer two distinct questions in one undifferentiated view.** The user actually wants:
    - *When are the games I'm hyped for dropping?* (personal anticipation)
    - *What's the shape of the next few months — release-wise and money-wise?* (planning)

This rework restructures the page around those two questions, adds a "recently released" surface to close a gap, and renames the page to **Releases** to honestly describe past + future content.

---

## Structural changes at a glance

| Change | Before | After |
|---|---|---|
| Page name | Upcoming | **Releases** |
| Top-level structure | Single undifferentiated view | **Two modes:** Wishlist / All Releases |
| Hero countdown | Always shown, next chronological release | **Wishlist mode only,** next starred release |
| Time nav | `all 50 / MAY 18 / JUN 22 / JUL 7 / AUG 3` | `RECENT · MAY · JUN · JUL · AUG · QUARTERS` |
| Release Timeline | Horizontal axis with stacked labels | **Removed entirely** |
| "All" tab | Present | **Removed** (mode switch + month nav replaces it) |
| Recently released | Not surfaced | **New `RECENT` tab,** 14-day window |
| Money/heaviness signal | Not present | **Indicator per month tab** (volume in current scope) |
| Right-rail Agenda | Present | **Open question** — design agent to propose with/without |

---

## Mode 1 — Wishlist

**Scope:** `wishlist` (engineering note: existing scope, no hype filter — this is honest user-curated data).

**Purpose:** Personal anticipation. Every item is something the user starred, so every item is by definition something they care about.

### Layout

1. **Hero countdown** — kept, scoped to this mode only. Shows the next starred release with full cover, countdown timer (D/H/M/S), title, developer, genres, platforms, description, and a primary action (e.g. "Mark as owned" or wishlist toggle).
   - **Always shown when at least one starred upcoming release exists,** regardless of how far out it is. A 4-month countdown for a game the user is hyped for is still emotionally meaningful — that's the point of starring.
2. **Time nav** — `RECENT · MAY · JUN · JUL · AUG · QUARTERS` (see Time Nav section below).
3. **Release list** — starred releases grouped by the selected time bucket. Card shape consistent with the rest of Hoard (cover, title, developer, platforms, T-N countdown, star).

### Empty state

If the user has zero starred upcoming releases, Wishlist mode shows a prompt directing them to All Releases mode to discover and star games. Wishlist mode is useless empty, so the empty state should actively redirect rather than sit blank.

---

## Mode 2 — All Releases

**Scope default:** `my-platforms` (engineering note: existing scope, hype threshold from `User.hypeThreshold` applies server-side).

**Scope toggle:** Opt-in toggle to `all` for users who want to see everything regardless of platform. Small affordance, not a primary control. Default behavior is platform-scoped because most users don't care about exclusives for platforms they don't own.

**Purpose:** Planning + discovery. Answers "what's coming and how heavy is the next stretch."

### Layout

1. **No hero.** The hero countdown is a Wishlist-mode-only feature. In All Releases mode, the page leads directly with the time nav.
2. **Time nav** — same structure as Wishlist mode (`RECENT · MAY · JUN · JUL · AUG · QUARTERS`).
3. **Release list** — releases grouped by the selected time bucket. Same card shape as Wishlist mode, with star toggle prominent so users can move things into Wishlist directly from this view.

---

## Time Nav

The time nav replaces both the old `all / MAY / JUN / JUL / AUG` tabs and the killed Release Timeline. It's the single navigation surface for time-based browsing on the Releases page.

### Buckets

`RECENT · MAY · JUN · JUL · AUG · QUARTERS`

- **RECENT** — last 14 days of releases. Same scope rules as the active mode (Wishlist mode shows recently-dropped starred games; All Releases mode shows recently-dropped games on connected platforms).
- **Months** — current month + next ~5 rolling months. Default view.
- **QUARTERS** — toggle/zoom-out to quarter buckets (Q3 2026, Q4 2026, Q1 2027, etc.) with a `TBA` bucket at the end for releases without confirmed dates. Engineering note: `releaseDateCategory` already computed, no new schema work.

### Indicator system

Each tab carries a single indicator that encodes **volume in the current scope**. Same indicator works for both modes — in Wishlist mode it naturally reads as "money/investment vibe" because starred = likely purchase; in All Releases mode it reads as pure release volume. No separate signals needed; the scope does the semantic work.

**Two variants for the design agent to mock:**

#### Variant 1 — Bar + count

```
RECENT 4    MAY 18    JUN 22    JUL 7    AUG 3    QUARTERS
██░        ████░     ██████    ██░       █░
```

- Numeric count is precise.
- Bar fill scales relative to the heaviest bucket currently in view.
- Reads top-to-bottom: label, number, bar.
- Engineering note: `HypeBars` primitive exists and is unused in production — could potentially be reused or its visual language adapted.

#### Variant 2 — Sparkline

A continuous tiny line chart sitting above or below the tab row, peaks aligning with each month's tab. Single visual gesture, very terminal-aesthetic, reads as a "shape of the year" at a glance. Less precise than Variant 1 but more elegant.

```
        ╱╲
       ╱  ╲___
   ___╱        ╲__
RECENT  MAY  JUN  JUL  AUG  QUARTERS
   4    18   22   7    3
```

(ASCII sketch only — final form is design agent's call.)

**Indicator on the RECENT tab:** count is straightforward. Bar/sparkline still applies if the visual system is consistent across all tabs; could also be omitted on RECENT since it's a fixed-window bucket and comparison-against-other-buckets is less meaningful.

**Indicator on QUARTERS:** when the user toggles to quarter view, the indicator system applies to quarters instead of months. TBA bucket has count only, no bar (no meaningful "heaviness" for undated releases).

---

## RECENT tab — recently released

**Window:** Last 14 days. Tight enough to feel "recent," generous enough that users don't miss things they checked a week ago.

**Behavior:** Same scope rules as the active mode. Same card layout as month buckets.

**Action layer worth exploring (design agent's call):** For Wishlist mode specifically, starred games that have just released are at a natural state transition — wishlist → owned. The design agent should consider whether the cards in RECENT (Wishlist mode) carry an "I got it" / "Mark as owned" affordance to make this transition one tap. Flagged as worth exploring, not locked down for v1.

---

## Right-rail Agenda — open question

The current right rail (chronological list with cover thumbnails) is the most legible part of the existing Upcoming page. The question is whether the new month-grouped main column makes it redundant, or whether it still earns its space as a "just give me a flat list" escape hatch.

**Ask for the design agent:** propose the desktop layout *with* and *without* the right rail. We'll evaluate side by side.

**Mobile:** the rail can't survive on mobile (engineering note: mobile shell locks viewport, inner-scroll only). On mobile, the main column absorbs the chronological-list job — list view is essentially what the rail was already doing.

---

## What's removed

- **Global "Next Release" hero** — replaced by the Wishlist-mode-only hero. In All Releases mode, no hero.
- **Release Timeline** — killed entirely. Doesn't scale past ~10 items, and the new time nav with indicators serves the same "shape of the next few months" job better.
- **`all` tab** — killed. The mode switch (Wishlist / All Releases) plus the month nav replace it.

---

## Engineering constraints to respect

These are pulled from the engineering state notes; the design agent should design within them, not around them.

- **Three scopes (`wishlist` / `my-platforms` / `all`) stay decoupled.** The two-mode UI maps cleanly: Wishlist mode = `wishlist` scope, All Releases mode = `my-platforms` by default with an opt-in toggle to `all`. Don't re-couple them.
- **Don't repurpose `prefs.libraryView`.** If the Releases page needs a view preference (e.g. months vs. quarters default), name it separately.
- **`HypeBars` primitive exists, unused in production.** Available for the indicator system if the visual language fits.
- **`IgdbUpcomingRelease.hype` flows server-to-client but has no UI consumer.** Available if the design wants to surface hype anywhere (e.g. on cards in All Releases mode).
- **`category` column distinguishes DLC (2) and remakes (8).** Available for filtering or visual differentiation if useful.
- **`releaseDateCategory` already computes Q1–Q4 / TBA.** Powers the QUARTERS toggle for free.
- **Mobile shell locks viewport.** All scrolling happens inside the main column. No body-level scroll, no patterns that need it.
- **`User.hypeThreshold` is configurable in Settings → Appearance** and filters the IGDB feed server-side. It applies to All Releases mode only — Wishlist is honest user-curated data and should not be hype-filtered.

---

## Summary of decisions

| Decision | Resolution |
|---|---|
| Page name | **Releases** (renamed from Upcoming) |
| Top-level structure | Two modes: Wishlist / All Releases |
| All Releases default scope | `my-platforms`, with opt-in toggle to `all` |
| Hero countdown | Wishlist mode only, always shown when ≥1 starred upcoming release exists |
| Time nav | `RECENT · MAY · JUN · JUL · AUG · QUARTERS` |
| Indicator variants to mock | Bar + count; Sparkline |
| RECENT window | Last 14 days |
| Wishlist empty state | Redirect to All Releases mode to discover/star |
| "I got it" affordance on RECENT/Wishlist | Flagged for design agent to explore |
| Right-rail Agenda | Open — propose with/without on desktop, gone on mobile |
| Release Timeline | Removed |
| "All" tab | Removed |
