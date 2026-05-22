# Hoard — Surface Layer

Canonical artifact from `/layers-surface` sessions. The surface is the layer users encounter — copy, color, type, spacing, motion, feedback. It honors or undermines every decision made in the layers below.

**Source dependencies:**
- Sealed conceptual model: [`docs/CONCEPTUAL_MODEL.md`](CONCEPTUAL_MODEL.md) (CM1–CM12)
- Sealed strategy: [`docs/PRODUCT_STRATEGY.md`](PRODUCT_STRATEGY.md) (S0–S14)
- Source needs: [`docs/USER_RESEARCH.md`](USER_RESEARCH.md) (N1–N12)
- Sealed breadboard: [`docs/INTERACTION_FLOW.md`](INTERACTION_FLOW.md) F1 (manual-add a game)

**Method:** decision inventory (Part 2 of `/layers-surface` — Phases 6–10) applied to F1's net-new surface patterns. Existing surface audit (Part 1) deferred to a separate session.

**Medium:** screen UI exclusively (PWA, desktop + mobile breakpoints).

---

## 1. Design system as constraint

These are *locked*. Surface decisions in this doc must extend the established system, never contradict it. Strategy anchors:

- **S1** — Terminal aesthetic is a constraint, not a variable. Hoard's visual identity is settled; nothing below re-litigates it.
- **N6** — Aesthetic as identity. Dense terminal-style information presentation isn't decoration — it's the craft-instrument feeling that makes the tool feel like the user's own. Surface choices that dilute density or "consumer-app-ify" the look (rounded everything, big illustrations, reactive emojis) are rejected on identity grounds.

### 1.1 Color palette (locked)

| Token | Hex | Role |
|---|---|---|
| `--void` | `#07090a` | Page background |
| `--ink` | `#0d1012` | Card / panel background |
| `--ink-2` | `#14181b` | Raised panel, hover state |
| `--paper` | `#ece8de` | Primary text |
| `--paper-dim` | `#a9a89e` | Secondary text — passes WCAG AA contrast against `--void` and `--ink` |
| `--paper-faint` | `#6b6f72` | Decorative only — **banned as text color under 17px** per accessibility rule |
| `--rule` | `#23292d` | Hairlines, borders |
| `--amber` | `#d4a017` | Wishlist · highlights · CTA |
| `--green` | `#5fc26a` | Playing · Completed · active · ok |
| `--red` | `#e2553a` | Dropped · errors |
| `--blue` | `#69a1d4` | On Hold · info |

### 1.2 Status color mapping (locked)

| GameStatus | Color | Treatment |
|---|---|---|
| Playing | `--green` | Primary green; active state |
| Completed | `--paper` | Primary text color; "finished, no special highlight" |
| Backlog | `--paper-dim` | Secondary; "the default place" |
| On Hold | `--blue` | Distinguishable from Playing |
| Dropped | `--red` | Negative-but-not-error; muted dead-game state |
| Wishlist | `--amber` | Aspirational; matches the CTA amber for wishlist actions |

### 1.3 Typography (locked)

- `var(--mono)` — **JetBrains Mono** — primary font for all UI
- `var(--sans)` — IBM Plex Sans — long-form prose / descriptions
- `var(--display)` — Major Mono Display — hero numbers / logo

Scale: `--text-3xs` (10px) · `--text-2xs` (11px) · `--text-xs` (12px) · `--text-sm` (13px) · `--text-base` (14px) · `--text-md` (17px) · `--text-lg` (22px) · `--text-xl` (28px) · `--text-2xl` (44px) · `--text-display-sm` (56px) · `--text-display` (96px)

**Floor rules** (enforced by audit, not lint):
- Interactive text ≥ `--text-xs` (12px)
- Body content ≥ `--text-sm` (13px)
- `--paper-faint` banned as text color < 17px (use `.t-faint` utility which maps to `--paper-dim` for ~9.4:1 contrast)

Line-height tokens: `--lh-tight: 1.15` · `--lh-snug: 1.3` · `--lh-normal: 1.5` · `--lh-relaxed: 1.7`

### 1.4 Utility classes (locked)

`.t-display` `.t-mono` `.t-sans` `.t-up` `.t-tnum` (tabular numerals)
`.t-dim` `.t-faint` `.t-ghost` `.t-amber` `.t-green` `.t-red`
`.panel` `.panel.raised` `.panel.flat`
`.chip` `.chip.on` `.chip.amber` `.chip.green`
`.btn` `.btn.primary` `.btn.amber` `.btn.sm`
`.plat` `.plat.lg` `.field` `.marker` `.receipt`
`.sr-only` `.skip-link`

### 1.5 Responsive breakpoint (locked)

- ≥ 1024px → desktop layout (sidebar + topbar)
- < 1024px → mobile layout (mobile header + tab bar)
- Use the `useBreakpoint()` hook; no inline media queries in component logic

### 1.6 Accessibility (locked)

WCAG 2.1 AA is the hard floor per Phase 8 PR 3. Specifically:
- Every interactive element has `:focus-visible` amber ring
- All form inputs have proper `<label htmlFor>` associations
- All modal dialogs have `role="dialog"`, `aria-modal`, focus trap, Escape close
- All `<div onClick>` patterns rejected — `<button>` for all interactive non-link elements
- Color contrast verified across all color pairings on real backgrounds
- `prefers-reduced-motion` respected for any motion

**What this means for F1's surface decisions:** they're constrained, not invented. The visual language is already established; I'm placing F1's affordances within it.

---

## 2. PLATFORMS section visual treatment (proposal — awaiting Andrea's reaction)

The CM12-driven rename of GameDetail's `OWNED ON` → `PLATFORMS` is F1's single most visible surface change. Locking this treatment first because subsequent F1 surface decisions (status-first P2 layout, platform picker structure, etc.) lean on the visual language established here for per-platform state.

### 2.1 Concept

A single unified list of platform-relationship rows. Each row carries its own state — playtime hours (or `—` if unknown) for owned platforms, `wishlisted` marker for wishlisted platforms. The terminal aesthetic does the visual differentiation work; no need for group headers or background-color row variants.

Why unified flat list rather than grouped (`owned`/`wished` headers):
1. CM12's framing is "PLATFORMS = each row carries its own state" — visual grouping risks re-creating the "OWNED ON" semantic by relegation
2. The amber `wishlisted` marker IS the differentiation; group headers add vertical noise without adding clarity
3. Maintains terminal-aesthetic density (less wasted vertical space — matches the `.receipt` pattern Hoard already uses for compact metadata)
4. Owned-vs-wished is scannable by color: monochrome/green playtime for owned, amber `wishlisted` for wished — instant read

### 2.2 ASCII mock (desktop, GameDetail)

```
// PLATFORMS ─────────────────────────────────────────────────

[PS]  PS5            42h
[ST]  PC             wishlisted              [× un-wishlist]
[NT]  Switch         wishlisted              [× un-wishlist]
[GB]  Game Boy       —
─────────────────────────────────────────────────────────────
```

Row anatomy, left to right:
- **`.plat` badge** — 2-char platform code (`PS`, `ST`, `XB`, `GG`, `NT`, `EP`, `GB`, `SNES`, etc.) in the existing terminal-style square badge. Reuses current `.plat` class.
- **Platform name** — full name in `t-mono` at `var(--text-xs)` (12px), `var(--paper)`. Both owned and wishlisted rows use the same color here — both are valid relationships.
- **State column** — fixed-width column for visual alignment across rows:
  - **Owned with playtime:** `42h` in `t-mono t-tnum` at `var(--text-xs)`, `var(--paper)`. Tabular numerals keep the digit column visually aligned.
  - **Owned without playtime:** `—` in `t-mono` at `var(--text-xs)`, `var(--paper-faint)` rendered via `.t-faint` (which maps to `--paper-dim` per accessibility floor).
  - **Wishlisted:** the word `wishlisted` in `t-mono t-amber` at `var(--text-xs)`, all-lowercase per terminal aesthetic. No badge frame around the word — keeps it clean.
- **Action column** (rightmost) — only present on wishlisted rows:
  - `[× un-wishlist]` button in `t-mono` at `var(--text-2xs)` (11px), `var(--paper-dim)`. **Always visible** — Hoard's craft-instrument identity (N6) prefers honest always-visible affordances over hover-reveal consumer-app patterns.

Row separator: hairline `1px solid var(--rule)` between rows. Matches the existing `.receipt` row pattern.

Section header: `// PLATFORMS` in `t-mono t-up` at `var(--text-2xs)`, `var(--paper-dim)`, with horizontal rule extending right to fill the width — same treatment as existing GameDetail section headers (`// OWNED ON`, `// HLTB`, `// notes`).

### 2.3 Row ordering

Two-band sort:
1. **Owned platforms first**, sorted by playtime descending (existing behavior — highest playtime first)
2. **Wishlisted platforms second**, sorted alphabetically by platform name

Implicit grouping via sort order — no header subdivision required. The natural reading order is "what I have first, what I want second," which matches collector mental model (owned reality before wishful intent).

### 2.4 Mobile treatment (< 1024px)

Same row structure, compressed. Platform name may truncate with ellipsis if too long. `[× un-wishlist]` stays always-visible (no hover concept on touch). Row height stays compact — same `var(--text-xs)` for content, ~32px row height.

```
// PLATFORMS ──────────────

[PS] PS5         42h
[ST] PC          wishlisted  [×]
[NT] Switch      wishlisted  [×]
[GB] Game Boy    —
───────────────────────────
```

On the narrowest viewports the `[× un-wishlist]` text label collapses to just `[×]` with `aria-label="un-wishlist {platform}"` for accessibility. Tap target stays 44×44pt per Apple HIG (transparent padding around the visual `×`).

### 2.5 Surface phase lenses applied

**Feedback (Phase 6):** Tap `[× un-wishlist]` → row animates out (soft fade + height collapse, respecting `prefers-reduced-motion`) within ~150ms. No toast — the section itself IS the feedback; the row's disappearance is unambiguous. Optimistic update: row removes immediately, server call fires in background; on server error, row restores + small inline marker `// couldn't un-wishlist · [retry]` at the section footer.

**Hierarchy / emphasis (Phase 7):**
- Section heading is low-prominence (`--text-2xs` dim) — it's a label, not a call-to-action
- Owned rows visually neutral (`--paper` color, normal mono) — primary content the user is most often checking
- Wishlisted rows accent via the `wishlisted` marker (`--amber`) — secondary but distinguishable
- `[× un-wishlist]` is intentionally low-prominence (`--text-2xs`, dim color) — destructive-ish action shouldn't compete with the data display

**Accessibility (Phase 8):**
- Row structure as semantic HTML: probably `<ul>` of `<li>` rows, each with the platform name as primary text and state as secondary
- Per-row `[× un-wishlist]` is a `<button>` with `aria-label="un-wishlist {platform-name}"` so screen readers convey context
- Color is never the only signal — wishlisted state is also conveyed by the literal word "wishlisted," not just by amber color
- Plat badge has appropriate text content (the platform code) — readable by screen readers naturally

**Consistency (Phase 9):**
- Row spacing + separators match existing `.receipt` pattern (already used elsewhere in GameDetail)
- `wishlisted` marker color matches the global Wishlist status color (`--amber`) — same semantic across the app
- Section heading style matches all other GameDetail section headings (`// X`)
- The `.plat` badge is the existing pattern — no new visual primitive invented

### 2.6 Open sub-decisions within this proposal

| Question | Lean |
|---|---|
| Should `[× un-wishlist]` confirm before removing, or remove immediately with optimistic update? | **Remove immediately** — operation is cheap, low-stakes, easily undone by re-wishlisting. Confirm modal would feel heavy. Optimistic + soft toast on error covers the edge case. |
| Should the section show platforms IGDB knows the game was released on but the user has no relationship with? (e.g. Pokemon Red was on GBC too — show that as a "// also available on" hint?) | **No** — the PLATFORMS section is about the user's relationships. IGDB platform metadata can surface elsewhere on GameDetail (e.g. a separate "// released on" section) but doesn't belong here. Including it would dilute the "PLATFORMS = your platforms" framing. |
| How to render `wishlisted` row on mobile when text is tight? | Keep the full word "wishlisted" if it fits; truncate platform name first (ellipsis). The word is short (10 chars) and load-bearing for clarity. |
| Should the global `[+ wishlist]` / `[- un-wishlist]` toggle on GameDetail's hero area stay (the existing one) given the per-row affordance? | **Yes, keep both per CONCEPTUAL_MODEL §3.4.2.** The hero toggle is the "I want this game (across the board)" shortcut that clears all wishlistedPlatforms; the per-row affordance is the surgical "remove just this platform" action for collectors who care. |

### 2.7 What this doesn't decide yet

The PLATFORMS section proposal locks the visual treatment of GameDetail's per-platform display. It does **not** decide:
- The visual treatment of the platform picker inside F1's P2 modal (different surface, different constraints — covered in §3 below once §2 is locked)
- How the owned-without-playtime case (`—`) interacts with manual-add UX (covered when §4 P2 walkthrough lands)
- Visual treatment of the wishlist-fulfilled-by-ownership-add transition ("you got it!" copy from §3.2 conflict matrix) — pure post-success-state surface, covered in §6 P5 treatment

---

## 3. Status-first P2 layout

Per CM12 + Stash-audit-informed lock, status is the visually primary question in P2. The current AddGameModal renders platform + status as parallel `<select>` dropdowns side-by-side; the redesign elevates status to the top and reshapes it as a chip strip.

### 3.1 Concept

Status as a horizontal chip strip at the top of P2's content, immediately under the modal header. Six chips, all visible at once (no menu drill-down). Default chip pre-selected based on entry intent. Below status: the game summary card. Below that: secondary affordances (platform + mediaType) in a two-column grid.

Why chips over dropdown:
1. All 6 options visible at once — no cognitive cost to discover what's available
2. Matches the existing Library shelf-filter chip pattern (consistency per Phase 9)
3. Terminal-aesthetic alignment — chips = labels, not consumer-app select widgets
4. Color-coded chips reinforce the status palette established in §1.2

### 3.2 ASCII mock (desktop)

```
// add game · pokémon red ───────────────────────────────── [×]

// status
[ playing ] [ backlog ] [ completed ] [ on hold ] [ dropped ] [ wishlist ]
              ─────                                              ▲
              ↑ filled green                                     ↑ amber border if intent=wishlist

// game ──────────────────────────────────────────────────────
  [cover]   Pokémon Red Version
            Game Freak · 1996                        [pick different]

// platform                    // media type
[ Game Boy ▾ ] (picker)        [ physical cart ▾ ]

// condition                   // region
[ loose ] [ cib ] [ sealed ]   [ NTSC-U ] [ NTSC-J ] [ PAL ]
[ replica ] [ graded ]         [ other ]
            ↑ only visible when mediaType ∈ physical set

[+ more details ▼]

────────────────────────────────────────────────────────────
[ cancel ]                                  [+ add to library ]
```

### 3.3 Status chip color treatment

Each chip uses the locked status palette from §1.2 when active:
- `playing` → `.chip.on` with `--green` fill
- `completed` → `.chip.on` with `--paper` fill (matches "primary text" status color)
- `backlog` → `.chip.on` with `--paper-dim` fill (the muted "default" state)
- `on hold` → `.chip.on` with `--blue` fill
- `dropped` → `.chip.on` with `--red` fill
- `wishlist` → `.chip.amber` (matches existing wishlist amber across the app)

Inactive chips: standard `.chip` (outline only, `--paper-dim` text, `--rule` border).

### 3.4 Mobile treatment

Chip strip wraps to 2 rows if needed (6 chips on a narrow viewport may not fit single-line). Wrap order preserves the strip's reading order (Playing first, Wishlist last). Tap target ≥44pt per HIG.

---

## 4. Platform picker visual structure (two-stage, inline)

The platform picker is the densest single piece of UI in P2. ~50 entries across three buckets requires explicit visual structure.

### 4.1 Concept

**Inline expansion within P2** — tapping the platform field expands the picker in-place, replacing the field's collapsed state until selection. No nested modal (P2 is already a modal; a second one would feel heavy). Stage 1 (bucket tabs) + stage 2 (filtered list with pin sections) render in the expanded area.

When the user picks, the picker collapses back to a field showing the selected platform + a `[change]` affordance to reopen.

### 4.2 ASCII mock — collapsed state

```
// platform
[ Game Boy ▾ ]
```

### 4.3 ASCII mock — expanded state (picker open, IGDB pre-opened to Retro)

```
// platform — picking...

[ digital ]  [ physical ]  [ RETRO ]                ← bucket tabs; RETRO pre-opened (amber)
─────────────────────────────────────────────────────

$ filter platforms…                                  ← type-to-filter field, $ prefix

// suggested for this game
  [GB]   Game Boy                                   ← from IGDB metadata, top
  [GBC]  Game Boy Color
  [VC]   Wii Virtual Console

// recently used
  [SNES] Super NES
  [NES]  NES

// all (alphabetical)
  [ATARI] Atari 2600
  [DC]    Dreamcast
  [GG]    Game Gear
  [N64]   Nintendo 64
  ...

──────────────────────────────────────────────────────
[ + other / freeform platform ]                       ← escape hatch
```

### 4.4 Bucket-tab visual treatment

Bucket tabs use the existing `.chip` utility with one extension: the active bucket gets a 2px `--amber` underline (matching the mobile-tab-bar active-state pattern from Phase 8 PR 2). Pre-opened bucket = active bucket on first render.

If no IGDB suggestion exists (freeform-fallback game), default to **Digital** (most common case).

### 4.5 Pin section dividers

Each pin section has a small `// section-name` heading in `t-mono t-up` at `--text-2xs`, `--paper-dim`. Same treatment as section headings throughout the modal. Sections only render when they have content (no "// recently used" header if user has no recent picks).

### 4.6 Row treatment

Each row: `.plat` badge (left) + full platform name (mono, `--paper`). Tap target ≥44pt; hover state `--ink-2`. Selected row → collapses picker back to the field state with the choice locked in.

### 4.7 "Other / freeform platform" escape hatch

Pinned at the bottom of every bucket's stage-2 list (regardless of filter state). Tap → reveals a small free-text input within the expanded picker area:

```
// other / freeform platform
[ type a platform name… ]   [ use this name ]
```

Saving stores the free-text label on UserGame for the row. Future canonical entities can be migrated to from matching free-text labels per OQ-F1-8 resolution.

Display back in the PLATFORMS section: a freeform-labeled platform shows the **first 2–4 characters** of the typed name as the `.plat` badge (uppercased), with the full name beside it. E.g. typing "Steam Deck" → badge "STEA" + name "Steam Deck". Hoard's terminal aesthetic absorbs the unusual badge naturally.

### 4.8 Mobile treatment

The picker expands to fill the available viewport height (because the modal is already full-screen on mobile). Bucket tabs span full width. Stage-2 list scrolls within the available area; type-to-filter stays sticky at top.

---

## 5. IGDB-suggested platform pre-pin treatment

Covered in §4.3 as the "suggested for this game" pin section. Visual treatment additions:

- IGDB-reported platforms appear in IGDB's reported order (first IGDB platform = first pin row). This matches IGDB's release-order convention (typically original platform first).
- No auto-pre-selection — list at top, let user tap. Pre-selecting would risk IGDB's "first platform" not matching the user's actual platform.
- If IGDB reports zero platforms (rare — IGDB ID exists but metadata sparse), no suggested section renders.

### 5.1 Visual cue when pre-opened

When P2 opens with an IGDB-suggested bucket pre-opened, the bucket tab has its active-state underline animated in (~120ms fade-in, respecting `prefers-reduced-motion`). Subtle; tells the user "I noticed something about this game" without being pushy.

---

## 6. P5 post-success summary (pattern b)

The modal stays open with summary + CTAs + auto-close timer. Visual treatment replaces P2's form area entirely with the summary panel.

### 6.1 ASCII mock

```
// add game ──────────────────────────────────────────────── [×]



        // added · pokémon red · Game Boy · backlog
                ─────────
                ↑ t-green color on "added" word



        view game  ·  + rate / note  ·  + add another


────────────────────────────────────────────────────────────
                                                    [ done ]
████████████████░░░░░░░░░░░░░░░░  (~3s auto-close bar)
```

### 6.2 Content treatment

- Summary line: `// added · {title} · {platform} · {status}` in `t-mono` at `--text-sm`, the word "added" colored `--green` to give a soft positive accent without using a graphical checkmark (which would feel consumer-app-y)
- Three text-link CTAs separated by `·` middots: `view game` · `+ rate / note` · `+ add another`. Each is a `<button>` styled as a text link (`--paper-dim` color, underline on hover/focus, no border). Lower-affordance than the `[done]` button but clearly clickable.
- `[done]` button in the footer-right position (same place as the prior `[+ add to library]` button) — primary visual weight stays there even though the action shifted from "save" to "close"
- Auto-close progress bar: 2px-thick `--green` fill at the very bottom of the modal, draining left-to-right over 3 seconds. Respects `prefers-reduced-motion` — when reduced, bar appears at full and snaps to empty at the 3s mark with no animation.

### 6.3 Copy variants by save outcome

Per the §3.2 conflict matrix:

| Save outcome | Summary copy |
|---|---|
| New UserGame | `// added · pokémon red · Game Boy · backlog` |
| Silent merge (same game, new platform owned) | `// added Switch to your platforms · pokémon red` |
| Wishlist + future-release IGDB | `// added to wishlist · pokémon scarlet · counting down 23 days` |
| Owned-on-PS5 + new wishlist-on-PC (GTA case) | `// wishlisted on PC · gta v (you own it on PS5)` |
| Wishlist-fulfilled-by-ownership-add | `// you got it! · moved Switch from wishlist to backlog` |

The "you got it!" variant is the moment where Hoard's craft-instrument identity (N6) gets to be warm without being twee. Treat that copy specifically — keep the exclamation, make it feel like Hoard noticing the user's intent.

### 6.4 Hover-cancel of auto-close

Hovering the modal pauses the auto-close progress bar (and timer). Useful for users who want to read the summary before deciding which CTA to tap. Mobile equivalent: any touch on the modal pauses the timer.

---

## 7. Platform-pin indicator + [× unpin]

After [+ add another], P5 returns to P1 empty with platform pin preserved.

### 7.1 ASCII mock

```
// pinned: snes · [× unpin]
──────────────────────────────────────────────

$ search IGDB by title…


[scan barcode] [photo of label]
```

### 7.2 Treatment

- Pin indicator row sits above the search field, full-width
- `// pinned: {platform-name}` in `t-mono` at `--text-xs`, `--paper-dim` (low-prominence — it's context, not a CTA)
- `[× unpin]` as a `<button>` styled as a text link, `--text-2xs`, `--paper-dim`, hover/focus state goes to `--paper`
- Separator hairline below: `1px solid var(--rule)` extending full width — same pattern as section dividers elsewhere

When the user picks a game in P1 → P2, the pin auto-fills the platform field. The expanded picker (per §4.3) doesn't render for pinned adds — user can still tap `[change]` to reopen the picker if they want a different platform for this add (without unpinning).

---

## 8. [+ more details] collapsible panel

The optional fields panel inside P2 — collapsed by default, expands inline.

### 8.1 ASCII mock — collapsed

```
[+ more details ▼]
```

### 8.2 ASCII mock — expanded

```
[− more details ▲]

// playtime
hours: [    ]    minutes: [    ]
```

### 8.3 Treatment

- Collapsed: text-link affordance, `--paper-dim` color, `t-mono` at `--text-xs`. Single line.
- Expanded: chevron rotates ▼ → ▲. Reveals only the F1-implemented fields (manual playtime). Times-beaten slot (per CM12 bundle, deferred) doesn't render in F1 — placeholder is invisible until implementation.
- Hours / minutes inputs use the existing `.field` utility class; `t-tnum` for the input value to keep digit alignment
- Expansion animation: soft fade-in + height transition over ~150ms (respects `prefers-reduced-motion`)

### 8.4 Open/close state — NOT remembered across sessions

Per OQ-S-1 below: the panel is always collapsed when the modal opens fresh. Power users who use [+ more details] every time get one extra click; casual users get the lean default. Tradeoff worth pinning.

---

## 9. Conditional pickers (condition / region)

When mediaType ∈ {PHYSICAL_DISC, PHYSICAL_CART, ROM}, two additional pickers appear below mediaType in P2.

### 9.1 ASCII mock (condition + region, visible)

```
// condition
[ loose ] [ cib ] [ sealed ] [ replica ] [ graded ]

// region
[ NTSC-U ] [ NTSC-J ] [ PAL ] [ other ]
```

### 9.2 Treatment

- Same chip-strip pattern as the status picker (§3) — consistency per Phase 9
- Chips use the standard `.chip` utility (no special color states for condition/region — they're descriptive, not status)
- Active chip → `.chip.on` (filled with `--paper-dim` background, `--paper` text)
- Both pickers are optional — none-selected is a valid state; the picker just has no active chip
- Transition when they appear (mediaType changes from digital to physical): soft fade-in + height grow over ~150ms, respects `prefers-reduced-motion`

---

## 10. Per-row [× un-wishlist {platform}] affordance

Covered fully in §2 as part of the PLATFORMS section. No additional treatment needed here — the affordance lives entirely within GameDetail's PLATFORMS section, not within F1's modal flow.

---

## 11. Error / loading / empty states

Every state needs an explicit treatment per Phase 6.

### 11.1 P1 states

| State | Visual treatment |
|---|---|
| **Empty** | Search field placeholder text `search IGDB by title…`. Below: camera-affordance row (if camera available). No results area shown. |
| **Searching** | Search field active. Small `...` indicator at right of input, animated dots (respects reduced-motion). Results area renders skeleton rows (3 placeholder rows with `.panel.raised` background, `--rule` accent) so the user knows results are coming. |
| **Results** | Skeleton rows replaced by real results. List of IGDB matches in `.panel` with hairline row separators. |
| **No-results** | Text marker `// no results for "{query}"` in `t-mono`, `--paper-dim`. Below, prominently: `[+ add freeform "{query}"]` button as `.btn.amber` (high-affordance — important escape hatch). |
| **IGDB error / timeout** | Text marker `// IGDB unreachable — couldn't fetch results` in `t-mono`, `--red`. Below: `[retry]` button + `[+ add freeform]` button side-by-side. Both as `.btn` (not amber — neither is the primary path, user picks). |

### 11.2 P2 states

| State | Visual treatment |
|---|---|
| **Saving** | Form fields visually disabled (opacity 0.6, pointer-events none). Save button shows `[ saving… ]` with `t-faint` style. |
| **Validation failure** | Inline red marker below the offending field: `// {field} required` or `// {field} invalid`. Field border accent in `--red` (1px). |
| **Server error (5xx / network)** | Footer-level marker above buttons: `// couldn't save — try again` in `t-mono`, `--red`. Save button replaced with `[ retry ]` button. Form data preserved. |
| **Auth error (401)** | Modal closes; redirect to `/login` (existing app-wide pattern, no special surface here). |

### 11.3 P3 states

| State | Visual treatment |
|---|---|
| **Default** | Form fields visible with placeholder text. `[continue]` disabled (faded). |
| **Title entered** | `[continue]` enables (full opacity). |
| **Validation failure on [continue]** | Inline red marker below each offending field. Year-range error: `// year must be 1970–2030`. URL-format error: `// invalid URL`. |
| **No discard-confirm** | Cancel paths (Esc / × / backdrop) close immediately. Acceptable per skill — small form, low investment. |

### 11.4 P5 states

| State | Visual treatment |
|---|---|
| **Success** | Per §6 — summary + three text-link CTAs + `[done]` + auto-close bar. |
| **Hover/touch on modal during timer** | Auto-close bar pauses; timer resumes when interaction ends. |

---

## 12. Consolidated open decisions (Phase 10)

All surface decisions still to make. Each labeled with a lean if I have one.

### 12.1 Sub-decisions requiring Andrea's call

| Code | Decision | Lean |
|---|---|---|
| **OQ-S-1** | `[+ more details]` panel open/close state — always collapsed on fresh modal open, OR remember per-user-session state? | **Always collapsed.** Power users get one extra click; casual users get the lean default. Per-session memory is consumer-app polish for marginal benefit. |
| **OQ-S-2** | Bucket tab default when no IGDB suggestion (freeform-fallback game, or IGDB returns zero platforms) | **Digital.** Most common case for a game with no specific platform metadata; user can switch to Physical/Retro if needed. |
| **OQ-S-3** | Auto-close timer visual — progress bar at modal bottom, OR countdown text ("closing in 2s")? | **Progress bar.** Terminal-aesthetic alignment; less visually noisy than countdown text; respects reduced-motion via instant snap. |
| **OQ-S-4** | Freeform-platform badge display (when user typed e.g. "Steam Deck") — first 2–4 chars of name in `.plat` badge, OR a generic `[?]` / `[*]` icon, OR no badge (just the name)? | **First 2–4 chars uppercased** ("STEA" for "Steam Deck"). Terminal aesthetic absorbs unusual badges naturally. Generic icon would feel like a placeholder; no badge would break the row's visual rhythm. |
| **OQ-S-5** | Status chip strip on mobile — wrap to 2 rows when narrow, OR horizontal scroll? | **Wrap to 2 rows.** Horizontal scroll hides options off-screen; the strip needs all 6 visible for low cognitive load. |
| **OQ-S-6** | Skeleton rows during P1 searching state — show 3 placeholder rows, OR just a small `...` indicator? | **Skeleton rows.** Indicates "results are coming" structurally; the `...` alone could feel like "still typing." Reduces perceived latency. |
| **OQ-S-7** | The "you got it!" copy on wishlist-fulfilled-by-ownership-add — keep exclamation, OR more reserved phrasing? | **Keep exclamation.** N6's craft-instrument identity can be warm without twee. This is one of the few moments Hoard gets to actively notice the user's intent; let it land. |

### 12.2 Decisions deferred to implementation

| Code | Decision | When |
|---|---|---|
| **OQ-S-8** | Exact pixel measurements for the picker expanded-state max-height vs. P2 modal max-height — implementation question, not design question. | F1-PR1 implementation. |
| **OQ-S-9** | Mobile picker behavior when keyboard opens for type-to-filter — does the picker scroll above the keyboard, or does the keyboard overlay? | F1-PR1 implementation. |
| **OQ-S-10** | Exact animation durations + easing curves across all transitions (150ms is a placeholder; F1-PR1 tunes). | F1-PR1 implementation. |
| **OQ-S-11** | Whether the `// added · ... · Game Boy · backlog` copy line truncates on long titles (e.g. "The Legend of Zelda: Tears of the Kingdom"). Probably yes — title gets ellipsis at ~30 chars on desktop, ~20 chars on mobile. | F1-PR6 implementation. |

### 12.3 Cross-layer items (NOT surface-fixable)

None surfaced in this pass. All open decisions are surface-layer; the lower layers are stable.

---

---

## 13. Existing-surface audit (Part 1 — Phases 1–5)

Audit triggered 2026-05-22 after Andrea picked Option B post-Stitch. Scope: the deployed Hoard app + the existing `apps/web/src/components/screens/*.tsx` codebase, audited against the now-locked CM12 amendment and the broader ubiquitous language in CONCEPTUAL_MODEL §6.

The audit isn't a redesign — it produces a **punch-list of UI changes that need to ship in lockstep with F1's PR sequence** so the broader app doesn't drift out of sync with CM12 the moment F1 lands.

### 13.1 Phase 1 — Frame the existing surface

**Sources audited:**
- All `apps/web/src/components/screens/*.tsx` (~30 screen files)
- Sidebar, TopBar, MobileHeader, MobileTabBar in `apps/web/src/components/layout/`
- Backend wishlist-aware logic in `apps/api/src/routes/{dashboard,upcoming,games,stats}.ts`
- Existing design source-of-truth files in `project/Hoard.html` + `project/styles.css`

**Not audited in this session:**
- Settings sub-pages (no CM12-relevant surface)
- Admin page (separate known-gap workstream)
- Onboarding / welcome flow (no per-platform-wishlist relevance)

### 13.2 Phase 2 — Vocabulary violations (CM12-driven)

The most pressing audit category. Every CM12-relevant string in code.

#### 13.2.1 "OWNED ON" → "PLATFORMS" rename

Four locations identified, two desktop + two mobile:

| File | Line | Current | Required |
|---|---|---|---|
| [`GameDetailDesktop.tsx`](../apps/web/src/components/screens/GameDetailDesktop.tsx#L415) | 415 | `<div className="section-head">OWNED ON</div>` | `<div className="section-head">PLATFORMS</div>` |
| [`GameDetailDesktop.tsx`](../apps/web/src/components/screens/GameDetailDesktop.tsx#L249) | 249 | `<Marker>// owned on</Marker>` | `<Marker>// platforms</Marker>` |
| [`GameDetailMobile.tsx`](../apps/web/src/components/screens/GameDetailMobile.tsx#L240) | 240 | `OWNED ON ──────────────` (inline header) | `PLATFORMS ──────────────` |
| [`GameDetailMobile.tsx`](../apps/web/src/components/screens/GameDetailMobile.tsx#L348) | 348 | `<Marker>// owned on</Marker>` | `<Marker>// platforms</Marker>` |

**Plus** the corresponding comment blocks above each (`{/* owned on */}` at lines 247 + 346) should rename to `{/* platforms */}` for code-search hygiene.

**Surface fix only — no model change** (the model rename already landed in CM12). Bundle this into F1-PR2 (the PR that touches GameDetail for mediaType/condition/region).

### 13.3 Phase 3 — Object consistency

Checked across all auditable surfaces.

**Game / UserGame representation:** Consistent across screens. Cover (32×44 small, 80×112 standard, 120×170 large) + title (mono primary) + developer/year (mono dim secondary) is the convention. No shapeshifters.

**Status chip color mapping:** Consistent. The `tone` field in shelf definitions (`LibraryDesktop.tsx:45`, `LibraryMobile.tsx:51`) drives chip color uniformly. Status colors match §1.2 locks.

**`.plat` platform badge:** Consistent. 2-char code in a square frame across `GameDetail`, `LibraryShelf`, `Sidebar` platform list, agenda rails. Pattern is solid; CM12's "Other / freeform platform" badge (per OQ-S-4 resolution → first 2–4 chars uppercased) extends the pattern cleanly without breaking it.

**Wishlist representation:** **Partial drift identified.** Currently every wishlist-rendering surface assumes global `status='Wishlist'` (binary, all-or-nothing). Post-CM12, wishlist intent is a per-platform array; surfaces need to widen to include UserGames where `wishlistedPlatforms.length > 0`. See §13.5 for the punch-list.

No other object-consistency issues identified.

### 13.4 Phase 4 — Completeness against breadboard

F1's affordances (status-first chip strip, two-stage picker, [+ more details], P5 pattern b, etc.) are **net-new** — they don't exist in current code yet, so completeness gaps here aren't violations, they're the F1 implementation scope. Already enumerated in INTERACTION_FLOW.md §4.5 (the six F1-PR sequence).

**One real completeness gap that's not net-new:** existing `AddGameModal.tsx` is the surface that needs to be redesigned into F1's P1 + P2 + P3 + P5. Until F1-PR1 ships, this audit just notes the gap — the modal is currently 4 platform options (Nintendo / Epic / PC / Other) per `PLATFORM_OPTIONS` array at line 11, far short of CM12's scope.

### 13.5 Phase 3-continued — Per-platform wishlist ripple effects (CM12 cross-cuts)

This is the biggest single audit finding: **CM12 changes what "the wishlist shelf" means**, and several surfaces need to widen their predicate accordingly. Each is listed below with the file/line + the current logic + the required change.

#### S-A1: Sidebar Wishlist shelf count

[`apps/web/src/components/layout/Sidebar.tsx:27`](../apps/web/src/components/layout/Sidebar.tsx#L27)

```ts
{ label: 'Wishlist',  color: 'var(--amber)' },
```

The Sidebar receives shelf counts via `useShelfCounts()` which reads from `GET /api/dashboard` → `stats.wishlistCount`. Backend logic at [`dashboard.ts:192`](../apps/api/src/routes/dashboard.ts#L192):

```ts
wishlistCount: shelfCounts['Wishlist'],
```

`shelfCounts` is keyed by `UserGame.status` only. Games with global `status='Backlog'` (or any other) + `wishlistedPlatforms.length > 0` aren't counted. **Surface impact:** the GTA case wouldn't show in the Sidebar Wishlist count even though GTA *is* genuinely on the user's wishlist (for PC). Punch-list item — needs widening to `status='Wishlist' OR wishlistedPlatforms.length > 0` (with dedupe so a single game isn't double-counted).

#### S-A2: Dashboard Wishlist tile + count

[`DashboardDesktop.tsx:311`](../apps/web/src/components/screens/DashboardDesktop.tsx#L311) + matching mobile:

```ts
[String(stats.wishlistCount),   'WISHLIST',    `${wishlistCountdown.length} soon`,    'amber'],
```

Same `stats.wishlistCount` source. Same widening needed.

The `wishlistCountdown` separately reads from `WishlistRelease` (upcoming-release tracker, not the global wishlist). That's correct as-is — upcoming-release tracking remains independent of per-platform wishlist intent. **No change needed for wishlistCountdown logic.**

#### S-A3: Library Wishlist shelf — filter widening

[`LibraryDesktop.tsx:45`](../apps/web/src/components/screens/LibraryDesktop.tsx#L45) + [`LibraryMobile.tsx:51`](../apps/web/src/components/screens/LibraryMobile.tsx#L51):

```ts
{ name: 'Wishlist',    status: 'Wishlist',  tone: 'amber' },
```

Frontend currently fetches via `useShelves()` which probably filters by `status='Wishlist'` at the backend. Need to verify and widen.

**Surface impact:** the GTA case (Backlog globally + Wishlist on PC) wouldn't appear in the Library Wishlist shelf. User can't browse to it. This is the headline UX bug that CM12 silently creates if backends aren't updated in lockstep.

**Visual treatment when shown on the Wishlist shelf:** how do we distinguish entries that are *globally* wishlisted from entries that are *partially* wishlisted (owned globally + wished on a specific platform)?

Two credible options:
- **(a)** Render identically — the shelf is "everything I'm wishing for," surface the per-platform detail only on GameDetail. Simpler; might confuse the user when they see GTA on both Backlog AND Wishlist shelves with no on-shelf hint why.
- **(b)** Render with a small marker — e.g. a tiny amber dot or `★ on PC` text next to the title for partially-wishlisted entries. Honest about the mixed state.

**Lean: (b)** — N4 (scope invariant) is Andrea-only but applies here: a user scanning the Wishlist shelf shouldn't have to mentally reconcile "wait, I own this — why is it here?" The marker is a 5-pixel-wide affordance that prevents that thought.

Filed as **OQ-S-12** below.

#### S-A4: Backend dashboard.ts wishlistCount widening

[`dashboard.ts:192`](../apps/api/src/routes/dashboard.ts#L192) is the source for both S-A1 and S-A2. Backend punch-list item.

**Required change:** the shelfCounts aggregation needs to count distinctly the games where `status='Wishlist' OR wishlistedPlatforms.length > 0`. Naive `groupBy status` doesn't capture this.

Cleanest implementation: separate Prisma query `prisma.userGame.count({ where: { userId, OR: [{ status: 'Wishlist' }, { wishlistedPlatforms: { isEmpty: false } }] } })` and substitute its result for `shelfCounts['Wishlist']`.

#### S-A5: Releases-page wishlist toggle — populate `wishlistedPlatforms`

[`apps/api/src/routes/upcoming.ts`](../apps/api/src/routes/upcoming.ts) — the existing `POST /api/upcoming/:igdbId/wishlist` endpoint. Per CLAUDE.md decision #29 it atomically creates `UserGame(status='Wishlist')` + `WishlistRelease`. With CM12, it also needs to populate `wishlistedPlatforms`.

Per the cross-flow consequence in INTERACTION_FLOW.md §6.4 (recommendation): populate `wishlistedPlatforms` with ALL of the game's IGDB-reported platforms when the user stars from the Releases page (most users wishlisting from Releases want it on whatever platform they can get; per-row prune via GameDetail's PLATFORMS section).

Andrea hasn't explicitly locked this — flagging as **OQ-S-13** for confirmation.

#### S-A6: Releases page `[on wishlist]` / `[+ wishlist]` toggle — semantic clarity

[`HeroCountdown.tsx:131`](../apps/web/src/components/screens/releases/HeroCountdown.tsx#L131):

```ts
{isWishlisted ? 'on wishlist' : '+ wishlist'}
```

The toggle is binary at the IGDB-game level. Per CM12 the underlying state is now richer — a game can have `wishlistedPlatforms = ['ST', 'PS']` and the toggle reads `isWishlisted=true` because *any* per-platform wishlist counts. Same for star toggles on `ReleaseCard.tsx:48`, `AgendaRail.tsx:47`, `MobileReleaseRow.tsx:40`.

**Surface impact:** if a user has GTA wishlisted on PC but encounters the GTA release card on Releases page, the star shows "on wishlist". Tapping it un-wishlists across all platforms (per the global-toggle UX from CM12 + §2.6). That's the right behavior — but the toggle's surface gives no hint that *multiple* per-platform wishes are about to be cleared.

Two credible options:
- **(a)** Keep silent — global toggle clears all silently; collectors editing per-platform use GameDetail's `[× un-wishlist {platform}]` per-row affordance. Most users never need to know.
- **(b)** Surface a hover-tooltip / aria-description: `// wishlisted on: PC, Switch · tap to remove all` so power-users see the state before clearing.

**Lean: (a)** — Hoard is dense; tooltip noise on every wishlisted card is heavy. Collectors who care will use GameDetail. Filed as resolved-via-lean.

#### S-A7: SearchOverlay placeholder copy

[`SearchOverlay.tsx:101`](../apps/web/src/components/screens/SearchOverlay.tsx#L101):

```ts
placeholder="search your library + wishlist…"
```

The "+ wishlist" suffix is honest given the wishlist shelf is part of the library. Post-CM12 it remains accurate (the Wishlist shelf widens but still IS a library shelf). **No change needed.** Documented for completeness.

#### S-A8: Settings copy about wishlisted releases

[`SettingsDesktop.tsx:598`](../apps/web/src/components/screens/SettingsDesktop.tsx#L598) + mobile equivalent:

```ts
notifications: 'in-app + email alerts when wishlisted releases approach launch and when scheduled syncs fail. opt-in only.',
```

This describes a future Notifications feature (currently stub per Phase 8 PR 5). Copy is about WishlistRelease (release-tracker), not the per-platform wishlist concept. **No change needed.** Documented.

### 13.6 Phase 5 — Emotional register

Audited the affected surfaces against the N1-N12 emotional/social jobs.

| Surface | Emotional/social job | Current treatment | Verdict |
|---|---|---|---|
| GameDetail PLATFORMS section (post-rename) | N6 craft-instrument identity + N4 scope invariant | Dense receipt-row pattern; per-row state honest | ✓ aligned (per §2 surface design) |
| Wishlist shelf with mixed entries (global + per-platform) | N4 scope invariant; N10 wishlist-as-planning-tool | Currently filters by global status only — drift from N4 | Punch-list — see OQ-S-12 |
| `[on wishlist]` / `[+ wishlist]` toggles across surfaces | N10 wishlist-as-planning + emotional satisfaction of "I want this" | Binary, low-feedback | Acceptable — power-user nuance lives on GameDetail |
| Stitch-rendered "you got it!" moment | N3 credibility + N6 ownership feeling | Warm copy with green accent | ✓ aligned (per §6.2 design) |

No new emotional-register violations surfaced.

### 13.7 Consolidated audit punch-list

For F1-PR2 implementation (lockstep with the GameDetail surface changes):

- [ ] **Rename**: `OWNED ON` → `PLATFORMS` across [`GameDetailDesktop.tsx`](../apps/web/src/components/screens/GameDetailDesktop.tsx) (2 spots) + [`GameDetailMobile.tsx`](../apps/web/src/components/screens/GameDetailMobile.tsx) (2 spots) — see §13.2.1
- [ ] **GameDetail PLATFORMS section logic**: derive rows from union of `playtimeByPlatform` keys + `wishlistedPlatforms` entries; render owned rows with playtime, wishlisted rows with amber `wishlisted` marker + `[× un-wishlist]` per §2 surface design
- [ ] **Backend dashboard.ts:192 wishlistCount widening**: add a separate Prisma count query covering `status='Wishlist' OR wishlistedPlatforms.length > 0`; substitute its result for `shelfCounts['Wishlist']` — see S-A4
- [ ] **Library Wishlist shelf filter widening**: backend query for the Library Wishlist shelf must widen to include partial-wishlist entries — see S-A3
- [ ] **Partially-wishlisted shelf marker (OQ-S-12 locked)**: render Wishlist-shelf entries that are in via `wishlistedPlatforms.length > 0` (not via global status) with a small amber `★ on {platforms}` marker line under the title in `--text-2xs` mono — see S-A3
- [ ] **Releases-page wishlist toggle backend update (OQ-S-13 locked)**: in `POST /api/upcoming/:igdbId/wishlist`, populate `wishlistedPlatforms` with all IGDB-reported platforms (`release.platforms.map(toPlatCode)`) after the existing atomic UserGame + WishlistRelease creation — see S-A5
- [ ] **Sidebar Wishlist count visual**: no code change needed if dashboard.ts:192 widening lands — count source is consistent

Five surface-fix items + one backend widening + two open questions. None invalidates F1; all need to ship in the same release as F1-PR2 (the GameDetail surface PR).

### 13.8 Two new open questions

| Code | Question | Lean |
|---|---|---|
| ~~**OQ-S-12**~~ | ~~Visual treatment for partially-wishlisted entries on the Library Wishlist shelf~~ — **RESOLVED 2026-05-22 → small marker like `★ on PC`.** N4 scope invariant — a user scanning shouldn't have to mentally reconcile why an owned game appears on the wishlist. Implementation: when a game appears on the Wishlist shelf via `wishlistedPlatforms.length > 0` (not via global `status='Wishlist'`), render a small amber `★ on {platforms}` marker line beneath the title in `--text-2xs` mono. For games where BOTH conditions are true (e.g. global Wishlist + extra per-platform wishes), no marker — the global state covers the framing. |
| ~~**OQ-S-13**~~ | ~~Releases-page wishlist toggle backend update — what populates `wishlistedPlatforms`?~~ — **RESOLVED 2026-05-22 → all IGDB-reported platforms.** Most users wishlisting from Releases want the game on whatever platform they can get; per-row prune via GameDetail's PLATFORMS section covers collectors who want surgical control. (c) prompt-at-toggle was over-engineered for a one-tap action. (b) leave-empty would leave the new feature unused on its first encounter. Implementation: in `POST /api/upcoming/:igdbId/wishlist`, after the atomic UserGame + WishlistRelease creation, set `wishlistedPlatforms = release.platforms.map(toPlatCode)` using IGDB's platform list. |

### 13.9 What's working — don't lose

Things the audit confirmed are healthy and shouldn't be touched:
- The `.plat` badge pattern across surfaces (Sidebar, agenda rails, GameDetail, ReleaseCard) is consistent
- Status color mapping is uniform across the app via the `tone` field convention
- The shelf-counts derivation pattern (frontend reads from backend aggregate; no per-screen counting) is solid
- Stash-audit-derived "you got it!" warm-copy moment in F1-P5 sits well within Hoard's restrained N6 aesthetic — was a tonal risk but the design (green accent on a single word, no checkmark/emoji) keeps it disciplined

---

## Phase status

| Phase | Status |
|---|---|
| Phase 1 — Frame the surface (existing audit) | **Done 2026-05-22** (§13.1 — scope: screens + layout + backend wishlist logic + design source) |
| Phase 2 — Vocabulary and language audit | **Done 2026-05-22** (§13.2 — OWNED ON → PLATFORMS rename across 4 spots in GameDetail) |
| Phase 3 — Object consistency audit | **Done 2026-05-22** (§13.3 + §13.5 — per-platform wishlist ripple effects across 8 surfaces S-A1 through S-A8) |
| Phase 4 — Completeness check vs breadboard | **Done 2026-05-22** (§13.4 — F1's net-new affordances are scope, not completeness gaps; AddGameModal needs F1 redesign) |
| Phase 5 — Emotional register audit | **Done 2026-05-22** (§13.6 — N4 scope invariant flagged for wishlist shelf mixed entries) |
| Phase 6 — Feedback and errors (per F1 decision) | **Done 2026-05-22** — applied to PLATFORMS (§2.5), P1/P2/P3/P5 error+loading+empty states (§11) |
| Phase 7 — Hierarchy and emphasis (per F1 decision) | **Done 2026-05-22** — status-first P2 (§3), summary copy treatment (§6.2), pin indicator low-prominence (§7) |
| Phase 8 — Accessibility (per F1 decision) | **Done 2026-05-22** — aria-labels on per-row affordances (§2.5), 44pt tap targets, reduced-motion respected, color-never-only-signal, semantic HTML throughout |
| Phase 9 — Consistency (per F1 decision) | **Done 2026-05-22** — chip strips consistent across status / condition / region; bucket-tab pattern reuses mobile-tab-bar active-state convention; section-heading pattern uniform |
| Phase 10 — Open decisions | **Done 2026-05-22** — §12 consolidates 11 surface decisions (7 needing Andrea's call OQ-S-1 through OQ-S-7; 4 deferred to implementation OQ-S-8 through OQ-S-11) |
