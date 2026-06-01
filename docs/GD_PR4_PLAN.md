# GD-PR4 — S4 (Completed) GameDetail surface + archivist relic

Implements the State-4 surface of the GameDetail v2 architecture per
PAGES_PLAN §3, using the visual identity locked in OQ-GD-13
(`scripts/relic-composition.ts`). S4 fires for `UserGame.status === 'Completed'`
and replaces the legacy `GameDetailDesktop` / `GameDetailMobile` rendering
with the archivist-relic card.

## 1. Surface scope

When a user opens `/game/:igdbId` for a game whose status is `Completed`,
the page renders the relic card as the dominant visual element:

- **Top label band** — REF / BASE MATERIAL (genre cluster) / SEALED (ISO
  completion date) / micro-barcode (decorative). Industrial inscription.
- **Dithered centerpiece** — shape-dither of the IGDB hero artwork.
  `--void` background, paper-coloured shapes.
- **Sigil row** — 3 small consecration marks inside the cartouche
  (genre / theme / perspective clusters), one sigil per IGDB dimension.
- **Title + byline lockup** — `TITLE` in display caps + `developer · year · platform`.
- **Inscribed receipt** — flex-fill dotted leaders for TOTAL PLAYTIME /
  SUB-STATUS / RATING / NOTE. Notes section absorbs vertical slack so
  cards align in a grid.
- **Bottom cartouche** — `═══ HOARD ARCHIVE ═══` / `· IN AETERNVM · MMXXVI ·`
  / sigil row. Permanent stamp.

S4 retains the existing GameDetail page chrome (top nav, lateral nav,
Collections placeholder, events strip) per GD-PR1 conventions. The relic
is the centerpiece; the surrounding scaffolding doesn't change between
states.

## 2. Locked decisions

### GD-PR4-D1 — Dither rendering: server-side, cached on `Game.relicDitherSvg`.
Compute the shape-dither once via `sharp` on the API at first request
(lazy generation) and cache on a new nullable `Game.relicDitherSvg String?`
column. Subsequent reads return the cached SVG directly. Invalidation
trigger: any sync touching `Game.heroImageUrl` clears `relicDitherSvg`.

**Why:** dither is ~50-100ms per render (120×68 cells × shape SVG per
cell ≈ 8000 elements). Per-game dither is identical across users —
caching at the Game level is the right scope. Storage cost ~10-30KB per
row × Andrea's ~2000 Games ≈ 60MB worst-case; acceptable.

**Trade-off rejected:** client-side render (every view pays 50-100ms; every
client ships ~150 lines of dither logic) and Redis cache (extra infra
dependency for a personal tool).

### GD-PR4-D2 — Sigil classifiers + SVG library: split across boundaries.
- **Classifiers** (genre/theme/perspective tag → cluster → sigil name)
  port to `apps/api/src/lib/relicSigils.ts`. API computes the 3 sigil
  assignments per game-detail request (cheap — rule lookups, no IO).
- **Sigil SVG paths** (24 entries) bundle on the frontend in
  `apps/web/src/components/screens/gameDetail/relicSigils.ts` as a
  `SIGIL_BY_NAME: Record<SigilName, string>` (SVG path string per name).
- API ships `{ dimension, value, sigilName }[]`; frontend renders by name.

**Why:** classifiers are server-of-truth (rule tweaks land in one place);
SVG paths are static design assets that don't change per request, so they
ship bundled rather than over the wire on every call.

### GD-PR4-D3 — Completion date: derive from `UserGame.lastPlayedAt`, no new column.
The cartouche year + the `SEALED` ISO date both read from
`UserGame.lastPlayedAt`. When `lastPlayedAt` is null (legacy / never-played
Completed entry), fall back to `UserGame.addedAt`. Year-zero fallback
(`MMXX` or just hide the year) is the final cushion.

**Why:** for Completed games, `lastPlayedAt` IS effectively "date the user
last touched it" which IS the consecration moment. Adding a dedicated
`UserGame.completedAt` column would require either (a) a backfill heuristic
that's no better than lastPlayedAt, or (b) prompting users to set the date
manually on every existing Completed entry. Defer until a real product
need surfaces (e.g. retroactive "I completed this in 2018, not yesterday"
correction).

### GD-PR4-D4 — Inline edit affordances kept (rating / sub-status / notes / completions).
The relic looks like a "permanent inscription" but the user can still
edit the receipt fields inline — same affordances as S3:
- Rating: click-grid 1-10 (same `RatingGrid` component from GD-PR3)
- Sub-status: chip picker (same `SubStatusPicker`)
- Notes: tap-to-edit textarea with blur-save
- Completions count: [- N +] (same `CompletionsCounter`)

Edits trigger PATCH `/api/games/:userGameId` which writes through to the
cache + the dispatcher refetches. The relic's visual identity is the
*default state*; editing doesn't break the inscription metaphor.

**Why:** Andrea's pattern across the GD-series is "always-editable" —
status flip + sub-status + rating + notes all live as inline affordances
on S3, and dropping that on S4 would create a discoverability cliff.

### GD-PR4-D5 — PR sequence: split into GD-PR4a (data foundation) + GD-PR4b (UI + animation).
- **GD-PR4a** — schema + render service + classifier + GameDetail
  response extension + backfill script + tests. No frontend changes.
- **GD-PR4b** — S4 components (Desktop + Mobile) + dispatcher routing +
  **multi-stage consecration animation per D7** + frontend tests + E2E
  smoke. Consumes the data shipped in 4a.

**Why:** smaller, reviewable PRs. 4a can ship safely (no user-visible
change since dispatcher doesn't route to S4 yet); 4b enables the surface
WITH the animation as a first-class deliverable (not deferred). The
animation IS the moment per Andrea's pushback 2026-06-01 — *"i would
love a beautiful and state of the art animation for the first reveal.
the user need to be delighted and amazed by it."*

### GD-PR4-D6 — No schema changes beyond `Game.relicDitherSvg`.
The relic reads from existing fields:
- Cartouche year ← `UserGame.lastPlayedAt`
- Sigils ← `Game.genres / Game.themes / Game.playerPerspectives` (already
  exist via B-IGDB-3)
- Centerpiece ← `Game.heroImageUrl` (already exists, just rescored by
  B-Art-1)
- Receipt ← `UserGame.subStatus` / `rating` / `notes` / `completionsCount`
  (GD-PR3) + `UserGame.playtimeByPlatform` aggregation
- Title/byline ← `Game.title / developer / firstReleaseDate` + primary
  `playtimeByPlatform` key

The only new column is `Game.relicDitherSvg` for the cached centerpiece.

### GD-PR4-D7 — First-reveal animation: 5-stage consecration choreography (locked).
Promoted from OQ-GD4-5 default-no-animation after Andrea pushback. The
relic's first appearance on land at `/game/:igdbId` for a Completed game
runs a **multi-stage choreographed sequence** (~2.4 seconds total):

| t (ms) | Stage | What happens |
|---|---|---|
| 0–300 | **Card materialises** | Empty relic frame fades in from `opacity: 0` + slight `translateY(8px)` rise. Border hairlines draw via `stroke-dashoffset` from full → 0. |
| 300–600 | **Label band imprints** | Top band (REF / BASE MATERIAL / SEALED / barcode) fades in cell-by-cell left→right with 70ms stagger. Barcode bars draw in via `width` 0→full from left. |
| 600–1500 | **Dither engraves** | The ~8000 shape cells reveal in a **radial wave from centre outward**. Per-cell `animation-delay` calculated by Euclidean distance from artwork centroid; each cell animates `opacity: 0 → 1` + tiny `transform: scale(0.6) → scale(1)` over 280ms. Reads as an inscription propagating outward from the heart of the image. |
| 1500–1900 | **Title lockup writes** | TITLE caps render with a left-to-right `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)` mask over 250ms. Byline fades in 100ms after with `opacity` only. |
| 1900–2400 | **Receipt + cartouche seal** | Receipt rows draw in their dotted leaders left→right (same clip-path technique) with 80ms row stagger. Cartouche bottom band fades in, then the three sigils stamp in last with `scale(1.4) → scale(1)` + `opacity` over 200ms each — staggered 120ms apart so the user reads each consecration mark settle individually. |

**Performance budget:**
- ~8000 SVG cells with CSS-keyframe `opacity` + `transform` animations are
  composited on the GPU (no layout/paint per frame). Tested in browsers
  this scale handles cleanly at 60fps.
- Per-cell `animation-delay` calculated server-side during dither render
  (embedded as inline `style="animation-delay: Xms"`) so the frontend
  doesn't compute 8000 wave-distances at paint time.
- Stages 2–5 use single-element animations (no per-character splits).

**`prefers-reduced-motion` carve-out:** the entire sequence collapses to
a 200ms cross-fade — final state appears instantly without the radial
wave, clip-path writes, or stamp-ins. Mandatory for accessibility +
respects user OS settings.

**First-visit only:** the animation plays once per `(user, game)` pair.
Subsequent visits to the same relic skip the choreography and render in
final state instantly. Tracking via `localStorage`:
`hoard:relic-consecrated:${userGameId}` boolean. Editing the receipt
fields (rating / sub-status / notes) does NOT re-trigger.

**Why a wave from centre, not edge:** the dither's centre is typically
where the image's most identifiable detail lives (faces, key art focal
point). Revealing from there outward gives the viewer recognition first,
then context. An edge-in wave would tease the abstract before the
familiar.

**Why stamp-in for sigils, not fade:** the sigils are *consecration
marks* — they should land on the surface, not fade through it. The
1.4x-to-1.0x scale + opacity combo reads as the act of stamping,
matching the techno-priest framing.

## 3. Open questions (to lock before code starts)

### OQ-GD4-1 — Mobile S4: same card, just narrower? Or simplified layout?
Prototype is 320-360px wide at desktop; mobile screens are 375-430px.
Card fits full-width on mobile with no layout simplification needed.
**Default v1: identical card, full-width, no simplification.** Confirm
with Andrea before GD-PR4b ships.

### OQ-GD4-2 — Sigil row inside the cartouche on mobile: same size or smaller?
Currently 20×20px each. On a 375px viewport with 12px page padding +
14px card padding, the cartouche width is ~325px. Three sigils + 14px
gaps fit easily. **Default v1: identical sigil row at 20×20.**

### OQ-GD4-3 — Inline edit affordances visual: same as S3 (chips + buttons),
or restyled to fit the "inscribed" aesthetic (e.g. carved-marble buttons,
amber accents only on edit)? Default v1: reuse S3 components as-is; let
the relic's surrounding inscription do the aesthetic work. Restyle is a
GD-PR4c polish pass if Andrea wants it.

### OQ-GD4-4 — Lateral-nav / Collections / events placeholders: position relative
to the relic? Above the card (like GD-PR1)? Below? Side-rail on desktop?
Default v1: same position as GD-PR1 / 2 / 3 — top of the surface, above
the centerpiece card. The relic is the focal hero.

### ~~OQ-GD4-5 — Animation on first reveal.~~ **Resolved by D7 (5-stage consecration choreography).** Locked 2026-06-01 per Andrea pushback.

## 4. PR breakdown

### GD-PR4a — Data foundation

**Schema:**
- New migration `2026XXXXXXXXXX_game_relic_dither_svg`: `Game.relicDitherSvg String?`
- Apply via documented `prisma db execute` + Node `$executeRaw` recipe.

**Backend:**
- New `apps/api/src/services/relicDither.ts` — port the shape-dither
  algorithm from `scripts/relic-composition.ts`. Function:
  `renderRelicDither(heroImageUrl: string): Promise<string>` returning
  the SVG string. Throws on fetch failure (caller catches + falls back).
  **Per D7:** each cell `<g>` emits an inline `style="animation-delay: Xms"`
  computed by Euclidean distance from artwork centroid + a base wave
  speed constant. Frontend's keyframe rules then need only one shared
  animation declaration; the stagger is data-driven from the SVG itself.
- New `apps/api/src/lib/relicSigils.ts` — port classifiers (`GENRE_RULES`,
  `THEME_RULES`, `PERSPECTIVE_SIGIL`, fallbacks). Function:
  `assignSigils(genres, themes, perspectives): SigilAssignment[]`
  returning `{ dimension, value, sigilName }[]` always 3 entries.
- Extend `getGameDetailExtras(igdbId, userId)` in route layer to include:
  - `relicDitherSvg: string | null` — fetched from `Game.relicDitherSvg`;
    if null and the Game has a heroImageUrl, kicks off lazy generation
    (best-effort, fire-and-forget — first request gets null, subsequent
    get the cached value).
  - `sigils: SigilAssignment[]` — computed inline via assignSigils on the
    Game's IGDB tags.

**Backfill:**
- New `scripts/backfill-relic-dither.ts` — scope same as
  `backfill-game-hero-image.ts` (Library-overview union). For each Game
  with non-null heroImageUrl and null relicDitherSvg, render + persist.
  Throttled (sharp + IGDB image fetch, ~200-500ms per render).

**Tests:**
- `relicSigils.test.ts` — every classifier rule + fallback path.
- `relicDither.test.ts` — smoke test against a fixture image; assert SVG
  shape (`<svg>` tag, has `<g>` children, byte length within range).
- Extend GameDetail route tests to assert the new fields are present in
  the response and that lazy generation triggers correctly.

**Cache invalidation:**
- Any code path that writes `Game.heroImageUrl` (syncRunner, manual add,
  rescore script) also clears `relicDitherSvg` to null. Re-renders on
  next read.

### GD-PR4b — UI integration + first-reveal animation (D7)

**Frontend:**
- New `apps/web/src/components/screens/gameDetail/relicSigils.ts` —
  `SIGIL_BY_NAME: Record<string, string>` bundled SVG path strings (24
  entries copied from prototype).
- New `apps/web/src/components/screens/gameDetail/RelicCard.tsx` —
  the shared card structure (top band + dithered centerpiece + title
  lockup + receipt + bottom cartouche). Renders `relicDitherSvg` via
  `dangerouslySetInnerHTML`. Reuses S3 inline editors (`RatingGrid`,
  `SubStatusPicker`, `CompletionsCounter`, notes editor) for the
  editable receipt fields.
- New `apps/web/src/components/screens/gameDetail/S4Desktop.tsx` /
  `S4Mobile.tsx` — thin wrappers around `RelicCard` plus the surrounding
  GameDetail chrome (lateral-nav, Collections placeholder, events strip).
- New `apps/web/src/components/screens/gameDetail/RelicAnimation.tsx` —
  animation orchestrator. Reads `hoard:relic-consecrated:${userGameId}`
  from localStorage; if absent, applies the 5-stage CSS keyframe
  sequence (D7) by toggling stage classes on a parent element with
  `requestAnimationFrame` for stage progression. Sets the localStorage
  flag at sequence end. `prefers-reduced-motion: reduce` → instant
  cross-fade.
- Per-cell `animation-delay` for the radial-wave dither stage embedded
  server-side in the SVG `<g>` group via inline `style=` attributes (so
  the frontend doesn't compute 8000 wave-distance values at paint time).
  Backend renderer in GD-PR4a writes these.
- Animation CSS lives in a new `apps/web/src/styles/relic-animation.css`
  with keyframes for each of the 5 stages.
- Type extension in `packages/types/src/index.ts`:
  `GameDetailExtras.relicDitherSvg: string | null` +
  `GameDetailExtras.sigils: SigilAssignment[]` (new shared type).
- Dispatcher (apps/web/src/components/screens/GameDetail.tsx or wherever
  the v2 dispatcher lives) gains `state === 'S4'` branch routing to
  S4Desktop/S4Mobile.
- Cache version bump (v4 → v5) for `STORAGE_PREFIX` in `lib/cache.ts`
  per the persisted-cache shape-change rule (operational gotcha).

**Tests:**
- `S4Desktop.test.tsx` / `S4Mobile.test.tsx` — relic renders all 5 layers
  on a fixture Completed UserGame; inline editors fire PATCH with the
  right payload; null `relicDitherSvg` falls back gracefully (loading
  state or skeleton).
- Dispatcher test: a Completed UserGame routes to S4, status flip to
  Playing routes to S3.
- E2E smoke: navigate to a Completed game on the test seed, assert the
  relic structure renders.

### GD-PR4c (deferred polish)

- Restyle inline editors to fit the inscription aesthetic if Andrea
  flags them as visually jarring on first eyeball.
- Print/share view if requested.
- Mobile-specific layout tweaks if OQ-GD4-1's "identical card" default
  feels cramped.
- Animation refinements if Andrea wants to tune the timing curves /
  easing / per-stage durations after seeing GD-PR4b's first render.

## 5. Phase status

| PR | Status | Notes |
|---|---|---|
| GD-PR4a | Done 2026-06-01 (`1727b84`) | Backend foundation — schema (Game.relicDitherSvg), render service (relicDither.ts with per-cell radial-wave animation-delay), classifier (relicSigils.ts), GameDetail response extension (relicDitherSvg + sigils), self-healing invalidation via embedded source-URL comment, backfill script. 25 new unit tests. 87/87 Completed games backfilled at ~775KB avg per SVG. |
| GD-PR4b | Done 2026-06-01 (`9971b05` + polish `d01c490`) | Frontend S4 surface + 5-stage consecration animation. **Architectural reversal mid-PR per Andrea's eyeball:** the relic shipped as a button-triggered read-only OVERLAY (not the default Completed surface). Click `[★ see relic]` on the legacy GameDetail or flip status to Completed → auto-open once. Editing stays on the legacy view. RelicCard gained a `readonly` prop; new RelicOverlay full-screen component with focus trap + Esc + scrim close. Cache version bumped v4→v5 for the new fields. 20 frontend tests. |
| GD-PR4c | Deferred | Polish — inline editor restyle (none needed since editors moved off the relic), print/share view, animation timing tuning, mobile layout tweaks. Only if cohort signal demands. |

## 6. Sticky properties (for future contributors)

- **`scripts/relic-composition.ts` is the design source of truth for the
  centerpiece + sigils.** Any production-side change to the dither
  algorithm or sigil vocabulary should be mirrored back into the
  prototype script so it stays a faithful preview.
- **`relicDitherSvg` is implicit-invalidation-only.** Anything that
  writes `heroImageUrl` MUST also clear `relicDitherSvg`. If a future
  workstream adds a new heroImageUrl writer, audit for the clear.
- **Sigil classifier rules are versioned by code, not data.** Tweaking
  a cluster's tag list (e.g. moving "Music" from MUSIC to CIRCUIT) is
  a code change with no migration — but every relic re-renders its
  sigils on next read. No cache to bust at the sigil level.
- **24-sigil vocabulary is locked.** Adding a 25th sigil requires
  updating both the API classifier (`SIGIL_BY_NAME` map) and the
  frontend bundle in lockstep. Don't ship the API change without the
  frontend or vice versa — the frontend will render a missing-sigil
  blank.
