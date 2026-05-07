# Hoard — Releases Page Rework

> **Workstream:** Releases page (formerly "Upcoming") visual + structural rework.
> **Status:** Scoped 2026-05-07. Implementation pending.
>
> **Source documents (read in this order if you're new to this workstream):**
> 1. `docs/Hoard_releases_handoff.md` — engineering handoff. The canonical spec for what's being built and why. Standalone; doesn't require other docs.
> 2. `docs/Upcoming/Hoard_design_feedback_rev03.md` through `rev07.md` — the design conversation that produced the handoff. Useful for context when a decision in the handoff needs explanation.
> 3. `project/Hoard_releases_mocks.html` — visual mocks. **It's a packed bundler artifact — open in a browser to render.** See §0 below for how to extract its source if you need to read the JSX directly.
>
> **This file** captures the locked decisions, mock-vs-handoff discrepancies, and the PR sequence. It does **not** repeat the spec.

---

## 0. Reading the mocks HTML

The 1.7 MB `Hoard_releases_mocks.html` is a self-rendering bundler artifact. Two ways to consume it:

**Visual (preferred for layout fidelity):** open the file in a browser. It renders all artboards as a scrollable design canvas.

**JSX source (preferred for exact spacing/layouts):** extract the bundle — the user JSX is in the bundler's `template` script tag, encoded as a stringified HTML blob. Quick recipe:

```bash
# Pull the template script tag into a file
awk '/<script type="__bundler\/template">/{f=1; next} f && /<\/script>/{f=0} f' \
  project/Hoard_releases_mocks.html > /tmp/template.json

# Decode the stringified HTML — the user JSX lives inside
node -e "
const fs = require('fs');
const tpl = fs.readFileSync('/tmp/template.json', 'utf8');
fs.writeFileSync('/tmp/rendered.html', JSON.parse(tpl));
"

# Now grep for any artboard / primitive
grep -n "function ReleaseCard\|function HeroCountdown\|function ReleasesWishlistBars" /tmp/rendered.html
```

The JSX uses Hoard's existing CSS variables, `Sidebar`, `TopBar`, `Cover`, `Plat`, `Marker`, `Btn`, `Icon`, `MobileFrame`, `MobileTabBar`, `MobileHeader` primitives. Spacing and layout values transfer directly.

---

## 1. Locked decisions (Andrea, 2026-05-07)

These were settled in the planning conversation after reviewing the handoff. Each addresses an open question I flagged.

### D1 — Rename scope: **URL + UI labels only. Internal code keeps "upcoming"**.

> Rename only the user-visible surface, **not** the internal API/types/code. Future agents must not auto-rename `useUpcoming`, `IgdbUpcomingRelease`, `WishlistRelease`, `/api/igdb/upcoming`, `/api/upcoming/:igdbId/wishlist`, etc.

| Layer | Action |
|---|---|
| URL path | `/upcoming` → `/releases`. `/upcoming/recent` doesn't exist; new `/releases/recent` route. Add a `<Navigate>` redirect from `/upcoming` → `/releases` to preserve old URLs / shared links. |
| Sidebar nav label, page titles, breadcrumbs | "upcoming" → "releases". |
| Mobile tab label (`SOON`) | Stays. The `SOON` label is already abstract — ties to the page concept, not its name. |
| Internal hooks (`useUpcoming`) | **Stays as `useUpcoming`.** Add `useReleases` only as a thin alias if absolutely needed; prefer not to. |
| Internal types (`IgdbUpcomingRelease`, `WishlistRelease`) | **Stay.** Renaming touches dozens of files for zero functional gain. The TypeScript type for an upcoming release stays `IgdbUpcomingRelease`. |
| Backend routes (`/api/igdb/upcoming`, `/api/upcoming/:igdbId/wishlist`) | **Stay.** Public-facing URL is `/releases` but the API is internal — no benefit to renaming. |
| Database tables (`WishlistRelease`) | **Stay.** Migrating a table for a UI rename is wrong. |

**Rationale:** "Upcoming" was a page name; "Releases" is also a page name. The data model (a future release date — `WishlistRelease` — and a list of upcoming items — `IgdbUpcomingRelease`) is unchanged. The page can be called whatever the user sees, but the underlying domain hasn't shifted.

**For future agents:** if you find yourself doing a search-and-replace of "upcoming" across the codebase, stop. The user-facing copy is the only place to change. Confirm this decision is still in force by checking this section before proceeding.

**Belt-and-suspenders enforcement** (added 2026-05-07):

- **Header comments** at the rename hotspots — `apps/web/src/hooks/useUpcoming.ts`, `packages/types/src/index.ts` (above `IgdbUpcomingRelease` and `WishlistRelease`), `packages/db/prisma/schema.prisma` (above `model WishlistRelease`), `apps/api/src/routes/upcoming.ts` — point to this section.
- **CI guard** at `scripts/check-rename-rule.ts`, run by `npm run check:rename-rule` and wired into `.github/workflows/ci.yml`. Greps the codebase for forbidden symbol shapes (`useReleases`, `IgdbReleasesRelease`, `model UpcomingRelease`, `/api/releases/{anything-other-than-recent}`, etc.) and fails the build with a pointer to this section.
- **Permitted exception:** docs and the check script itself can mention forbidden symbol names freely — they're documenting the rule, not violating it.

If a future workstream legitimately needs to rename one of these (e.g., a v2 API redesign), update both this section and the guard script. Don't bypass the guard silently.

---

### D2 — In-library check: option **B**.

A new endpoint `GET /api/releases/recent` returns `{ starred: WishlistRelease[], hyped: IgdbUpcomingRelease[] }` for the 14-day window with the library-membership join applied server-side. Client doesn't have to know how "in library" is computed.

The library-membership check is: a `UserGame` row exists where `userGame.game.igdbId === wishlistRelease.igdbId`. Standard Prisma query, scoped to `userId`.

This endpoint also serves the banner qualification logic — both surfaces consume the same data, no duplication.

---

### D3 — Hype ≥ 80 muted banner: separate IGDB query.

The muted banner (All mode only, fires when no starred drops but ≥1 release with hype ≥ 80 dropped in last 14d) needs a backward-looking IGDB query. Today `getUpcomingReleases` is forward-looking only.

Add a parameter to `getUpcomingReleases` (or a new sibling function) that accepts a date range. The new `/api/releases/recent` endpoint composes it server-side and returns the `hyped` list.

The hype ≥ 80 threshold is **a constant in banner logic**, not the user's `hypeThreshold` setting. (Spec §4.)

---

### D4 — Quarter rolling semantics: clean rules.

The 3 dated quarter buckets are `(currentQuarter, currentQuarter + 1, currentQuarter + 2)` — current + next 2. Computed from today's date.

| Bucket | At May 2026 | Includes |
|---|---|---|
| Q3 | Q3 2026 | releases where `(releaseYear, releaseQuarter) === (2026, 3)` |
| Q4 | Q4 2026 | releases where `(releaseYear, releaseQuarter) === (2026, 4)` |
| Q1 | Q1 2027 | releases where `(releaseYear, releaseQuarter) === (2027, 1)` |
| TBA | catch-all | everything outside the visible window — see below |

**TBA filter (concrete):**

```ts
include in TBA if:
  releaseDateCategory === 'TBA'
  OR (releaseDateCategory in ['Q1','Q2','Q3','Q4'] AND (year, quarter) > (2027, 1))   // beyond visible window
  OR (year-only date AND year > 2027)
```

**Past-release rule (everywhere on Releases except `/recent`):**

> Any release with a confirmed release date **before today** is invisible on the Releases page (excluding `/recent`, which is its own surface with its own 14-day window). Applies to month buckets and quarter buckets alike. April 2026 release in May 2026 → not in MAY's bucket and not in any quarter view.

**Rolling window:** as time passes, the visible quarters roll forward. October 2026 → visible quarters become Q4 2026, Q1 2027, Q2 2027. The TBA bucket re-computes accordingly.

**Within TBA:** sort by hype descending. No sub-grouping headers. The per-card date label communicates the underlying date — `TBA` for truly dateless, `Q2 2027` for far-future quarter, `2028` for year-only. Reader infers from card content.

---

### D5 — Hero countdown rule.

Hero shows when `wishlist.some(r => r.away >= 0)` — at least one **future** starred release exists.

Hero hides otherwise. The "1 starred, just dropped" case (`away < 0`) correctly falls into hero-hides because there's no future starred. The banner does the work for the recently-dropped case.

---

### D7 — `/api/releases/recent` response shape: unified type.

`{ starred: IgdbUpcomingRelease[], hyped: IgdbUpcomingRelease[] }`. Both lists share `IgdbUpcomingRelease` shape; `starred` carries `wishlisted: true`, `hyped` carries `wishlisted: false`.

Server maps the user's `WishlistRelease` rows into `IgdbUpcomingRelease` shape on the way out — discards `WishlistRelease.id` (DB pk, unused on this surface) and `userId` (implicit in the auth-scoped route). The existing `useUpcoming('wishlist')` hook from PR B already does this map client-side; this decision moves the mapping to the server so the response is consistent with `/api/igdb/upcoming`'s feed shape.

**Why not the asymmetric `WishlistRelease[] / IgdbUpcomingRelease[]` shape:** type-correct but pays a real cost — `ReleaseCard` would have to accept a union or normalise. The 3 fields that diverge (`id`, `userId`, `wishlisted`) are all either irrelevant to the RECENT surface or trivially derivable. Single render path wins.

### D6 — Hero countdown action buttons.

The mock's `HeroCountdown` shows `[on wishlist]`, `[trailer]`, `[remind me]` buttons. **Only `[on wishlist]` ships in v1.**

| Button | Decision | Reason |
|---|---|---|
| `[on wishlist]` | **Ship.** Wishlist toggle, wired to existing `POST /api/upcoming/:igdbId/wishlist`. | Already works in production. |
| `[trailer]` | **Skip.** | No backing data — IGDB exposes `videos[]` (IDs only) but we don't fetch them, and the mapping to YouTube embeds isn't built. v2. |
| `[remind me]` | **Skip.** | No notification infrastructure — Settings → Notifications is a `ComingSoonPanel` (PR A — A6). v2. |

The mock is fine for the visual spec; the buttons just don't all become real components. Comment them out or omit them entirely in the JSX — implementer's call.

---

## 2. Mock-vs-handoff discrepancies (mock has stale items)

The mock JSX was written across rev03 → rev07. Some elements that the **handoff explicitly removes** still appear in the mock source. Trust the handoff, not the mock.

| Mock has | Handoff says | What ships |
|---|---|---|
| `[i got it]` button on `ReleaseCard` when `variant === 'recent' && g.star` | "There is no `[i got it]` button" (§5) | No button. Library sync handles ownership. |
| `[mark all owned]` Btn on `ReleasesRecent` green prompt strip | "the earlier specs included `[i got it]` and `[mark all owned]` actions for moving wishlist items into the library manually. These are removed in the final spec" (§10) | No button. The strip is informational only. |
| Green prompt strip copy: "mark them as owned to move them out of your wishlist and into your library." | Banner copy (§9): "they'll move to your library automatically once your platforms sync." | Use the handoff copy. |
| `HeroCountdown` `[trailer]` and `[remind me]` Btns | Not addressed | See D6. Skip both. |

Implementation note for whoever writes the components: when the mock JSX disagrees with the handoff text, the handoff wins. The mock is a visual spec, not a behavior spec. Layout and styling: copy from the mock. Behavior, copy, and presence-or-absence of controls: use the handoff.

---

## 3. PR sequence

Sized to land cleanly in the existing test/lint/CI cadence. Each PR is independently shippable and revertable.

### R1 — Server: library-membership join + 14-day window endpoint

- **Endpoint:** new `GET /api/releases/recent`. Returns `{ starred: IgdbUpcomingRelease[], hyped: IgdbUpcomingRelease[] }` — both lists share the same shape (`IgdbUpcomingRelease`); `starred` items have `wishlisted: true`, `hyped` have `wishlisted: false`. Locked as decision **D7** below.
- **`starred`:** user's `WishlistRelease` rows where `releaseDate ∈ [today - 14d, today]` AND no `UserGame` exists for the same `igdbId` (library-membership check). Map to `IgdbUpcomingRelease` shape on the way out.
- **`hyped`:** IGDB upcoming feed with `first_release_date ∈ [today - 14d, today]` AND `hypes >= 80`. Excludes anything already in `starred` (dedupe by `igdbId`).
- **Helper:** extend `getUpcomingReleases` (or sibling) for backward-looking date ranges.
- **Cache:** identical TTL to the existing `/api/igdb/upcoming` (24h LRU).
- **Tests:** unit on the library-membership filter, integration on the dedupe, integration on the date window.

Estimated ~4–6 hours including tests.

### R2 — Desktop primitives

- `ReleaseCard` — single component, `variant: 'wishlist' | 'all' | 'recent'`. Three variants fork in 2–3 spots (HypeBars only on `'all'`; footer state by `away` sign per spec §5; `[i got it]` not rendered anywhere). Layout: `60px 76px 1fr` grid (per mock line 2454).
- `HeroCountdown` — hi-fi version of the existing HeroCountdown but parameterized for the new placement and the D6 action-button rule.
- `RecentBanner` — two variants (`green-prominent`, `muted`). Conditional rules per handoff §4. Mode-aware (muted only in All mode).
- `TimeNav` — bars + counts + zoom toggle (months/quarters). TBA bucket renders hatched diagonal, no bar.
- `AgendaRail` — flat chronological list (right-side, desktop only).
- Each gets a smoke render in Vitest.

Estimated ~8–10 hours.

### R3 — Desktop page

- New `ReleasesDesktop` component composing R2 primitives into the modes/zooms.
- URL state: `releases?mode=…&scope=…&zoom=…&bucket=…`. Defaults per handoff §13.
- Right-rail conditional rendering per handoff §6 truth table.
- Empty states per handoff §11.
- `[skip ahead →]` action navigates to next non-empty bucket.
- Page-level `<Navigate>` redirect from `/upcoming` → `/releases` (D1).
- Sidebar label rename "upcoming" → "releases".

Estimated ~6–8 hours. Replaces `UpcomingDesktop`.

### R4 — RECENT page

- New `/releases/recent` route. Lean — no time-axis chrome (handoff §10).
- Top bar with `hoard / releases / recent` breadcrumb.
- Page header with `[← back to releases]` link, `RECENT` title, `// last 14 days` caption.
- Green prompt strip — informational only, copy per D6 / handoff §9.
- Two sections: `// just out · starred` (panel-style cards) and `// also released · not on your wishlist` (cards with `hype >= 80`).
- Reads from `/api/releases/recent` (R1).

Estimated ~3–4 hours.

### R5 — Mobile shell

- `MobileViewHeader` with tappable view label + chevrons (handoff §3, §8).
- `MobileViewSheet` with all controls (mode, scope conditional on mode=all, zoom, bucket list, Done). Apply on every dismissal path (handoff §7).
- `MobileBanner` (compact variants, same conditional rules).
- `ReleasesMobile` page composing the above. Replaces `UpcomingMobile`.
- `ReleasesMobileRecent` for the RECENT route. Uses existing `MobileHeader` (just back arrow + title).
- Mobile state resets to defaults on tab-bar nav (handoff §3, §13). Within-session state persists.
- Card list rows: `40px 36px 1fr auto` grid (mock line 3259, handoff §12 punch-list item 2).

Estimated ~10–12 hours.

### R6 — Polish + tests

- Empty states across modes (handoff §11).
- Regenerate mobile snapshots after the layout changes.
- axe-core a11y check across every artboard.
- Confirm no retired artboards (`_*`) ended up in production code.
- Confirm no `[i got it]` / `[mark all owned]` buttons anywhere.
- Update `INTERACTION_DEBT_PLAN.md` Status section closing references; update `CLAUDE.md` Recent Fixes; update `AGENT.md` if any architectural calls land.

Estimated ~4 hours.

**Total:** roughly 35–45 hours. Could easily land across a week.

---

## 4. State summary (consolidated from handoff §13)

```
Releases page state (mobile + desktop):
  mode: 'wishlist' | 'all'                  // default: 'wishlist'
  scope: 'my-platforms' | 'all'             // default: 'my-platforms'; preserved across mode changes
  zoom: 'months' | 'quarters'               // default: 'months'
  bucket: string                            // default: current month label (e.g. 'MAY')

Mobile-only:
  sheetOpen: boolean                        // default: false

RECENT page state:
  (no local state; data is filtered server-side per D2)
```

Mobile resets all four to defaults on tab-bar nav. Desktop hydrates from URL params; missing params use defaults.

---

## 5. Open for v2 (parked, not in scope)

Verbatim from handoff §15:

- Filter chips on All Releases (category, platform sub-filter, sort options).
- Sparkline / year-shape visualizations (deferred to a future Stats surface).
- Manual ownership marking for non-synced platforms (Nintendo, Epic).
- Banner dismissal / "mark as read" gestures.
- Last-used state persistence across mobile sessions.
- More elaborate Quarter overviews (per-quarter heatmaps, hype distributions).

Plus from D6:

- Trailer button on `HeroCountdown` (needs IGDB `videos[]` capture + YouTube embed).
- "Remind me" button on `HeroCountdown` (needs notifications infrastructure — blocked on Settings → Notifications stub being built).

---

## 6. Status tracking

| ID | Status | PR | Date | Notes |
|---|---|---|---|---|
| R1 — Server endpoint | Done | — | 2026-05-07 | New `GET /api/releases/recent` returns `{ starred, hyped }` both shaped as `IgdbUpcomingRelease[]` per D7. New `getRecentlyReleased()` helper in `services/igdb.ts` wraps a backward-looking IGDB query (`first_release_date ∈ [today−14d, today]`, `hypes >= 80`, descending). New route at `apps/api/src/routes/releases.ts` applies the library-membership filter (drops wishlist rows whose `igdbId` matches a `UserGame` for the user) and dedupes `hyped` against `starred` by `igdbId`. Graceful degradation when IGDB throws — `starred` still served. New `RecentReleasesResponse` type in `@hoard/types`. New `api.releasesRecent()` client method. 7 new integration tests covering shape (D7), library filter, dedupe, 14-day window on both DB + IGDB queries, IGDB-throw graceful path, empty case. **136 API + 69 web tests pass; lint + rename-rule guard green.** |
| R2 — Desktop primitives | Pending | — | — | `ReleaseCard`, `HeroCountdown`, `RecentBanner`, `TimeNav`, `AgendaRail`. |
| R3 — Desktop page | Pending | — | — | Replaces `UpcomingDesktop`. URL redirect from `/upcoming`. |
| R4 — RECENT page | Pending | — | — | New `/releases/recent` route. |
| R5 — Mobile shell | Pending | — | — | `MobileViewHeader`, `MobileViewSheet`, `MobileBanner`. Replaces `UpcomingMobile`. |
| R6 — Polish + tests | Pending | — | — | a11y, snapshots, doc closeouts. |

---

## 7. Decisions log

> Mirrors will land in `AGENT.md` "Key Decisions" once the corresponding PRs ship. Captured here for the in-flight workstream.

**D1 — Rename scope.** URL and UI labels rename to "Releases"; internal code keeps "upcoming." Don't auto-rename hooks, types, routes, or tables. Documented above; future agents who find this section before touching the codebase save themselves a 10-file diff.

**D2 — In-library check.** Single new endpoint `/api/releases/recent` returning `{ starred, hyped }`. Library membership computed server-side via `UserGame.game.igdbId === WishlistRelease.igdbId`. No client-side join.

**D3 — Hype ≥ 80 muted banner threshold.** Constant in banner logic, not the user's `hypeThreshold` setting. The user's setting filters the IGDB feed for All mode; the banner threshold is independent.

**D4 — Quarter rolling.** 3 dated buckets are current + next 2. Past releases invisible everywhere except `/recent`. TBA catches everything outside the visible window (truly dateless + far-future quarters + far-future year-only).

**D5 — Hero hide rule.** Hero shows iff `wishlist.some(r => r.away >= 0)`. Recently-dropped starred → hero hides; banner does the work.

**D6 — Hero action buttons.** Ship `[on wishlist]` only in v1. `[trailer]` and `[remind me]` parked for v2 (no backing data / no infrastructure).

**D7 — `/api/releases/recent` response shape.** Unified `IgdbUpcomingRelease[]` for both `starred` and `hyped`. Server maps `WishlistRelease` → `IgdbUpcomingRelease` shape on the way out, dropping the unused `id` / `userId` fields. Single client render path; consistent with the existing wishlist-scope behaviour in PR B.

---

## 8. Cross-references

- Handoff: `docs/Hoard_releases_handoff.md`
- Design conversation: `docs/Upcoming/Hoard_design_feedback_rev03.md` … `rev07.md`
- Visual mocks: `project/Hoard_releases_mocks.html`
- Existing implementation being replaced: `apps/web/src/components/screens/UpcomingDesktop.tsx`, `apps/web/src/components/screens/UpcomingMobile.tsx`
- Existing hooks staying as-is per D1: `apps/web/src/hooks/useUpcoming.ts`, `apps/web/src/lib/api.ts` (`igdbUpcoming`, `upcoming`, `toggleWishlist`)
- Pre-existing Hoard primitives the rework consumes: `apps/web/src/components/primitives/{Cover,Plat,Marker,Btn,Icon,HypeBars}.tsx`, `apps/web/src/components/layout/{Sidebar,TopBar,MobileFrame,MobileTabBar,MobileHeader}.tsx`
