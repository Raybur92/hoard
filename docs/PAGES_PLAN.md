# Pages — Functional Analysis

Forward-looking analysis of what each page should contain, anchored against the competitor benchmark set (Stash, IMDB, IGDB, HLTB) and the existing user-research corpus.

**Distinction from sibling docs:**
- `docs/USER_RESEARCH.md` is the *observational audit* — what we've seen users / competitors do. It looks backward.
- `docs/CONCEPTUAL_MODEL.md` defines *what entities exist* and how they relate.
- This doc is *forward-looking* — for each page, what user job does it serve, what's on it today, what's missing, what should be there. It's the bridge between the audit corpus and the per-workstream `*_PLAN.md` docs that follow.

Per-page sections share the same shape:
1. **Purpose** — the user job(s) this page serves.
2. **Current state** — what's there today, briefly.
3. **Gaps vs benchmark** — observations from the benchmark catalog (§2) that highlight missing capability. Each gap is traceable to its source.
4. **Target state** — the goal shape, with element-level detail.
5. **Open questions** — `OQ-<page>-N` tagged for traceability across future workstreams.

---

## 1. Page surface inventory

The pages Hoard ships and their current status. Pages that recently passed an audit are skipped from this round.

| Page | Route(s) | Status | In scope this round? |
|---|---|---|---|
| Dashboard | `/` | Existing; gaps TBD | Yes |
| Library | `/library`, `/library/:status` | Existing; gaps TBD | Yes |
| Releases | `/releases`, `/releases/recent` | Existing; gaps TBD (regional dates partly overlap with GameDetail) | Yes |
| **Events** | `/events` (new) | **Spec from scratch** — top-level peer of Library / Releases per Andrea 2026-05-29 | Yes |
| GameDetail | `/game/:id` today; route shape changes in v2 (see OQ-GD-1) | State-monolithic; **biggest gap** | **Yes — drill first** |
| Settings | `/settings`, `/settings/:section`, `/settings/platforms/:code` | Recently audited (S1–S4 + L1–L4, 2026-05-08) | Skip |
| Admin | `/admin/*` (5 sub-routes) | Just shipped (A-series A2, 2026-05-29) | Skip |
| Login / Welcome | `/login`, `/welcome` | Closed-beta gate (I-series, 2026-05-10) | Skip |

---

## 2. Benchmark catalog

The competitor and reference observations that feed the gap analyses below. Each entry is a *capability* observed in the source product, with a stable ID we can reference from per-page Gaps sections. Source observations are documented in full in `docs/USER_RESEARCH.md` O14 (Stash) and this commit's preceding conversation (IMDB / IGDB Events / HLTB).

### B-Stash (full audit in USER_RESEARCH.md O14)

Already-shipped or already-rejected items omitted — those are locked. The remaining capability set:

- **B-Stash-1** Lateral-nav rails on GameDetail: *all games in this saga* / *all release variants* / *all games by this developer* / *all games by this publisher* — turns the personal library into a discovery instrument.
- **B-Stash-2** Status-contextual sub-statuses on GameDetail (Completed → main / +side / 100%; Playing → infinite / paused; Archive → abandoned / didn't play).
- **B-Stash-3** Rating-as-data: `UserGame.rating: Int?` (1–10) + GameDetail score-input UI + score-aware shelves / filters.
- **B-Stash-4** Personal Collections (`UserCollection` entity + join table + management UI) — orthogonal to status. "Cyberpunk vault" / "Pokemon completionist run" / "Dad's PS2 favorites".
- **B-Stash-5** Series / Developer / Publisher as reference-data entities (`Franchise`, `Developer`, `Publisher` with Game FK relationships). Pre-req for B-Stash-1.
- **B-Stash-6** Screenshots / `UserGameMedia` entity — user-uploaded media tied to UserGame as memory / journaling.
- **B-Stash-7** Times-beaten counter (already has architectural slot in F1's `[+ more details]` panel; schema decision still open — column vs Session log).
- **B-Stash-8** Play date range / Session lifecycle — when did the user actually play this. Adjacent to CM2-deferred Session entity.
- **B-Stash-9** Owned-as-toggle (orthogonal to status) — partially resolved via CM12 per-platform wishlist; harder cases ("completed on a borrowed copy", "bought but haven't started") still open.
- **B-Stash-10** Post-add edit affordances on GameDetail — sub-statuses / rating / times-beaten / manual playtime / mediaType / condition / region all editable after the game is in the library, not just at add-time. Per-row gating: editable only for non-synced platform codes (`{ST, PS, XB, GG}` are sync-as-source-of-truth and skip the editor per Andrea 2026-05-23).

### B-IMDB

- **B-IMDB-1** Giant countdown on upcoming-release pages — the dominant visual element when the game isn't out yet.
- **B-IMDB-2** Release dates per region + per platform — expandable section showing the full release matrix (EU PS5 / NA PS5 / JP Switch / etc.) rather than a single date.
- **B-IMDB-3** Video carousel (trailers, gameplay footage, dev diaries) embedded inline on the detail page.
- **B-IMDB-4** Screenshot / picture gallery embedded inline on the detail page.

### B-IGDB

- **B-IGDB-1** Events as a discoverable surface — State of Play / Summer Game Fest / Nintendo Direct / The Game Awards / etc. with cover art, descriptions, dates, and a grid of all games announced or shown at each event. *"I missed State of Play last Tuesday — what was announced?"*
- **B-IGDB-2** Cross-link from GameDetail back to events: *this game was shown at X* → opens the event page. Requires B-IGDB-1 first.

### B-HLTB

- **B-HLTB-1** Reviews filtered per platform (PS5 review experience ≠ PC review experience for the same game). Hoard will define its own review primitive; this is *inspiration* for the per-platform dimension, not a copy-the-UI mandate. *Deferred — slot only.*
- **B-HLTB-2** Per-style time-to-beat grid (main / extras / completionist) — Hoard already has this via the HLTB scraper.
- **B-HLTB-3** User-time-vs-community comparison: "your 47h vs community-main 38h vs community-100% 75h" framing on completed games.

---

## 3. GameDetail v2 (biggest gap — drilling first)

### 3.1 Purpose

GameDetail is the *act-on-a-specific-game* surface. It serves at least four distinct user jobs depending on the game's state relative to the user:

| User job | Game state |
|---|---|
| "Should I add this to my library?" | Not in collection, already released |
| "When does this come out and where can I get it?" | Not in collection, upcoming |
| "Update my status / log my session / add a note" | In collection, in-progress |
| "Capture how this run went and decide what's next" | In collection, completed |

The current page assumes only the third job exists. The other three either have no page at all (States 1+2) or get treated as the same page as job #3 (State 4).

### 3.2 Current state

`/game/:userGameId` — single route, requires a UserGame row to exist. Renders:

- Header: cover, title, year, platform list (read from `UserGame.playtimeByPlatform` keys + `wishlistedPlatforms`)
- PROGRESS receipt block: per-platform playtime, total playtime, HLTB grid (main / extras / 100%), achievements/trophies row (post-M0 per-platform rendering)
- Status picker + notes editor (inline edit)
- Action buttons: `[resume]` (sets Playing) · `[+ note]` (focus notes) · `[share]` (Web Share API)
- Share receipt section (ascii-art summary for screenshot/share)
- `[wrong game?]` chip → RemapGameModal
- `[× un-wishlist]` per-platform when row is in `wishlistedPlatforms`
- `[back]` chip → `navigate(-1)`

**Hard architectural blocker for States 1+2:** the route takes a UserGame ID, which doesn't exist for games the user doesn't own. Today the only way to "view" a game without owning it is via the Releases-page card (inline preview), which is structurally different from a detail page.

### 3.3 Gaps vs benchmark

| Gap | Sources | Notes |
|---|---|---|
| No detail page exists for games not owned | (architectural) | States 1+2 entirely absent |
| No giant countdown for upcoming-not-owned | B-IMDB-1 | Today HeroCountdown lives only on Releases page as a widget |
| Single release-date display, no per-region / per-platform breakdown | B-IMDB-2 | IGDB has `release_dates` with region + platform keys; we only store one date |
| No videos | B-IMDB-3, B-Stash | IGDB `videos` field unfetched; CSP needs YouTube exception |
| No screenshot / artwork gallery | B-IMDB-4, B-Stash | IGDB `screenshots` + `artworks` fields unfetched |
| No lateral-nav rails (saga / developer / publisher / variants) | B-Stash-1 | Requires reference-data entities first (B-Stash-5) |
| No event back-links ("shown at State of Play 2026") | B-IGDB-2 | Requires Events surface first (B-IGDB-1) |
| No sub-statuses | B-Stash-2 | Both contextual variants — Playing → infinite/paused; Completed → main/+side/100% |
| No score / rating | B-Stash-3 | Slot exists as `[+ rate / note]` deep-link from F1-PR6 P5, but the page itself has no score UI yet |
| No times-beaten counter | B-Stash-7 | Schema decision still open |
| No play-date-range capture | B-Stash-8 | Adjacent to deferred Session entity |
| No edit affordances for manual playtime / mediaType / condition / region | B-Stash-10 | Per-row, non-synced platforms only |
| No personal-collections membership display | B-Stash-4 | Requires `UserCollection` entity first |
| No user-vs-community HLTB comparison | B-HLTB-3 | Data already on hand (UserGame total + HltbData community); pure UI work |
| No "mark uncompleted" path on Completed games | (UX) | Once a game flips to Completed, the user can still status-pick away from it, but the *natural* affordance for "actually, I'm replaying this" is missing |

### 3.4 Target state — 4-state rendering matrix

The page renders the same identity surface (cover / title / genres / videos / screenshots / description / lateral nav) in all 4 states, but the *dominant* element changes per state:

| Element | S1 (released, not owned) | S2 (upcoming, not owned) | S3 (owned, in-progress) | S4 (owned, completed) |
|---|---|---|---|---|
| Cover + title + year | ✓ | ✓ | ✓ | ✓ |
| Genres / themes / tags | ✓ | ✓ | ✓ | ✓ |
| Description / plot | ✓ | ✓ | ✓ | ✓ |
| Video carousel | ✓ | ★ | ✓ | ✓ |
| Screenshot gallery | ✓ | ★ | ✓ | ✓ |
| **Giant countdown** | — | **★ dominant** | — | — |
| Release date (single line) | ✓ | — | — | — |
| Release dates per region + platform (expandable) | ✓ | ✓ | — | — |
| `[+ add to library]` CTA | **★ dominant** | — | — | — |
| `[+ wishlist]` CTA | — | **★ dominant** | — | — |
| Wishlist hype score (B-IGDB-1 derived) | — | ✓ | — | — |
| PROGRESS receipt block (per-platform playtime + HLTB grid + achievements) | — | — | ✓ | ✓ |
| Status picker | — | — | **★ dominant** | ✓ (with `[mark uncompleted / replay]`) |
| Sub-status (Playing → infinite / paused) | — | — | ★ | — |
| Sub-status (Completed → main / +side / 100%) | — | — | — | **★ dominant** |
| Times-beaten counter | — | — | ✓ | ★ |
| Score / rating UI | — | — | ✓ | **★ dominant** |
| Notes editor | — | — | ✓ | ✓ |
| HLTB community grid | ✓ | ✓ | ✓ | ✓ |
| HLTB user-vs-community comparison | — | — | ✓ | ★ |
| Play date range | — | — | ✓ | ★ |
| Trophies / achievements | — | — | ✓ | ✓ |
| Per-platform manual-playtime edit (non-synced rows only) | — | — | ✓ | ✓ |
| Share receipt | — | — | ✓ | ★ |
| Lateral nav: developer / publisher / series | ✓ | ✓ | ✓ | ✓ |
| Personal-Collections membership | — | — | ✓ | ✓ |
| "Shown at events" links | ✓ | ✓ | ✓ | ✓ |
| `[wrong game?]` remap | — | — | ✓ | ✓ |
| `[× un-wishlist]` per-platform | — | — | ✓ (when Wishlist) | — |

Legend: ✓ = present · ★ = emphasised / visually dominant · — = absent.

### 3.5 Open questions

- **OQ-GD-1 — Route shape.** `/game/:igdbId` everywhere (IGDB ID as the addressable key, UserGame lookup happens server-side based on the auth context) vs. dual routes `/game/:userGameId` + `/game/by-igdb/:igdbId`? The single-route variant is cleaner from a UX standpoint (one URL shape, share-links work for any user); the dual variant preserves the existing cuid-based deep-links from search and lists. Recommendation: migrate to `/game/:igdbId` with a transition window where the cuid form 301s to the IGDB form.
- **OQ-GD-2 — Sub-status data model.** New column `UserGame.subStatus: SubStatus?` (enum union of all variants across states), or a `subStatus` JSON column with status-gated keys, or a related-row table (`UserGameSubStatus`) for extensibility? Recommendation: enum column with a runtime guard that only allows values matching the current `status`.
- **OQ-GD-3 — Times-beaten schema.** `UserGame.completionsCount: Int?` column (simple, decided here) vs. derived from a future Session log (richer, but Session is CM2-deferred)? Recommendation: ship the column now; refactor when Session lands. The column is cheap and the integer count survives a future migration to derived data.
- **OQ-GD-4 — Rating shape.** `UserGame.rating: Int?` (1–10) — single dimension matches Stash. Question is the input UI: stepper, slider, click-to-fill star row, or numeric input? Recommendation: 1–10 click-to-fill grid (10 boxes) with hover-preview; matches the terminal aesthetic better than stars or slider.
- **OQ-GD-5 — HLTB user-vs-community comparison UI.** Where does "your 47h vs main 38h" actually render? Inside the existing PROGRESS receipt block as an extra row, or as a separate `// pace` block? Recommendation: extra row inside PROGRESS — "pace: your 47h vs main 38h (+24%)". Single line, scannable.
- **OQ-GD-6 — Cross-state transition behaviour.** When a user clicks `[+ add to library]` on State 1, do we re-render the page in place as State 3, or navigate to the newly-created UserGame URL? Recommendation: re-render in place — the IGDB ID in the URL didn't change, only the underlying state did.
- **OQ-GD-7 — "Shown at events" cross-link.** Requires Events surface (B-IGDB-1) to exist first. Defer the cross-link to whichever workstream ships Events. Page reserves the slot but renders empty until Events lands.
- **OQ-GD-8 — Reference-data lateral nav (developer / publisher / series).** Requires B-Stash-5 reference entities. Big schema lift. Decision: do we ship GameDetail v2 with placeholder text "lateral nav: developer / publisher / series — coming with the reference-data workstream" or wait for B-Stash-5 to ship first? Recommendation: ship GameDetail v2 first with the placeholder; reference-data is a substantial separate workstream and shouldn't gate the 4-state rebuild.
- **OQ-GD-9 — Personal-Collections membership chip.** Requires B-Stash-4 to ship first. Same defer-with-placeholder treatment as OQ-GD-8.
- **OQ-GD-10 — Mobile shape.** The desktop matrix above is dense. Mobile needs to retain the 4-state distinction but compress the dense States 3+4 receipt block into a scrollable single column. Worth a separate mockup pass before implementation. (Mobile parity has been a hard requirement since Phase 8.)
- **OQ-GD-11 — State boundary: "completed" vs "in-progress" for sub-status purposes.** If a user has `status: Completed` but `completionsCount: 0` (just marked it as completed without specifying 100% / +side / main), do we treat that as State 4 with sub-status unset, or downgrade to State 3 until sub-status is picked? Recommendation: State 4 always for `status: Completed`; sub-status renders as "not specified yet" with a prompt.
- **OQ-GD-12 — Wishlist relationship to State 2.** A game with `status: Wishlist` is "in collection" technically (CM13 + the wishlist-as-library work created the UserGame), but the user-job is closer to State 2 than State 3. Do we render Wishlist-status owned games as State 2 (dominant countdown, `[+ wishlist]` becomes `[× un-wishlist]`) or State 3 (status picker, library citizen)? Recommendation: State 2 *if* the release date is in the future, State 3 *if* the release date is past (i.e., already-released wishlist items are library decisions, not anticipation tracking).

### 3.6 Sequencing notes

GameDetail v2 is a multi-PR workstream once decisions land. Likely shape:

- **GD-PR1** Route migration to `/game/:igdbId` + state-aware shell rendering + S1 (released-not-owned) basics. Establishes the architecture.
- **GD-PR2** S2 (upcoming-not-owned) with HeroCountdown promoted to dominant page element + region/platform date drilldown + IGDB videos + screenshots gallery.
- **GD-PR3** S3 enrichments — sub-status data model, rating UI, HLTB user-vs-community row, manual-playtime edit affordance.
- **GD-PR4** S4 enrichments — Completed sub-statuses, times-beaten counter, play-date-range, share-receipt promotion.
- **GD-PR5** Lateral nav placeholders + collection membership placeholders + events back-link placeholder (gated on those workstreams).

Open whether B-Stash-5 (reference entities) and B-IGDB-1 (Events) should ship before or after GD-PR1–4. Recommendation per OQ-GD-8: ship GameDetail v2 first with placeholders; the reference-data + Events workstreams can fill those slots in.

---

## 4. Library

*To be filled in next session.*

Likely focus areas based on existing observations:
- Pending-review queue surface (Q-series — `UserGame.needsReview` flag + Library callout for low-confidence matches)
- Score-aware filters / shelves (depends on B-Stash-3 rating)
- Personal-Collections shelf (depends on B-Stash-4)
- Reference-data filters: "all games by developer X" (depends on B-Stash-5)

---

## 5. Releases

*To be filled in next session.*

Likely focus areas:
- Region / platform date drilldown overlap with GameDetail v2 (B-IMDB-2)
- Cross-link to Events (B-IGDB-2)
- Card hover / focus → preview of S2 GameDetail?

---

## 6. Events (new top-level surface)

*To be filled in next session.*

Spec from scratch:
- IGDB `events` + `event_games` integration
- List view (`/events`) — past + upcoming events, chronological
- Detail view (`/events/:slug`) — cover + description + dates + grid of games announced/shown
- Sidebar nav peer of Library / Releases / Settings

---

## 7. Dashboard

*To be filled in next session.*

Likely focus areas: less benchmark pressure (Stash has no Dashboard analogue, IMDB/HLTB don't ship a personal-dashboard view). More about polish + alignment with the other pages.

---

## Doc-lifecycle notes

- Page sections fill in iteratively per Andrea-led discussion sessions. Order: GameDetail (this commit, §3) → next session per Andrea.
- Open questions get resolved into the matching `*_PLAN.md` for the workstream that ships the page (e.g. `docs/GAMEDETAIL_V2_PLAN.md` once GD-PR1 opens). This doc remains the *functional spec*; the plan docs handle PR sequencing + tests + decisions.
- Benchmark catalog (§2) is append-only — new observations get new IDs (`B-<source>-<n>`). Don't renumber.
