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
| **Deals** | `/deals` (new) | **Spec from scratch** — top-level peer; aggregator of storefront discounts + trusted third-party-reseller offers per Andrea 2026-05-29 | Yes |
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
- **B-IGDB-3** IGDB-tag triple — **genres + themes + perspectives** — as three distinct filterable / browseable dimensions across the library. IGDB exposes all three as separate axes on every game:
    - `genres` — form (RPG / Action / Strategy / Puzzle / Simulation / etc., ~20 values)
    - `themes` — tone + setting (Fantasy / Sci-Fi / Horror / Comedy / Historical / Mystery / etc., ~25 values)
    - `player_perspectives` — camera convention (First-person / Third-person / Side-view / Top-down / Text / etc., ~8 values)
    Stash merges all three into a single "tags" axis (per O14); **Hoard keeps them as three separate dimensions** — they discriminate differently and a user browsing by Horror (theme) or First-person (perspective) is making meaningfully different queries than browsing by RPG (genre). All three are in scope from day one of B-IGDB-3, not v2-deferred. **Already integrated** — all three land on the IGDB `Game` payload we already fetch, so these filters are *lighter-dependency* than developer/publisher/series (those need new reference entities; the IGDB-tag triple just needs indexes + filter UI).

### B-HLTB

- **B-HLTB-1** Reviews filtered per platform (PS5 review experience ≠ PC review experience for the same game). Hoard will define its own review primitive; this is *inspiration* for the per-platform dimension, not a copy-the-UI mandate. *Deferred — slot only.*
- **B-HLTB-2** Per-style time-to-beat grid (main / extras / completionist) — Hoard already has this via the HLTB scraper.
- **B-HLTB-3** User-time-vs-community comparison: "your 47h vs community-main 38h vs community-100% 75h" framing on completed games.

### B-Storefront (preorder + price-offer surfaces, added 2026-05-29)

- **B-Storefront-1** Preorder deep-links per platform on State 2 (upcoming-not-owned) GameDetail. Linkable platforms: Steam (`store.steampowered.com/app/{steamAppId}/`), PSN (`store.playstation.com/.../concept/{psnConceptId}`), Xbox (`microsoft.com/.../{slug}/{xboxTitleId}`), GOG (`gog.com/game/{slug}`), Epic (`store.epicgames.com/.../p/{slug}`), Nintendo (`nintendo.com/store/products/{slug}/`). All six stable platform IDs are already stored on `Game` from the M-series sync work; *some* storefronts also need a slug we don't yet capture (Xbox / Epic / Nintendo — see OQ-GD-14).
- **B-Storefront-2** Current price offers on State 1 (released-not-owned) GameDetail — official-platform discounts + trusted third-party-reseller pricing. Data source most likely IsThereAnyDeal (ITAD) API, which is the canonical games-price aggregator covering all major storefronts + key resellers (CDKeys, GamesPlanet, GMG, Humble, Fanatical, etc.). Same underlying source powers the Deals top-level surface (§8).

### B-News (added 2026-05-29)

- **B-News-1** "Latest news regarding this title" section on State 2 (upcoming-not-owned) GameDetail. Replaces the HLTB block — which is meaningless for unreleased titles because nobody has played them yet. Data source TBD (IGDB has `pulses` + `articles` with limited coverage; ToS-clean alternatives include RSS aggregation from a curated allow-list of game press sites — see OQ-GD-15).

### B-Hoard (Hoard-native identity, added 2026-05-29)

Not benchmarked from a competitor — this is Hoard's own product-identity territory.

- **B-Hoard-1** **Archivist relic** — completing a game (Playing/Backlog/OnHold → Completed transition) creates a permanent visual artifact on the State 4 GameDetail page. The relationship framing per Andrea: a collector with their collection is closer to *sacred* than utilitarian; the example given is a friend who keeps his retro-console collection arranged as an altar. Stylistic inspiration: Warhammer 40k techno-priests sealing a techno-relic. The artifact should be permanent, visible whenever State 4 renders, and should make the act of completion *feel* impactful rather than just a status flip. Concrete shape is open (see OQ-GD-13) — candidates include deterministic ASCII sigils generated from `(igdbId, completedAt, userId)`, "sealed receipt" treatments with the run's stats burned in (playtime, achievements, rating, date), unique color/glyph palettes per game, or animated "consecration" stamps that play once at the transition moment and persist statically afterward. Anchors Hoard's collector-tool identity against the utilitarian-tracker identity Stash/Backloggd occupy.

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
| No preorder deep-links on upcoming games | B-Storefront-1 | Stable platform IDs already on `Game` (steamAppId / psnConceptId / xboxTitleId / gogAppId / epicCatalogItemId / nintendoTitleId). Some need a slug we don't capture (OQ-GD-14) |
| No price offers on released-not-owned games | B-Storefront-2 | New data integration (ITAD API the canonical source); shares pipeline with the Deals top-level surface |
| HLTB renders on upcoming-not-owned where it's meaningless | (UX) | Nobody has played the game yet; community time data doesn't exist or is bogus. Removed in v2; replaced with **latest news** section (B-News-1) |
| No latest-news surface for upcoming titles | B-News-1 | Data source TBD; OQ-GD-15 |
| No wishlist CTA on State 1 (released-not-owned) | (UX) | Today only `[+ add to library]` makes sense for already-released games, but the user may want to wishlist a released game they're not ready to buy/start yet. Add as alternative path |
| **Completing a game feels like a status flip, not a moment** | B-Hoard-1 | The Playing→Completed transition deserves an *artifact* — permanent, visible whenever State 4 renders. Anchors Hoard's collector identity. Concrete shape open (OQ-GD-13) |

### 3.4 Target state — 4-state rendering matrix

The page renders the same identity surface (cover / title / genres / videos / screenshots / description / lateral nav) in all 4 states, but the *dominant* element changes per state:

| Element | S1 (released, not owned) | S2 (upcoming, not owned) | S3 (owned, in-progress) | S4 (owned, completed) |
|---|---|---|---|---|
| Cover + title + year | ✓ | ✓ | ✓ | ✓ |
| Genres / themes / tags | ✓ | ✓ | ✓ | ✓ |
| Description / plot | ✓ | ✓ | ✓ | ✓ |
| Video carousel | ✓ | ★ | ✓ | ✓ |
| Screenshot gallery | ✓ | ★ | ✓ | ✓ |
| **Giant countdown (IMDB-style)** | — | **★ dominant** | — | — |
| **Archivist-relic artifact (B-Hoard-1)** | — | — | — | **★ dominant** |
| Release date (single line) | ✓ | — | — | — |
| Release dates per region + platform (expandable) | ✓ | ✓ | — | — |
| `[+ add to library]` CTA | **★ dominant** | — | — | — |
| `[+ wishlist]` CTA (alternative on S1; dominant on S2) | ✓ | **★ dominant** | — | — |
| Wishlist hype score (B-IGDB-1 derived) | — | ✓ | — | — |
| **Preorder deep-links per platform (B-Storefront-1)** | — | **★** | — | — |
| **Current price offers across storefronts (B-Storefront-2)** — full panel | **★** | — | **★** *(when `status='Wishlist'` + past release date — OQ-GD-12 library-citizen case)* | — |
| **Physical-edition price comparison (B-Storefront-2 + physical pipeline)** | — | ★ *(collector / special editions — OQ-GD-17)* | — | — |
| **Per-platform-wishlist deal chip** (small inline chip on the relevant platform row in PROGRESS — "// wishlisted on Steam — -50% €34.99") | — | — | ✓ *(when CM12 per-platform wishlist exists for an unowned platform)* | ✓ *(same)* |
| **Latest news section (B-News-1)** | — | ★ | — | — |
| PROGRESS receipt block (per-platform playtime + HLTB grid + achievements) | — | — | ✓ | ✓ |
| Status picker | — | — | **★ dominant** | ✓ (with `[mark uncompleted / replay]`) |
| Sub-status (Playing → infinite / paused) | — | — | ★ | — |
| Sub-status (Completed → main / +side / 100%) | — | — | — | **★ dominant** |
| Times-beaten counter | — | — | ✓ | ★ |
| Score / rating UI | — | — | ✓ | **★ dominant** |
| Notes editor | — | — | ✓ | ✓ |
| HLTB community grid | ✓ | — *(meaningless pre-release)* | ✓ | ✓ |
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

**Per-state visual hierarchy summary** (top-to-bottom scan):

- **S1 (released, not owned)** — cover + meta → `[+ add to library]` (dominant) + `[+ wishlist]` (alt) → current price offers across storefronts → screenshots + videos → description → HLTB → lateral nav / events back-links.
- **S2 (upcoming, not owned)** — cover + meta → **giant countdown** + `[+ wishlist]` (dominant) → release-dates-per-region-platform expandable → preorder deep-links → screenshots + videos → latest news → description → lateral nav / events back-links. *No HLTB — nobody has played it yet.*
- **S3 (owned, in-progress)** — cover + meta → **status picker** (dominant) + sub-status → PROGRESS receipt block (playtime + HLTB + achievements + user-vs-community pace) → notes editor → rating UI → times-beaten → manual-playtime edit (non-synced rows) → share receipt → lateral nav.
- **S4 (owned, completed)** — cover + meta → **archivist-relic artifact** (dominant, permanent) → score / rating (dominant) + sub-status (main / +side / 100%) → PROGRESS receipt block with user-vs-community pace highlighted → times-beaten + play-date-range → notes → share receipt → lateral nav. The mood differs from S3: where S3 is *active workspace*, S4 is *archived monument*.

### 3.5 Open questions

**LOCKED** (Andrea 2026-05-29):

- **OQ-GD-1 — Route shape.** ✅ **Migrate to `/game/:igdbId`** with a transition window where the cuid form 301s to the IGDB form. Single URL shape; share-links work for any user; aligns with the State-1/State-2 architectural need (those states have no UserGame to address by cuid). Implementation note for GD-PR1: keep the existing `/game/:userGameId` route as a backward-compat 301 redirect during the transition window so external links don't break.
- **OQ-GD-2 — Sub-status data model.** ✅ **Enum column with runtime guard.** `UserGame.subStatus: SubStatus?` (enum union of all variants across states); a runtime check at write-time rejects values that don't match the current `status` so we can't end up with e.g. `status: Playing + subStatus: '100%'`.
- **OQ-GD-3 — Times-beaten schema.** ✅ **Ship `UserGame.completionsCount: Int?` column now**, refactor to derived-from-Session when CM2 Session entity lands. Cheap, survives the future migration.
- **OQ-GD-4 — Rating shape.** ✅ **`UserGame.rating: Int?` (1–10)**, UI = 10-box click-to-fill grid with hover preview. Matches the terminal aesthetic better than stars or slider.
- **OQ-GD-5 — HLTB user-vs-community comparison UI.** ✅ **Extra row inside PROGRESS receipt block.** Format: `pace: your 47h vs main 38h (+24%)`. Single line, scannable.
- **OQ-GD-6 — Cross-state transition behaviour.** ✅ **Re-render in place.** Adding a game to library on S1 transitions to S3 without navigating away — the IGDB ID in the URL didn't change.
- **OQ-GD-7 — "Shown at events" cross-link.** ✅ **Placeholder slot in GameDetail v2; Events workstream fills it.**
- **OQ-GD-8 — Reference-data lateral nav (developer / publisher / series).** ✅ **Ship GameDetail v2 first with placeholders**; reference-data workstream fills them later.
- **OQ-GD-9 — Personal-Collections membership chip.** **Same defer-with-placeholder treatment as OQ-GD-8** — ✅ confirmed by Andrea after clarification 2026-05-29. **Clarification of what this means:** B-Stash-4 introduces *personal Collections* — user-defined groupings of games orthogonal to status (e.g. "Cyberpunk vault", "Pokemon completionist run", "Dad's PS2 favorites"). A game can belong to zero, one, or many Collections. When that ships, GameDetail should show *which Collections this game belongs to* as small chips below the cover/title block — e.g. `[in: Cyberpunk vault] [in: replay queue]` — and the user can `[+ add to collection]` from there. GameDetail v2 reserves the slot but renders empty until the Collections workstream lands.
- **OQ-GD-10 — Mobile shape.** ✅ **Separate mobile mockup pass** before implementation. The desktop matrix is dense; mobile compresses S3+S4 into a scrollable single column while retaining the 4-state distinction.
- **OQ-GD-11 — State boundary: "completed" vs "in-progress" for sub-status purposes.** ✅ **State 4 always for `status: Completed`**; sub-status renders as "not specified yet" with a prompt.
- **OQ-GD-12 — Wishlist relationship to State 2.** ✅ **Switch on release date.** Wishlist-status game with release date in the future → render as State 2 (anticipation framing, dominant countdown). Wishlist-status game with release date in the past or null → render as State 3 (library citizen — gets reviews + other library treatments per Andrea's framing). The CM12 per-platform wishlist remains orthogonal to this state switch.

**OPEN** (added 2026-05-29 alongside the new gaps):

- **OQ-GD-13 — Archivist-relic visual treatment.** What shape does B-Hoard-1 actually take? The intent is clear (permanent artifact, sacred-collector framing, Warhammer-techno-priest aesthetic inspiration); the *concrete render* is open. Candidate directions:
    1. **Deterministic ASCII sigil** generated from `(igdbId, completedAt, userId)` — unique per (game × user × completion-instance). Pure terminal aesthetic, no asset dependencies.
    2. **Sealed-receipt treatment** — the completion stats (date, total playtime, achievements earned, rating, sub-status) burned into a receipt with a `[SEALED ON YYYY-MM-DD]` stamp and scanline / barcode treatment.
    3. **Unique color/glyph palette** — game-derived palette that re-skins the State 4 page in a way no other page renders.
    4. **Animated "consecration" stamp** that plays once at the Playing→Completed transition moment and persists statically afterward (combines #1 or #2 with a moment-of-impact animation).
    Probably worth a dedicated design exploration session — write up sketches, mock 2-3 candidate directions, pick. Standalone deliverable, ahead of GameDetail v2 implementation.
- **OQ-GD-14 — Storefront slugs.** B-Storefront-1 deep-links work directly for storefronts where the URL is fully derivable from a stable ID we already store (Steam needs only `steamAppId`; GOG can use `gogAppId` though a slug is friendlier). For Xbox / Epic / Nintendo / PSN the canonical store URL also needs a slug we don't currently capture. Three options:
    1. **Always-derivable URLs only** — show Steam + GOG preorder links; omit the rest. Simple, ships fast, but misses 4/6 platforms.
    2. **Capture slugs during sync** — extend each platform sync to persist a `storefrontSlug` per platform on the `Game` row. Schema lift; happens incrementally as users sync.
    3. **Use ID-only fallback URLs** — Xbox's `microsoft.com/.../{titleId}` and Nintendo's `nintendo.com/store/products/{titleId}` etc. *sometimes* redirect; PSN's `concept/{conceptId}` does. Not all stable, browser may show 404 for some IDs.
    Recommendation: ship #1 in GD-PR2 (Steam + GOG + PSN where the concept-URL works), file #2 as a Storefront-polish follow-up workstream so each sync writer adds slug capture incrementally.
- **OQ-GD-15 — Latest-news data source.** Where does B-News-1 actually pull data from? Candidates:
    1. **IGDB `pulses` + `articles`** — already integrated, low effort, but coverage is *thin*. Most high-profile titles have a handful of articles; B-tier titles have nothing.
    2. **Curated RSS allow-list** — Hoard subscribes to a curated set of game-press RSS feeds (Eurogamer, RPS, PC Gamer, GamesIndustry, etc.), filters by title match. ToS-clean if we link out rather than rehost; quality depends on the allow-list curation.
    3. **No news feature on day-one of GameDetail v2** — render the section as a placeholder ("// news feed coming soon") and defer the data integration to a separate workstream. Reduces GD-PR2 scope.
    Recommendation: ship #3 with the placeholder; pick #1 vs #2 in a separate session once we see how often the news section is actually wanted on real games. The placeholder gives us the slot without forcing the data-quality question.
- **OQ-GD-16 — ITAD vs DIY for price-offer + Deals data.** B-Storefront-2 (price offers on S1) and the Deals top-level surface (§8) both need real-time price aggregation across storefronts + third-party resellers. ITAD (`isthereanydeal.com`) is the canonical API for this — free tier exists, covers Steam / GOG / Epic / Humble / Fanatical / GMG / GamesPlanet / CDKeys / and most major sources. Console storefronts (PSN / Xbox / Nintendo) are weaker on ITAD; their pricing changes less often anyway. DIY scraping would be substantial engineering + ToS-risky. Recommendation: **ITAD**, ship the Deals page + S1 price section in the same workstream that adds the ITAD client. Pre-deploy gotcha: ITAD requires an API key from their dashboard; env-var pattern same as IGDB/Steam.
- **OQ-GD-17 — Physical-edition price comparison on S2 (upcoming, not owned). ✅ LOCKED 2026-05-30 (in scope, physical-only).** Digital preorders are typically locked at MSRP across official storefronts (no comparison value); but physical preorders vary widely — Amazon.de standard edition vs Mediaworld collector edition vs GameStop preorder bonus etc. Given physical deals are in scope per §8 (Andrea 2026-05-30, S0 collector identity), S2 gets a *physical-only* price comparison card (DEALS-PR3 dependency — Amazon Product Advertising API). Card only renders when physical SKUs exist for the upcoming title; otherwise hidden. Digital preorder coverage stays as the existing per-platform deep-link strip (B-Storefront-1) — no digital comparison value.

### 3.6 Sequencing notes

GameDetail v2 is a multi-PR workstream once decisions land. Likely shape after the 2026-05-29 expansion:

- **GD-PR1** Route migration to `/game/:igdbId` (with cuid → IGDB 301) + state-aware shell rendering + S1 (released-not-owned) basics: cover, meta, `[+ add to library]` (dominant) + `[+ wishlist]` (alt), description, lateral-nav + Collections + events placeholders. Establishes the architecture.
- **GD-PR2** S2 (upcoming-not-owned) with HeroCountdown promoted to dominant page element + region/platform date drilldown + IGDB videos + screenshots gallery + preorder deep-links (Steam + GOG + PSN; rest deferred per OQ-GD-14) + latest-news placeholder. HLTB row *removed* from S2 per spec.
- **GD-PR3** S3 enrichments — sub-status data model, rating UI (1–10 click-to-fill), HLTB user-vs-community row, manual-playtime edit affordance (non-synced rows only per O14 lock).
- **GD-PR4** S4 enrichments — Completed sub-statuses, times-beaten counter, play-date-range, share-receipt promotion, **archivist-relic placeholder slot** (visual treatment per OQ-GD-13 lands in a separate design-exploration deliverable that GD-PR4 consumes).
- **GD-PR5** Polish + dependency-fill — once Events / Collections / reference-data workstreams ship their data, GD-PR5 fills the placeholders in place.

Standalone work that runs alongside but is not gated by GD-PR1–5:
- **Archivist-relic design exploration** (OQ-GD-13) — 2–3 candidate visual directions mocked + picked. Deliverable consumed by GD-PR4.
- **ITAD-integration workstream** (OQ-GD-16) — adds the price-aggregation client; ships the Deals top-level page (§8) and unblocks the S1 price-offers row.
- **Latest-news data source** (OQ-GD-15) — picks IGDB pulses vs. RSS allow-list; ships the data behind the GD-PR2 placeholder.
- **Storefront-slug capture** (OQ-GD-14) — extends each platform sync to persist `storefrontSlug` on `Game`; unblocks the full preorder coverage on S2.

Order between GD-PRs and the standalone workstreams is open — Andrea drives prioritisation. The dependency graph: GD-PR4 needs the archivist design done; everything else can sequence in any order.

---

## 4. Library

### 4.1 Purpose

Library is the *manipulate-your-collection* surface — browse, filter, drill into edit affordances, organise. Distinct from GameDetail (which is per-game) and Releases (which is anticipation-only): Library is *across* your games, organised by multiple lenses simultaneously.

User jobs:
1. **"What am I playing right now?"** — landing page surfaces in-progress games immediately
2. **"What did I play last year?"** — historical browsing, completed shelf
3. **"What's in my Pokemon collection?"** — personal-collection navigation (B-Stash-4 dependency)
4. **"What FromSoftware games do I own?"** — reference-data navigation (B-Stash-5 dependency)
5. **"What did I rate 9+?"** — score-aware browsing (B-Stash-3 dependency)
6. **"What needs my attention?"** — pending-review queue from low-confidence sync matches (Q-series, deferred candidate per CLAUDE.md)
7. **Quick action lookup** — find a game by name, drill into status/notes edit

The page is the central organising surface for a hoard. Most of the v2 ambition for Library is *adding new lenses* alongside status (the only lens today).

### 4.2 Current state

Post-Phase-8 + post-CM12 + post-A1-A8 work:

- **Two URL families:** `/library` (landing — 6 shelves) + `/library/:status` (filtered single-shelf view)
- **6 status shelves** on landing: Playing / On Hold / Completed / Backlog / Dropped / Wishlist
- **Wishlist surfacing widened** post-CM12 — UserGames with `status='Wishlist'` OR non-empty `wishlistedPlatforms` appear in the Wishlist shelf (per-platform wishlists surface alongside full-game wishlists)
- **Single-shelf filtered view** with platform filter chips + sort cycle (lastPlayed / title / playtime) + URL state `?sort=&view=`
- **Find input** with `/` keyboard shortcut (search across the library by title)
- **Cover-density preference** (cozy 96×128 / standard 84×112 / dense 72×96) from `usePreferences()`
- **Pull-to-refresh** on mobile (Phase 8 PR 5)
- **Empty-state with CTA panel** when a status has no games
- **Per-shelf "view all" link** → drills to `/library/:status`
- **Single shelves view** simplified in Phase-8 PR-A (no sort/filter chips on the landing aggregate; controls only on `/library/:status`)

### 4.3 Gaps vs benchmark

Library has the heaviest dependency stack — most additions wait on B-Stash workstreams to ship the underlying data primitives.

| Gap | Sources | Notes |
|---|---|---|
| **No pending-review surfacing** | Q-series (deferred-candidate per CLAUDE.md) | After M-series sync expansion (5 new sync paths in 3 days), low-confidence title matches multiplied. `UserGame.needsReview` flag + Library callout for sync-derived rows that title-search matched at low confidence |
| **No rating-aware filters or shelves** | B-Stash-3 | Sort by rating, filter "rated 8+", potentially a "Best rated" cross-status shelf. Depends on `UserGame.rating: Int?` column existing first |
| **No genre / theme / perspective filters or browse-by surface** | B-IGDB-3 | All three already on `Game` via IGDB; just need indexes + filter UI + 3 browse-by panel rows. Lighter dependency than dev/pub/series — ships *before* B-Stash-5. Three separate lenses (Hoard keeps them distinct vs. Stash's merged "tags" axis — each discriminates differently) |
| **No personal Collections** | B-Stash-4 | Browse + add to Collection from Library. New entity `UserCollection` + join table; UI: Collections as horizontal shelves on landing alongside status shelves |
| **No reference-data navigation** | B-Stash-5 | "Browse by developer / publisher / series" — quick-filter surface using the user's most-represented developers/publishers/series. Routes: `/library?developer=…` or sub-route. Depends on Developer / Publisher / Franchise reference entities + Game FK relationships |
| **Completed shelf cards look identical to other shelves** | B-Hoard-1 | The archivist-relic concept on State 4 GameDetail should subtly read in the Library too — Completed shelf cards get a small "sealed" visual marker (single character or glyph in the corner) so the eye picks them out as *consecrated artifacts* even at scan-density. Trickle-down from the relic identity |
| **No "your year in games" wrap-up surface** | (Hoard discovery) | Adjacent to the deferred Stats/Wrapped screen (key decision #3 in AGENT.md — "Deferred to v2. The Dashboard covers the key numbers."). Worth re-considering once rating + Collections data exists — would make a richer wrap-up viable |

### 4.4 Target state

Status remains the *primary* lens, but Library evolves from "6 status shelves" into a *two-layer surface*:
- **Layer 1 — `/library` overview** is a navigation hub. Pure signposting; no compound filtering; no game grids; no find input. Its only job is *get the user into a primary-lens view*.
- **Layer 2 — Filtered views** are composable query surfaces. One URL shape parameterised by primary lens + secondary filters + sort + find-within-lens.

The composition model is locked: **one primary lens × N secondary filters × one sort × one find query**.

#### 4.4.1 Filter composition model

**Primary lens** (exactly one — drives the URL path + page heading). Each primary lens type is its own route family:

| Primary lens | Route shape | Ships with |
|---|---|---|
| Status | `/library/:status` | Existing |
| **Genre** | **`/library/by-genre/:slug`** | **B-IGDB-3 (lighter — already on Game; ships standalone, not gated on B-Stash-5)** |
| **Theme** | **`/library/by-theme/:slug`** | **B-IGDB-3 (same as genre — ships with the IGDB-tag-triple workstream)** |
| **Perspective** | **`/library/by-perspective/:slug`** | **B-IGDB-3 (same)** |
| Collection | `/library/by-collection/:slug` | B-Stash-4 |
| Developer | `/library/by-developer/:slug` | B-Stash-5 |
| Publisher | `/library/by-publisher/:slug` | B-Stash-5 |
| Series | `/library/by-series/:slug` | B-Stash-5 |
| Rating bucket | `/library/by-rating/:bucket` *(optional — may live as a sort variant on Status lens instead)* | B-Stash-3 |
| Pending-review | `/library/pending-review` | Q-series |
| All (no lens — flat grid) | `/library/all` *(optional; rarely needed)* | — |

**Secondary filters** (composable, URL query-params, intersect with primary). The secondary filters visible *depend on which primary is active* — show only the ones that meaningfully discriminate further:

| Primary lens | Visible secondary filters |
|---|---|
| Status | platform · **genre · theme · perspective** · developer · publisher · series · collection · rating |
| **Genre** | **platform · status · theme · perspective · developer · publisher · series · collection · rating** |
| **Theme** | **platform · status · genre · perspective · developer · publisher · series · collection · rating** |
| **Perspective** | **platform · status · genre · theme · developer · publisher · series · collection · rating** |
| Collection | platform · status · **genre · theme · perspective** · developer · publisher · series · rating |
| Developer | platform · status · **genre · theme · perspective** · collection · rating |
| Publisher | platform · status · **genre · theme · perspective** · developer · collection · rating *(developer as sub-filter is interesting; e.g. Nintendo publisher → drill to Game Freak. See OQ-LIB-9 on the asymmetry)* |
| Series | platform · status · **genre · theme · perspective** · collection · rating |
| Rating bucket | platform · status · **genre · theme · perspective** · developer · publisher · series · collection |
| Pending-review | platform · status *(other lenses don't usefully discriminate; needsReview rows are data-quality cases, not curated subsets)* |
| All | every secondary filter visible (status · **genre · theme · perspective** · developer · publisher · series · collection · rating · platform) |

**Why the IGDB-tag triple is on nearly every lens:** genres + themes + perspectives are the most orthogonal axes available — every other lens (status, developer, publisher, series, collection, rating) meaningfully discriminates further when sliced by any of the three. *"Playing × JRPG"*, *"FromSoftware × First-person"*, *"Pokemon collection × RPG"*, *"Rated 8+ × Horror"*, *"Backlog × Sci-Fi × First-person"* are all natural queries. The three dimensions don't strongly correlate with each other (a Horror game can be first-person OR third-person OR top-down; an RPG can have Fantasy OR Sci-Fi theme; etc.) so they discriminate independently.

**Sort** (one at a time, URL param `?sort=`): `lastPlayed` (default) · `title` · `playtime` · `rating ↓` *(B-Stash-3 dependency)* · `addedAt` · `completedAt` *(Completed-status only)*.

**Find input** (URL param `?q=`): text search that *composes with the current lens + secondary filters* — searches within the active intersection, not across the whole library. Lives **only on filtered views**, not on the overview. The global cross-everything path is the **existing Cmd-K SearchOverlay** (no change to that surface; it already searches across all UserGames regardless of lens).

#### 4.4.2 Library overview shape (`/library`)

Pure navigation hub. No game grids; no compound filtering; no find input. Each link/chip navigates *into* a primary-lens view.

```
// LIBRARY

// ⚠ 4 entries need your review     ← (NEW — Q-series callout, only when needsReview > 0)
   [review queue →]

// status                            ← (existing — six shelves with counts; cards link to /library/:status)
   ▢ Playing 12 →
   ▢ On Hold 3 →
   ▢ Completed 287 ★  ★  ★  …       ← Completed cards carry a small "sealed" glyph (B-Hoard-1)
   ▢ Backlog 488 →
   ▢ Dropped 14 →
   ▢ Wishlist 47 →

// collections                       ← (NEW — B-Stash-4 dependency)
   ▢ Cyberpunk vault 8 →
   ▢ Pokemon completionist 24 →
   ▢ Dad's PS2 favorites 16 →
   [+ new collection]

// browse by                         ← (NEW — mixed dependencies, see element matrix; collapsed-with-top-3-preview)
   genre:       RPG 87 · Action 64 · Strategy 32 · [show all 19 →]    ← B-IGDB-3 (lighter dep)
   theme:       Fantasy 112 · Sci-Fi 78 · Horror 14 · [show all 22 →] ← B-IGDB-3
   perspective: Third-person 156 · First-person 84 · Side-view 27 · [show all 6 →]  ← B-IGDB-3
   developer:   Game Freak 24 · Nintendo 47 · FromSoftware 8 · [show all 23 →]
   publisher:   Nintendo 89 · Sony 56 · Capcom 23 · [show all 18 →]
   series:      Pokemon 18 · Mega Man 11 · Final Fantasy 9 · [show all 12 →]
```

Each row in the browse-by panel renders *independently* — the IGDB-tag triple (genre + theme + perspective) ships first (all three are data-on-hand from the IGDB Game payload we already fetch), developer/publisher/series fill in when B-Stash-5 lands. So Library landing has a meaningful browse-by section *before* the reference-data workstream ships.

**Element matrix per landing-page section:**

| Section | Default state | Ships when |
|---|---|---|
| ~~Find input + `/` shortcut~~ | **REMOVED 2026-05-30 — find is contextual to a lens, not global. Cmd-K SearchOverlay is the cross-everything path** | — |
| Pending-review callout | hidden when no needsReview rows | Q-series ships |
| Status shelves (6) | ✓ today | — |
| Completed shelf glyph treatment | absent today | B-Hoard-1 visual design lands (OQ-GD-13 resolution) |
| Collections shelves | hidden when no collections | B-Stash-4 ships |
| `[+ new collection]` CTA | hidden when B-Stash-4 unshipped | B-Stash-4 ships |
| Browse-by panel — genre / theme / perspective rows | each hidden when its index empty | B-IGDB-3 ships (lighter dep — all three already on Game) |
| Browse-by panel — developer / publisher / series rows | each hidden when its reference data absent | B-Stash-5 ships (per-row independently) |

Progressive-disclosure: each section *only renders when its dependency has shipped*. No empty-state placeholders for un-shipped features.

#### 4.4.3 Filtered view shape (`/library/:status` + future `/library/by-*` routes)

One URL shape parameterised by primary lens + secondary filters + sort + find. The toolbar adapts to the active primary lens (showing only the secondary filters that discriminate further).

```
// PLAYING (12)                                              [change lens ▾]
                                                                    ↑
                                            opens picker: status / collection /
                                            developer / publisher / series /
                                            rating / pending-review / all

[find: filter within Playing _______________ ]      ← lives only on filtered views

filters:  ⊕ platform:   [ all | ST | PS | XB | GG | IT | EP | NT ]
          ⊕ developer:  [ + any ]                  ← clickable chip → picker
          ⊕ collection: [ + any ]
          ⊕ rating:     [ ≥ 7 | any ]
                                                   ← secondary filters shown per
                                                     the visibility rules in §4.4.1

sort: [ rating ↓ ]                                ← cycle button

╔════ game grid (cover density from prefs) ════════════════╗
│ ...                                                       │
╚═══════════════════════════════════════════════════════════╝
```

Same toolbar shape used for every primary lens; only the visible secondary-filter chips differ. The `[change lens ▾]` chip opens a picker so users can pivot — e.g. browsing FromSoft developer → realising they want to see only the Playing ones → either pivots via the picker to the Status lens (with developer as secondary) or applies status as a secondary filter on the current Developer lens. Both routes reach the same intersection; URL just expresses which lens is "primary."

**Worked-example URLs** (all reach the same game set):

- `/library/Playing?platform=PS&developer=fromsoftware&sort=rating`
- `/library/by-developer/fromsoftware?status=Playing&platform=PS&sort=rating`
- `/library/by-rating/8+?status=Playing&platform=PS&developer=fromsoftware&sort=rating`

The choice between them is purely about which lens the user wants featured in the page heading + URL share-context. The query intersection is identical.

### 4.5 Open questions

- **OQ-LIB-1 — Rating surfacing.** When B-Stash-3 lands, does rating get:
    1. A new sort option (`rating ↓`) within single-shelf views — minimal change
    2. A new filter chip ("rated 8+", "unrated") on single-shelf views
    3. A new cross-status shelf "// best rated" on landing
    4. All of the above
    Recommendation: **#1 + #2 in the B-Stash-3 workstream; #3 only if usage signal demands it.** Cross-status shelves dilute the status-as-primary-lens framing.
- **OQ-LIB-2 — Collections landing-page placement.** Collections as horizontal shelves between status and browse-by (the mockup above) vs. as their own collapsible panel vs. on a separate `/collections` page entirely. Recommendation: **inline on `/library` as shelves**, mirroring the status section shape. `/collections` as a dedicated page only if Collections grow large enough to warrant their own discovery surface (probably never in personal-tool scope).
- **OQ-LIB-3 — Reference-data filter URL shape.** Sub-routes (`/library/by-developer/game-freak`) vs query params (`/library?developer=game-freak`)? Recommendation: **sub-routes for cleaner share-links + clearer browser history.** Matches the existing `/library/:status` pattern.
- **OQ-LIB-4 — Pending-review surface form.** When `needsReview > 0`:
    1. Callout banner at top of `/library` only (the mockup above) — passive, single surface
    2. Plus a sidebar nav badge (Library count with an alert dot) — pushes the notification across the app
    3. Plus a dedicated `/library/pending-review` route surfaced as a callout-link from the banner
    Recommendation: **#1 + #3** (banner on landing + dedicated route to drill into). Skip #2 — sidebar alert dots are notification-channel territory and Hoard hasn't committed to that pattern yet.
- **OQ-LIB-5 — Completed-shelf archivist visual.** What's the actual glyph? Likely depends on OQ-GD-13's design exploration outcome — if the State 4 archivist relic is a deterministic ASCII sigil, Library cards could show a small version of the same sigil; if it's a "SEALED ON DATE" stamp, Library cards show a sealed-corner glyph. **Defer to OQ-GD-13's resolution.**
- **OQ-LIB-6 — "Your year in games" wrap-up reconsideration.** AGENT.md Decision #3 deferred this to v2. Once Collections + Rating + Reference data ship, the wrap-up has substantially richer raw material (rated games + collections-membership graphs + developer-coverage stats). Worth a future product-strategy session to re-evaluate. **Not blocking any current work.**
- **OQ-LIB-7 — Browse-by panel: collapsed or expanded by default?** If a user has 50+ developers in their library, the panel is information-dense. Recommendation: **collapsed by default with a top-3 preview row visible** (`developer: Game Freak 24 · Nintendo 47 · FromSoftware 8 · [show all 23 →]`). Same pattern for publisher + series.
- **OQ-LIB-8 — Wishlist shelf semantics post-CM12.** Today the Wishlist shelf surfaces both `status='Wishlist'` rows AND rows with non-empty `wishlistedPlatforms`. After GameDetail v2's S2-vs-S3 split based on release date (OQ-GD-12 lock), the Wishlist shelf might want to mirror that split: "Wishlist · upcoming" (S2-flavoured, anticipation) and "Wishlist · released" (S3-flavoured, decision-to-buy). Recommendation: **defer until cohort signal demands it.** The unified shelf works fine today; splitting adds complexity that benefits only the rare power-user with both kinds simultaneously.
- **OQ-LIB-9 — Publisher ↔ Developer asymmetry in secondary filters.** On the Publisher lens, showing Developer as a secondary filter discriminates meaningfully (Nintendo publishes through Game Freak / Retro Studios / Monolith Soft — drilling to "Game Freak under Nintendo" is real). On the Developer lens, showing Publisher as a secondary filter usually doesn't (Game Freak only publishes through Nintendo — the filter would have one option). The locked visibility rules above reflect this asymmetry: Publisher lens shows Developer; Developer lens does NOT show Publisher. **Worth a sanity-check after B-Stash-5 reference data lands** — if real-world data shows multi-publisher developers (some indies self-publish on Steam but go through a publisher on console), reopen the rule.

### 4.6 Sequencing notes

Library work is mostly *follow-ons* to other workstreams — it gets the surface; the data primitive ships elsewhere. The dependency graph:

| Library addition | Blocked on |
|---|---|
| Pending-review surface | Q-series workstream (UserGame.needsReview flag + sync-pipeline writes) |
| Rating-aware filters/sort | B-Stash-3 workstream (UserGame.rating column + GameDetail UI) |
| **Genre / theme / perspective filters + 3 primary-lens routes + 3 browse-by rows** | **B-IGDB-3 workstream — 3 indexes + filter UI for the IGDB-tag triple. Lighter than B-Stash-5 (all three already on Game from IGDB)** |
| Collections shelves on landing + `/library/by-collection/:slug` | B-Stash-4 workstream (UserCollection entity + management UI) |
| Browse-by panel rows (developer/publisher/series) + `/library/by-developer/:slug` etc. | B-Stash-5 workstream (Developer/Publisher/Franchise reference entities + Game FK) |
| Completed-shelf archivist glyph | OQ-GD-13 resolution (archivist visual design) |

**Standalone Library work that doesn't wait on anything:**
- **LIB-PR1** — Wishlist shelf semantic improvement post-CM12: when surfacing the Wishlist shelf, render the per-platform-wishlist context (CM12 follow-through). Same chip-row pattern as REL-PR1 on Releases cards. Cheap, small.
- **LIB-PR2** — Empty-state polish across the 6 status shelves. Today each empty shelf shows a CTA; some are stale ("connect a platform" when 6 are already connected). Audit + clean up.

Everything else threads in when its underlying workstream lands. Library doesn't need its own large multi-PR workstream — it's the *receiving end* of others.

---

## 5. Releases

### 5.1 Purpose

Releases is the *anticipation + recent-retrospective* surface — the answer to "what's coming, what just dropped." It serves three closely-related user jobs:

1. **"What am I waiting for?"** — wishlist-mode browsing of starred upcoming releases (the hero countdown to next-soonest, time-distribution view across months/quarters)
2. **"What's coming that I haven't noticed?"** — all-releases mode, hype-filtered, scoped to user's owned platforms
3. **"What dropped while I wasn't paying attention?"** — `/releases/recent` (14-day window) split into `// just out · starred` + `// also released · not starred`

The page rhymes with Events (both anticipation-flavored) and feeds into GameDetail State 2 (every release card click → GameDetail S2). The R-series rework (2026-05-07) overhauled the IA, primitives, and bucketing — Releases is *substantially more complete* than the other pages in this round.

### 5.2 Current state

Post-R1..R6 (complete 2026-05-07). Existing surface:

- **Two URL paths:** `/releases` (main) + `/releases/recent` (last-14-day window)
- **Main page: two modes + two zoom levels** — URL state `?mode={wishlist|my-platforms|all}&zoom={months|quarters}&bucket=…`
- **HeroCountdown** on wishlist mode (next-soonest starred release, live-ticking)
- **TimeNav** — bars + counts per time bucket; hatched diagonal for TBA
- **ReleaseCard** primitives — 3 variants (wishlist / all / recent)
- **AgendaRail** — chronological right-rail flat list
- **RecentBanner** with 2 variants pointing to `/releases/recent`
- **WishlistEmptyRecommendation** — top-3 hype-sorted picks when wishlist is empty
- **Mobile uses different IA per handoff §7** — view-sheet pattern (mode/scope/zoom/bucket via chevron stepper)
- **Card click** → `/game/:userGameId` for owned, otherwise dead-link (Wishlist toggle creates UserGame so the path always resolves post-wishlist-as-library work)

Released-not-owned game cards currently render with a hollow `+ wishlist` star toggle. The post-r2 OQ-S-13 reversal (CM12 + wishlist-as-library, May 2026) locked that the toggle creates a `UserGame(status='Wishlist')` server-side, so the card click can always navigate cleanly.

### 5.3 Gaps vs benchmark

Compared to Events / GameDetail v2 / Deals which are big spec-from-scratch sections, **Releases needs only modest additions**. Most of the Andrea-2026-05-29 direction (region/platform date drilldown, preorder links, latest news) lands on GameDetail S2 rather than Releases — the cards stay compact, the drill happens on click-through.

| Gap | Sources | Notes |
|---|---|---|
| No Events back-link chip on cards | B-IGDB-2 | Small visual: "▢ shown at State of Play 2026-04" chip below the title when a release card's game has an `EventGame` association. Requires Events workstream first |
| Release cards don't surface "wishlisted by you for: PS5, Switch" platform-array context | (CM12 follow-through) | After CM12 + per-platform-wishlist work, a single game can be wishlisted on a subset of its release platforms. Cards today show only the IGDB platform-array generically. Worth a chip-row showing *which platforms* the user starred — closes a CM12 follow-through gap |
| Click-through behaviour assumes UserGame ID; needs to align with GameDetail v2 route migration | (OQ-GD-1 follow-through) | When GameDetail v2 migrates to `/game/:igdbId`, the ReleaseCard `onOpen` handlers need to switch from `userGameId` to `igdbId`. Affects every card variant + AgendaRail row + StarredPanelCard. Synchronisation work, not a feature gap |
| Region/platform date drilldown on the card | B-IMDB-2 | **NOT a Releases gap — owned by GameDetail S2.** Cards stay compact (single release-date line); the drill happens on click-through. Documenting here to flag we considered it and assigned ownership |
| Preorder deep-links on cards | B-Storefront-1 | **NOT a Releases gap — owned by GameDetail S2.** Same rationale: keep cards scan-friendly, the action belongs on the destination page |
| Latest-news section on cards | B-News-1 | **NOT a Releases gap — owned by GameDetail S2.** Cards are list-density UI; news is detail-page-density UI |

### 5.4 Target state

The page concept doesn't change. Surface-level additions only:

1. **Events back-link chip on cards** (when an `EventGame` association exists for the game). Renders as: `// ▢ first shown at Summer Game Fest 2025`. Single line, tappable, navigates to `/events/:slug`. Card variant matters: include on wishlist + all + recent cards; omit on agenda-rail rows (too cramped).
2. **Per-platform wishlist context chip-row** for wishlist-mode cards. When `UserGame.wishlistedPlatforms` is a strict subset of the game's IGDB platforms, render: `// wishlisted: PS5 · Switch` instead of the generic platform array. When `wishlistedPlatforms` is empty or matches the full set, fall back to the current generic rendering. Resolves the CM12 follow-through ambiguity on the Releases page surface.
3. **Card → GameDetail route alignment** with GameDetail v2's `/game/:igdbId` migration (OQ-GD-1). Mechanical change: `ReleaseCard` / `AgendaRail` / `StarredPanelCard` / `MobileReleaseRow` swap `userGameId` for `igdbId` on their `onOpen` props. Lands in the same workstream that ships GD-PR1.

Everything else (region/platform date expansion, preorder links, news) stays on GameDetail S2.

### 5.5 Open questions

- **OQ-REL-1 — Region/platform date drilldown placement.** Cards stay compact; the drilldown is on GameDetail S2 only. ✅ **Locked.** Documenting here to flag we considered the alternative (expand-in-card) and rejected it (clutters the scan-density UI).
- **OQ-REL-2 — Events back-link chip variants.** Show on which card variants? Recommendation: wishlist + all (always) + recent (always) cards; *omit* on AgendaRail rows (single-line UI, no space). Mobile: include on MobileReleaseRow but as a smaller second line.
- **OQ-REL-3 — Per-platform wishlist context — display format.** When `wishlistedPlatforms` ⊊ `game.platforms`, render `// wishlisted: PS5 · Switch` vs the generic `// PS5 · Xbox · PC · Switch · iOS`. But what about the *opposite* case — wishlisted on platforms the user *doesn't have synced*? Show same way? Or call out as `// wishlisted on PS5 (not yet connected)`? Recommendation: same-way for v1; the "you wishlisted on a platform you don't own" UX is a Library / GameDetail concern, not a Releases-card concern.
- **OQ-REL-4 — In-bucket sort options.** Current sort within a bucket is release-date asc (hard-coded). Add hype-desc as an option? Alphabetical? Recommendation: defer until cohort signal demands it. Single sort keeps the UI simpler; the bucket-grouping is the primary organising principle, not within-bucket sort.
- **OQ-REL-5 — "Live now" highlight for today's releases.** Should games releasing *today* render with a distinct treatment on the main page (e.g. amber border + `// out today` chip)? Recommendation: yes, small chip. Cheap to compute (compare `releaseDate.toDateString() === today.toDateString()`); high information value at no UI cost.
- **OQ-REL-6 — Releases cards as "preview" of GameDetail S2?** B-IMDB hover-preview-style — desktop hover on a card opens a popover showing the screenshot carousel + countdown + description from GameDetail S2? Recommendation: **no.** Cards click-through cheaply already; hover popovers add interaction complexity and don't translate to mobile. Skip.

### 5.6 Sequencing notes

Releases doesn't need its own multi-PR workstream — the page is mostly done. The remaining work threads into the workstreams that own the relevant data:

- **Events back-link chip** ships in EV-PR3 (the GameDetail back-link wiring PR) — REL gets the chip by reusing the same `EventGame` query on a different surface.
- **Per-platform wishlist context** is a 1-PR enhancement on Releases standalone. Call it **REL-PR1**. Modest scope: ReleaseCard render logic update + 3-4 visual regression tests + mobile mirror. Could ship any time. **✅ Done 2026-05-30** — see landing notes at the end of this section.
- **Card route alignment** lands in GD-PR1 (the GameDetail v2 route migration PR) — same atomic commit since the route source-of-truth migrates with the destination.
- **"Live now" today-release chip** is another standalone REL-PR2 if/when prioritised. Smallest possible scope, no dependencies.

No standalone "REL-series" needed. The work threads into other workstreams + 1-2 small enhancement PRs.

#### REL-PR1 landing notes (2026-05-30)

- **Surface targeted (per §5.4 #2):** when `UserGame.wishlistedPlatforms ⊊ game.platforms`, replace the generic IGDB platform array with the user's wishlist subset prefixed `// wishlisted:` (desktop card) or `wish:` (mobile row + hero label `wishlisted on`). Empty `wishlistedPlatforms` OR full-set match falls back to today's generic rendering — no narrowing to surface.
- **Where the chip ships:**
    - `ReleaseCard` (all 3 variants — wishlist / all / recent) — `// wishlisted:` amber-prefixed platform-glyph row
    - `MobileReleaseRow` — inline `wish:` prefix on the meta line
    - `HeroCountdown` — `wishlisted on` amber label replaces the `platforms` heading when scoped
    - `AgendaRail` — **skipped** by spec analogy with OQ-REL-2 (single-line UI, no space for a prefix without redesigning the row)
    - `WishlistEmptyRecommendation` — **n/a** by construction (recommendations are pre-wishlist, so `wishlistedPlatforms` is empty → helper returns generic)
- **What shipped:**
    - `packages/types/src/index.ts` — `IgdbUpcomingRelease.wishlistedPlatforms: string[]` added (required field; empty `[]` when no UserGame join applies).
    - `apps/api/src/services/igdb.ts` — three factories (`getUpcomingReleases`, `getRecentlyReleased`, `getReleaseDetails`) default `wishlistedPlatforms: []`. The route layer enriches.
    - `apps/api/src/routes/igdb.ts` — `userGameMap` widened to return `{ id, wishlistedPlatforms }` per igdbId; both `scope='wishlist'` and other-scope branches now thread the field through. The Prisma select adds `wishlistedPlatforms: true` to the UserGame projection (one extra column on an already-running query — no new round trip).
    - `apps/api/src/routes/releases.ts` — `wishlistRowToUpcoming` takes `wishlistedPlatforms` as a 3rd arg; both `starred` and `hyped` branches join against UserGame and thread the field.
    - `apps/web/src/components/screens/releases/utils.ts` — new `pickWishlistedPlatformChips(release)` helper. Returns `{ mode: 'generic' | 'wishlist', platforms: string[] }`. Callers don't need to inspect `mode` to know which array to map over — `platforms` is always the array to render. `mode` only changes the prefix label + visual treatment.
    - `apps/web/src/components/screens/releases/ReleaseCard.tsx`, `MobileReleaseRow.tsx`, `HeroCountdown.tsx` — call `pickWishlistedPlatformChips`, render the amber prefix when scoped.
    - `apps/web/src/hooks/useUpcoming.ts` — IGDB-outage fallback path defaults `wishlistedPlatforms: []`. WishlistRelease doesn't carry the per-platform context (it lives on `UserGame.wishlistedPlatforms`, which requires the join). Acceptable degradation for outage fallback.
- **Edge cases handled by `pickWishlistedPlatformChips` (locked in tests):**
    - Empty `wishlistedPlatforms` → generic
    - `wishlistedPlatforms === platforms` (full-set match) → generic
    - `wishlistedPlatforms ⊊ platforms` (strict subset) → wishlist, returns the subset
    - `wishlistedPlatforms` contains a platform NOT in `platforms` (data drift — user wishlisted on a platform IGDB doesn't list / they don't have synced) → wishlist mode, render `wishlistedPlatforms` directly. OQ-REL-3 v1 recommendation explicitly accepts this; the "wishlisted on a platform you don't own" UX is a Library / GameDetail concern.
    - Empty `platforms` (IGDB hasn't surfaced platform data yet) + non-empty `wishlistedPlatforms` → wishlist mode (data drift bucket above)
    - Order preserved from `wishlistedPlatforms`, not from IGDB — user's stored intent wins
- **Tests:** 9 unit tests in new `pickWishlistedPlatformChips.test.ts` pinning every truth-table row + edge case. +3 visual regression tests in `primitives.test.tsx` (generic when empty, scoped subset, full-set fallback) + 2 in `mobile.test.tsx` (wish: prefix when scoped, hidden when empty). 5 existing test-fixture factories backfilled with `wishlistedPlatforms: []` default (`bucketing.test.ts`, `empty-state.test.tsx`, `mobile.test.tsx`, `primitives.test.tsx`, `ReleasesRecentDesktop.test.tsx`). **112/112 releases tests pass.** Full backend suite: **39 / 589** (unchanged from DASH-PR2; no regressions on igdb / releases route tests). Typecheck + lint + rename-rule + production build all clean.
- **Bundle delta:** ReleasesDesktop 18.57 → 18.68 kB (+0.04 kB gzipped); ReleasesMobile unchanged; other releases chunks negligible. The helper + chip-row markup are ~600 bytes total.
- **Sticky property for OQ-REL-3 v2 follow-up:** the data-drift case (`wishlistedPlatforms` contains entries NOT in IGDB's `platforms`) currently renders identically to a strict-subset — that was the v1 lock. If a future product-strategy session decides that "you wishlisted on a platform you don't own" deserves distinct visual treatment, the helper's return shape is ready to extend (add a `drift: boolean` flag or split `mode` into 3 values).

---

## 6. Events (new top-level surface)

### 6.1 Purpose

Events is the surface that turns IGDB's per-showcase data into a discovery instrument for *what was announced and where*. The shape rhymes with GameDetail's state-pair split — there's a clear difference between an event you missed (retrospective: "what did they show?") and an event you're anticipating (prospective: "when does it air, where can I watch?").

User jobs:
1. **"I missed [State of Play / Direct / Showcase] — what was announced?"** (retrospective, the primary job per Andrea's framing)
2. **"What's coming up?"** — browse upcoming events to know when to tune in
3. **"Is anything happening right now?"** — live-event awareness
4. **"What game came out of which event?"** — trail-tracing from games back to their reveal moment
5. **Discovery loop** — drilling from event → game → wishlist, then back to the event's other games

The page is net-new. No equivalent surface exists in Hoard today.

### 6.2 Current state

*Does not exist.* Closest adjacency in Hoard's current surface set:
- Releases page surfaces upcoming game release dates but not the *announcement provenance* (what showcase a game was revealed at)
- GameDetail v2 reserves an "Shown at events" cross-link slot (OQ-GD-7), gated on this page existing
- Sidebar nav has no Events entry yet

### 6.3 Gaps vs benchmark

| Gap | Sources | Notes |
|---|---|---|
| No Events page at all | B-IGDB-1 | The entire surface — list view + detail view + sync pipeline |
| No game ↔ event association data | B-IGDB-1 | New schema: `Event` table + `EventGame` join + IGDB sync. The IGDB `events` endpoint returns a `games` field — direct join data, no inference needed |
| No "you missed it" surfacing | B-IGDB-1, B-IMDB-1 (countdown adjacency) | Events that aired since the user's last visit could be highlighted on Dashboard. Adjacent to the Dashboard analysis (§7) |
| No live-stream embedding when an event is in progress | B-IGDB-1 | IGDB events carry a `live_stream_url` field on some entries; YouTube/Twitch embeds during the airing window |
| No back-link from GameDetail to events | B-IGDB-2 | GameDetail v2 placeholder slot exists (OQ-GD-7); requires Event data to render meaningfully |

### 6.4 Target state — two views, two moods

The page renders as a *pair of views* with two clear time-axis states:

| View | URL | Time-axis state | Mood |
|---|---|---|---|
| List | `/events` | mixes upcoming + past, sectioned | scan-and-browse |
| Detail (upcoming) | `/events/:slug` (start_time > now) | prospective | anticipation — countdown dominant |
| Detail (past) | `/events/:slug` (end_time < now) | retrospective | archive — game grid dominant |
| Detail (live) | `/events/:slug` (start_time ≤ now ≤ end_time) | in-progress | live banner + stream embed dominant |

**List view (`/events`) element shape:**

```
// EVENTS · 14 upcoming · 247 past

┌─────────────────────────────────────┐
│ // next showcase                    │   ← Hero countdown card, reuses
│   SUMMER GAME FEST 2026             │     HeroCountdown component + useNow
│   ┌──┐┌──┐┌──┐┌──┐                  │     hook from Releases (live-ticks
│   │11││23││45││12│   d / h / m / s  │     1Hz, pauses on tab hidden)
│   └──┘└──┘└──┘└──┘                  │     → next-soonest upcoming event
│   geoff keighley · 2026-06-12 18:00 │     (dominant element at top of list)
│   [+ remind me]  [watch on yt →]    │
└─────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ // upcoming                                       │
│   ▣ Nintendo Direct           · 21d · Nintendo    │
│   ▣ Xbox Showcase 2026        · 26d · Microsoft   │
│   ▣ State of Play             · TBA · Sony        │
│                                                   │
│ // recent · last 30 days                         │
│   ▣ The Game Awards 2025      · 18 games · 14d ago│
│   ▣ Wholesome Direct 2025     · 32 games · 22d ago│
│                                                   │
│ // archive · 2025                                 │
│   ▣ ...                                           │
└──────────────────────────────────────────────────┘
```

The hero countdown at the top mirrors the Releases-page wishlist hero pattern exactly — same `HeroCountdown` component + same `useNow` hook (1Hz live tick, paused when `document.hidden`). Surfaces the *next-soonest upcoming event* across all networks, ungated by filter (always shows the actual next thing). Per-row countdowns in the upcoming-section list stay as static `21d` labels rather than live-ticking — keeps the list cheap to render.

Filter chips: `[ upcoming ] [ recent ] [ past ] [ live now ]` + network filter (see OQ-EV-6).

**Detail view (`/events/:slug`) element matrix:**

| Element | Upcoming | Live | Past |
|---|---|---|---|
| Event logo / cover | ✓ | ✓ | ✓ |
| Name + network + time-zone-aware date | ✓ | ✓ | ✓ |
| **Giant countdown** (reuses `HeroCountdown` + `useNow` from Releases) | **★ dominant** | — | — |
| **Live banner + stream embed** | — | **★ dominant** | — |
| **Game grid (announced/shown)** | ✓ (planned reveals if data is available) | ★ (filling in real-time if IGDB updates during stream) | **★ dominant** |
| Description | ✓ | ✓ | ✓ |
| `[+ remind me]` / `[+ add to calendar]` | ★ | — | — |
| Video recap embed | — | — | ★ |
| Watch-now stream link (deep-link out) | ✓ | ★ (also embeds) | — |
| Game-grid filter: my-platforms / wishlisted / all | — | ✓ | ✓ |
| Per-game card: cover + title + announcement-type chip (announced / shown / demo-released / released) | — *(if data exists)* | ✓ | ✓ |
| Total game count + "X of these are on your wishlist" personalisation | — | ✓ | ✓ |

Legend: ✓ = present · ★ = emphasised / visually dominant · — = absent.

Cards in the game grid each link to GameDetail (which handles States 1/2/3/4 internally), closing the discovery loop. The "back to event" link on those GameDetail pages is OQ-GD-7's placeholder slot.

### 6.5 Schema sketch

New Prisma models. Shape illustrative — exact field names + types lock during EV-PR1 planning.

```prisma
model Event {
  id            String   @id @default(cuid())
  igdbId        Int      @unique           // IGDB event ID — stable
  slug          String   @unique           // e.g. "state-of-play-2026-04"
  name          String
  description   String?
  startTime     DateTime
  endTime       DateTime?
  liveStreamUrl String?                    // YouTube/Twitch when IGDB has it
  timeZone      String?
  logoUrl       String?
  networks      Json?                      // [{name, type, url}, ...] from IGDB
  videos        Json?                      // [{youtubeId, name}, ...] recap clips
  games         EventGame[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([startTime])
  @@index([slug])
}

model EventGame {
  id               String @id @default(cuid())
  eventId          String
  gameId           String                  // FK to existing Game
  announcementType String?                 // "announced" / "shown" / "released" / null
  event            Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  game             Game   @relation(fields: [gameId], references: [id], onDelete: Cascade)
  @@unique([eventId, gameId])
  @@index([gameId])                         // "this game was at these events" lookup
}
```

Existing `Game` model gains a reverse relation: `events EventGame[]`.

The `EventGame.announcementType` field is null-default because IGDB doesn't strongly type the relationship — some events have it inferable from context, others don't. Worth ~30 lines of derivation logic at sync time if patterns are extractable from the IGDB data; safe to ship as always-null in EV-PR1 and enrich in EV-PR3.

### 6.6 Open questions

- **OQ-EV-1 — URL key.** Use IGDB's `slug` as the URL key (`/events/state-of-play-2026-04`) for shareability + memorability vs. opaque IGDB ID? **Recommendation: slug.** Cleaner share-links, easier debugging. Server resolves slug → IGDB ID → DB row.
- **OQ-EV-2 — Sync cadence.** ✅ **LOCKED 2026-05-29: nightly cron + admin-triggered manual refresh button.** Original tiered proposal (hourly upcoming / on-demand past / 5-min live) was over-engineered. The nightly job covers new-event discovery + community curation backfill; the manual `[refresh events]` button on the admin surface handles the "I want to see what just got added" case without infrastructure cost.
- **OQ-EV-3 — Dashboard "you missed" prompt.** Should Dashboard surface "X events aired since you last visited, with N games newly announced from your wishlist platforms"? **Recommendation: yes, but in the Dashboard drill session not the Events session.** Treat it as a Dashboard consumer of Events data, not a sub-feature of Events.
- **OQ-EV-4 — IGDB game-association completeness.** Some events have full game lists; others have nothing or a handful. Three options for sparse events:
    1. Show what we have + a "// game list is community-curated · X games linked so far" disclaimer
    2. Hide events with < N (e.g. 5) linked games entirely
    3. Show all events but sort sparse-data ones lower in the list
    **Recommendation: #1.** Even a sparse list is useful (especially right after the event airs, before community catches up); the disclaimer manages expectations honestly.
- **OQ-EV-5 — Live stream embedding.** ✅ **LOCKED 2026-05-29: embed inline + deep-link-out fallback rendered below.** CSP gains a `frame-src https://www.youtube.com https://player.twitch.tv` exception (small, scoped, well-understood pattern). Embed handles streaming UX natively (autoplay, fullscreen, captions, ads all server-side). Broken embeds (region-locked, uploader disabled embedding) degrade gracefully to the fallback `[watch on YouTube/Twitch →]` link rendered immediately below. Privacy outcome is identical between the two options — YouTube/Twitch see the visit either way; embed adds no Hoard-side surveillance.
- **OQ-EV-6 — Filter taxonomy.** Network filters (Nintendo / Sony / Xbox / Indie / Industry) — IGDB has `event_networks` but it's a free-form metadata field, not a simple enum. Two paths:
    1. Derive a small curated set (Sony / Nintendo / Xbox / Indie / Other) from network metadata heuristics during sync — robust but writes opinion into the data
    2. No network filter; rely on naming patterns + search instead — simpler
    **Recommendation: #2 for EV-PR1.** Add #1 in EV-PR2 only if the unfiltered list is actually painful at our event-count scale.
- **OQ-EV-7 — Past-events archive depth.** Show all past events ever, or limit? IGDB has events going back ~10+ years. Cheap to store; arguably useful for trail-tracing ("which Direct first showed Breath of the Wild?"). **Recommendation: store all, limit list-view default to last 24 months; deeper years accessible via filter or year-jump.**
- **OQ-EV-8 — Cross-link from `Game` to its events.** The `Game.events` reverse relation makes this a trivial query. GameDetail v2 OQ-GD-7's placeholder slot consumes it. **Sequencing decision: GameDetail v2 ships the placeholder; Events ships the data; the cross-link goes live when both are deployed.** No coordination beyond shipping order.
- **OQ-EV-9 — Mobile shape.** List view is naturally mobile-friendly (vertical list of cards). Detail view's *game grid* is the dense bit — on mobile compress to 2-column grid or vertical list with smaller covers. Worth a mockup pass during EV-PR4.
- **OQ-EV-10 — `[+ remind me]` and calendar export.** ✅ **LOCKED 2026-05-29: `.ics` file download in EV-PR1, per-vendor deep-links (Google / Apple / Outlook) in EV-PR2.** This matches the dominant industry pattern (TheGameAwards, Eurogamer, IGN, Gamescom all do `.ics`) and adds no infra debt. The per-vendor deep-links in EV-PR2 are a ~30-line URL-builder enhancement — Google Calendar accepts a `google.com/calendar/render?action=TEMPLATE&...` URL pattern; Outlook has its own URL shape; Apple uses the same `.ics` file. Subscription feeds (`webcal://`) and in-app push notifications are explicitly deferred — they need infrastructure Hoard doesn't have yet (PWA push subscriptions / email service / dedicated notifications channel) and `.ics` covers the actual reminder use case without it.

### 6.7 Sequencing notes

Events ships as its own workstream — call it EV-series:

- **EV-PR1 — Foundation.** Schema (`Event` + `EventGame` + Game reverse relation), IGDB sync service (`apps/api/src/services/events.ts`), sync route (`POST /api/admin/events/sync` for manual trigger + cron entry), list view `/events`, detail view `/events/:slug`, sidebar nav integration. **Smallest shippable version** — basic list + detail, no filtering beyond upcoming/past sections, no live embedding, no "you missed" Dashboard prompt.
- **EV-PR2 — Filter + search + grouping.** Filter chips, search by name, year-jump in past archive, game-grid filter (my-platforms / wishlisted / all).
- **EV-PR3 — Live + Dashboard prompt + announcement-type derivation.** Live-stream embedding, Dashboard "you missed" widget, `EventGame.announcementType` derivation logic at sync time, GameDetail back-link wiring (closes the OQ-GD-7 placeholder).
- **EV-PR4 — Polish.** Mobile layout pass, axe-core a11y verification, `[+ remind me]` `.ics` export.

The standalone dependency: this workstream unblocks GD-PR5's "Shown at events" placeholder slot on GameDetail v2. GD-PR1–4 can ship without Events; the back-link slot stays placeholder until both EV-PR3 + GD-PR5 deploy.

Net-new infrastructure considerations:
- New IGDB endpoint integration (`events` + nested `games` query)
- New cron job (cadence per OQ-EV-2)
- New schema (2 tables + 1 reverse relation)
- CSP exception for YouTube + Twitch embedding (lands with OQ-EV-5)
- ITAD-style "let cron own the freshness; render from DB" pattern reused

---

## 7. Dashboard

### 7.1 Purpose

Dashboard is the *front-door synthesis surface*. Distinct from every other page — Library is "manipulate your collection", Releases is "what's coming", Events is "what was announced", GameDetail is "act on a specific game", Deals is "right-now buying opportunities" — Dashboard is *"what's the state of my hoard right now?"*. It's the only page that *consumes data from every other surface*.

The post-2026-05-29 expansion gives the Dashboard substantially more material to synthesize:
- Cross-page activity signals (Events you missed, Deals expiring, Pending-review)
- Per-collection summaries (B-Stash-4)
- Recently-completed archivist relics (B-Hoard-1)
- Rating distribution (B-Stash-3)
- IGDB-tag-triple breakdowns (B-IGDB-3 — genre + theme + perspective)
<!-- pace aggregate rejected 2026-05-30 — see §7.4 identity-values rejection -->

User jobs:
1. **"What's going on since I last looked?"** — actionable callouts at top (events missed, deals expiring, pending-review)
2. **"What am I actively playing?"** — current rotation, last-played, resume affordances
3. **"What's coming up I care about?"** — wishlist countdown, next event countdown
4. **"How am I doing?"** — completion ratios, activity heatmap, distributions
5. **"What should I play next?"** — backlog picker / shuffle (key decision #4 preserved)
6. **Quiet collector reflection** — recently-completed archivist relics, collection-completion progress

The page rhymes with the *terminal-companion* identity per N6 — a status readout that's information-dense but scannable, not a wall of stats.

### 7.2 Current state

Post-Phase-8 + post-PR-5 work:

- **Stats from `/api/dashboard`** — counts per status, ratios
- **Backlog picker + shuffle** (key decision #4 preserved — random game from backlog, weighted toward shorter HLTB + games already started)
- **Now-playing card** (tappable, links to GameDetail)
- **Genre breakdown panel** (proportional bars, IGDB genres)
- **HLTB completion-ratio gauge**
- **Achievements rollup (T6)** — earned/total/percent aggregated across the library
- **Activity heatmap** — 24-week column-major grid, mobile slices rightmost 16, fed by real `lastPlayedAt` (not synthetic)
- **Upcoming widget** — "see full upcoming feed →" link, single next-soonest wishlisted release shown with countdown
- **Empty/first-run state** — CTA panel ("connect a platform / add a game")
- **Retry button** on data-fetch error
- **Pull-to-refresh on mobile** (Phase 8 PR 5)
- **Mobile parity port complete** — backlog picker, tappable now-playing, genre breakdown all present

What was deliberately *removed or rejected*:
- `[resume]` / `[log session]` / `[+ note]` action buttons on the now-playing card — were dead UI on desktop too (Phase 8 PR 4 decision)
- Quick-sync trigger from Dashboard / Sidebar — Settings → Platforms has the sync-all button; Dashboard adds discoverability without adding capacity (deferred to v2)

### 7.3 Gaps vs benchmark + cross-page dependencies

Less external benchmark pressure than other pages — Stash has no Dashboard analogue, IMDB/HLTB don't ship a personal-dashboard view. The gap is mostly *internal*: Dashboard hasn't kept pace with the cross-page expansion of the rest of the spec.

| Gap | Source / dependency | Notes |
|---|---|---|
| No "you missed since last visit" surfacing | B-IGDB-1 / Events (§6 OQ-EV-3 explicitly named Dashboard as consumer) | Events that aired since the user's last visit — especially ones with new games on their wishlist platforms |
| No Deals callout | Deals (§8) / B-Storefront-2 | Wishlist games currently on sale, top 3-5 with discount % |
| No pending-review surfacing | Q-series / §4 (Library has a callout too — Dashboard mirrors it for cross-app visibility) | Sync-derived rows that matched at low confidence; needs user attention |
| No recently-completed archivist relics rail | B-Hoard-1 / §3 GameDetail S4 | Chronological wall of recently-completed games rendered with their archivist artifacts. The Dashboard equivalent of *"trophies on the shelf"* |
| No per-Collection summary | B-Stash-4 | "Pokemon completionist: 18/24 · 3 in Backlog" — quick completion progress per personal Collection |
| No rating distribution chart | B-Stash-3 | Once the column exists, a small histogram of "your ratings" |
| Genre breakdown only — no theme / perspective breakdowns | B-IGDB-3 | Today's genre panel becomes a 3-tab strip (genre · theme · perspective) once B-IGDB-3 lands |
| No "this week" / "this month" / "this year" framing | (no benchmark; potential adjacency to deferred Stats/Wrapped — AGENT.md #3) | Activity heatmap is the only time-axis surfacing today; lacks any "X games completed this year" / "Y hours logged this month" framing |
| `[resume]` / quick-action affordances absent on now-playing | (Hoard UX gap) | Today's card is tappable → GameDetail. Could expose `[+ minutes]`, `[mark completed]`, `[+ note]` inline once the State 3 GameDetail edit affordances ship (GD-PR3) |

### 7.4 Target state — bento-box grid layout

The Dashboard adopts a **bento-box** layout: 12-column CSS grid with variable card spans. Card *size* communicates importance; horizontal space carries information; the terminal-aesthetic translates well (each card is its own readout panel with header glyphs, like windows in a tmux session). Mobile collapses to single column by span-order.

Why not a 4-zone vertical stack (the earlier proposal, rejected 2026-05-30): vertical-only wastes desktop's horizontal real estate, flattens visual hierarchy to "first row vs second row," forces reader-flow when a dashboard needs scan-flow, and makes every section feel equally weighted.

```
// HOARD · DASHBOARD

┌─ alerts ──────────────────────────────────────────────────────────────────┐
│ ⚠ 4 entries need review · ⚡ TGA 2025 aired · 18 games · 🏷 5 deals  ⋯    │  ← slim, dismissible chips
└───────────────────────────────────────────────────────────────────────────┘    only renders when content
[span-12 · slim alert strip]

┌─ now playing ─────────────────────────┐ ┌─ next release ─┐ ┌─ next event ─┐
│ ELDEN RING SHADOW OF THE ERDTREE       │ │ SILKSONG       │ │ SGF 2026     │
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ 47h                   │ │ ┌─┐┌─┐┌─┐┌─┐   │ │ ┌─┐┌─┐┌─┐┌─┐ │
│ last played 4h ago                     │ │ │11││23││45││12││ │ │11││23││45││12││
│ [+min] [done] [+note]                  │ │ d  h  m  s     │ │ d  h  m  s   │
├─ active rotation (Playing × 3) ────────┤ │ [see all →]    │ │ [see all →]  │
│ Hollow Knight · 13h · OnHold           │ └────────────────┘ └──────────────┘
│ Cyberpunk 2077 · 24h · OnHold          │
└────────────────────────────────────────┘
[span-6 · primary hero]                   [span-3 · countdown]  [span-3 · countdown]

┌─ backlog picker ───────────┐ ┌─ completion ───────────┐ ┌─ achievements ─────┐
│ HOLLOW KNIGHT              │ │ 287/488 · 58%          │ │ 3421/6778          │
│ ★★★★☆ · 25h HLTB           │ │ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮       │ │ ▮▮▮▮▮▮▮▮▮▮ 50%     │
│ [shuffle]                  │ │ this year ▾            │ │ this year ▾        │
└────────────────────────────┘ └────────────────────────┘ └────────────────────┘
[span-4]                       [span-4]                   [span-4]
                               ← time-axis toggle shared between completion + achievements →

┌─ recently completed · relics rail ────────────────────────────────────────┐
│ ▢▢▢▢▢▢▢▢ ⟶                                       [browse all completed →] │
│ Game A · Game B · Game C · Game D ...                                     │
└───────────────────────────────────────────────────────────────────────────┘
[span-12 · horizontally-scrolling rail, archivist relics from B-Hoard-1]

┌─ breakdown ───────────────────────┐ ┌─ collections ──────────────────────┐
│ [ genre | theme | perspective ]   │ │ Pokemon completionist 18/24 ▮▮▮ 75%│
│ RPG ▮▮▮▮▮▮▮▮▮▮▮ 87                │ │ Cyberpunk vault         8/8  ▮▮▮▮ 100%│
│ Action ▮▮▮▮▮▮▮▮ 64                │ │ Dad's PS2 favorites    11/16 ▮▮▮ 69%│
│ Strategy ▮▮▮▮ 32                  │ │ [+ new collection]                 │
└───────────────────────────────────┘ └────────────────────────────────────┘
[span-6 · B-IGDB-3]                   [span-6 · B-Stash-4]

┌─ rating distribution ─────────────┐ ┌─ (reserved future slot) ───────────┐
│ 1 2 3 4 5 6 7 8 9 10              │ │ year-in-review / wrap-up (OQ-DASH-9)│
│ ▁ ▁ ▂ ▃ ▄ ▅ █ █ █ █               │ │                                     │
└───────────────────────────────────┘ └────────────────────────────────────┘
[span-6 · B-Stash-3]                   [span-6 · reserved]

┌─ activity heatmap ────────────────────────────────────────────────────────┐
│ M [▢▢▢▣▣▢▢▢▣▣▣▣▣▣▢▢▢▣▣▣▣▣▣▢]                                              │
│ T ...                                                                     │
└───────────────────────────────────────────────────────────────────────────┘
[span-12 · full-width temporal strip]
```

**Visual hierarchy via card size:**

| Card size | Communicates | Examples |
|---|---|---|
| `span-12` slim strip | Highest-priority transient signal | Alerts strip (top) |
| `span-6` hero card | Primary user state | Now-playing + active rotation |
| `span-3` countdown card | Time-sensitive anticipation | Next release · Next event |
| `span-4` stat card | Discrete personal measurable | Backlog picker · Completion ratio · Achievements |
| `span-12` rail | Horizontally-scrollable collection | Recently-completed relics |
| `span-6` panel | Comparative / breakdown | Breakdown · Collections · Rating distribution · (reserved year-in-review slot) |
| `span-12` temporal | Calendar-density data | Activity heatmap |

**Scan-flow this enables:**
- Eye lands top-left (largest card = now-playing) → answers "what am I playing?"
- Glances top-right (countdown pair) → answers "what's coming?"
- Drops to stat row → "how am I doing?"
- Scrolls only if reflective intent (relics / breakdowns / heatmap)

**Mobile collapse:** the 12-column grid collapses to 1-column with cards stacking in span-order: alerts strip → now playing → next release → next event → backlog picker → completion → achievements → relics rail → breakdown → collections → rating → heatmap. Natural vertical reading on mobile; the bento layout is desktop-specific.

**Per-card element matrix:**

| Card | Span | Default state (today) | Ships when |
|---|---|---|---|
| Alerts strip — Pending review callout | 12 (slim) | absent | Q-series |
| Alerts strip — Events "you missed" callout | 12 (slim) | absent | EV-PR3 |
| Alerts strip — Deals "X wishlist games on sale" callout | 12 (slim) | absent | Deals workstream (§8) |
| Alerts strip — Sync-error banner | 12 (slim) | absent | DASH-PR3 (small standalone PR) |
| Now playing + active rotation | 6 | ✓ today (tappable, no inline actions) | — |
| Now playing inline actions (`[+min]` etc.) | (inside) | absent | GD-PR3 (edit affordances) |
| Next release countdown | 3 | ✓ today (single line link) | promote to dominant HeroCountdown in DASH-PR1 layout rework |
| Next event countdown | 3 | absent | EV-PR1 (HeroCountdown reuse) |
| Backlog picker / shuffle | 4 | ✓ today | — |
| Completion ratio gauge | 4 | ✓ today | — |
| Achievements rollup (T6) | 4 | ✓ today | — |
| Recently-completed relics rail | 12 | absent | B-Hoard-1 (visual treatment ships first) + GD-PR4 |
| Breakdown panel (genre/theme/perspective tab strip) | 6 | ✓ today (genre only) | tabs land when B-IGDB-3 ships |
| Collections summary | 6 | absent | B-Stash-4 |
| Rating distribution chart | 6 | absent | B-Stash-3 |
| Year-in-review / wrap-up slot | 6 | reserved | OQ-DASH-9 future workstream |
| Activity heatmap | 12 | ✓ today | — |

Progressive-disclosure: cards that don't have data simply don't render; the grid reflows around them. A first-run user sees only the cards that have content (empty Dashboard → first-run CTA panel), not empty placeholders for un-shipped features.

**Identity-values rejection captured 2026-05-30:** the *user-vs-community HLTB pace aggregate* originally proposed as a Dashboard card was **rejected** on identity grounds — Hoard is personal-tool, not community-comparative. Aggregating per-game pace into a single library-level "you're +14% slower than the community" signal starts to feel like a leaderboard framing Hoard explicitly avoids (sibling rejections: reactive scoring emojis, community-aggregate stats — see §2 B-Stash values divergence). Per-game pace stays on GameDetail S3/S4 (single-game contextual signal — "your time on *this* game vs the community-main time on *this* game") because that's contextual, not comparative-across-collection.

### 7.5 Open questions

- **OQ-DASH-1 — Card-stack ordering on mobile.** The bento grid collapses to single column on mobile; cards stack in span-order. Two choices:
    1. **Fixed by importance** — alerts strip → now-playing → countdowns → stats → relics → breakdowns → heatmap. Same order every visit.
    2. **Personalized ordering** — recently-active users see now-playing at top; inactive users see countdowns; etc.
    Recommendation: **#1.** Predictable position-by-importance beats clever personalization. Mobile scroll is fine; we already do it for Library.
- **OQ-DASH-2 — Alerts strip callout count cap.** If a user has 4 pending-review + 3 events missed + 8 deals + (future) sync-error notice + (future) new-feature announcement, the alerts strip gets noisy. Cap at N visible callouts (e.g., 3) + a `[+ N more in alerts]` overflow chip? Or always show all? Recommendation: **cap at 5 visible, then collapse the rest into `[+ N more]`.** Order callouts by actionability (pending-review first because it asks for user judgment; events second because they're time-limited but passive; deals third).
- **OQ-DASH-3 — "Last visit" definition for the events-missed widget.** `session.opened` event timestamp (already captured per TL1.2 telemetry)? Or `lastSeenDashboardAt` column on User? Recommendation: **reuse `session.opened` — last 24h-throttled session timestamp.** Don't add a new column.
- **OQ-DASH-4 — Now-playing card: 1 game vs N.** If a user has 3 Playing games, do we show one (last-played) or all three? Recommendation: **show last-played as the primary card; render compact rows for the other Playing games below.** "Active rotation: 3 games" subheading.
- **OQ-DASH-5 — Archivist relics rail order.** Chronological by `completedAt` desc (most recent first) seems obvious. Alternative: sort by rating, sort by playtime invested. Recommendation: **chronological desc, with the option to click `[browse all completed →]` to land at `/library/Completed` for richer sorting.**
- **OQ-DASH-6 — Backlog picker once Collections exist.** Should the picker pull random from full backlog (today) or from a user-selected Collection (when B-Stash-4 ships)? Or both (picker has a Collection filter)? Recommendation: **add a Collection filter to the picker post-B-Stash-4** — "shuffle within: All Backlog ▼ / Pokemon completionist / Cyberpunk vault / …". Keeps decision #4 intact (default = all backlog), unlocks per-collection shuffling for users who curate.
- **OQ-DASH-7 — Breakdown panel: tabs vs all-three-stacked.** Genre + theme + perspective as a 3-tab strip (tap to switch) vs. all three breakdowns rendered as 3 stacked panels? Tab strip is denser; stacked is more discoverable. Recommendation: **tab strip with genre as default**, but if usage signal shows users want comparison-at-a-glance, revisit. Each tab persists last-selected via URL query param (`?breakdown=theme`) so it survives reload.
- **OQ-DASH-8 — Stats time-axis framing.** "X games completed this year" / "Y hours logged this month" — should the Dashboard surface these explicitly, or stay with the all-time-cumulative framing of today's ratios? Recommendation: **add a small `// this year` / `// this month` / `// all time` toggle above the completion-ratio + achievements cards** — same toggle drives both. Activity heatmap already shows 24-week temporal slice; the rest is currently cumulative-only.
- **OQ-DASH-9 — Reconsider AGENT.md decision #3 (Stats/Wrapped deferred).** OQ-LIB-6 already flagged this — once Collections + Rating + Reference data ship, the wrap-up has substantially richer raw material. Dashboard is the natural home for a year-in-review surface (annual roll-up panel, "your 2026 in games"). Worth a future product-strategy session post-B-Stash-3/4/5. **Not blocking any current Dashboard work.**
- **OQ-DASH-10 — Quick-action affordances on now-playing.** Today's card is tappable → GameDetail (read-only on the card itself). Once GD-PR3 ships State 3 edit affordances, the Dashboard card could surface `[+ minutes]` / `[mark completed]` / `[+ note]` inline so the user doesn't have to drill into GameDetail just to log a quick session. Recommendation: **yes, but only for manual platforms** — per the F1-PR5 lock, manual playtime edits are only available for non-synced platform codes. Card affordances respect that gating.
- **OQ-DASH-11 — Dashboard widget for Hoard-system events** (sync failures, new platform connected, beta-feature releases). Today the only system-level surface is the Settings → Platforms log tab. Should Dashboard mirror critical system events in the alerts strip? Recommendation: **only for sync-error states** — if a connected platform has `syncStatus = 'error'`, surface a banner in the alerts strip. Other system signals stay in Settings.

### 7.6 Sequencing notes

Dashboard is the *most-threaded* page — almost every new section ships as a consumer of another workstream rather than as its own workstream. There's no "DASH-series" needed beyond the layout rework itself.

| Dashboard addition | Ships with |
|---|---|
| Alerts strip — Pending review callout | Q-series (writes the data; Dashboard reads it) |
| Alerts strip — Events "you missed" callout | EV-PR3 (Events workstream owns this widget; resolves OQ-EV-3) |
| Alerts strip — Deals callout | Deals workstream §8 |
| Alerts strip — Sync-error banner (OQ-DASH-11) | Standalone DASH-PR3 — small |
| Now-playing card — inline edit affordances | GD-PR3 |
| Next event countdown card | EV-PR1 (HeroCountdown reuse — already designed for §6) |
| Next release countdown — promoted to dominant card | Ships in DASH-PR1 layout rework — minimal scope |
| Recently-completed relics rail | OQ-GD-13 design resolution → GD-PR4 → Dashboard wires it in |
| Breakdown panel → genre/theme/perspective tab strip | B-IGDB-3 |
| Collections summary card | B-Stash-4 |
| Rating distribution card | B-Stash-3 |
| Year-in-review / wrap-up card (reserved slot) | OQ-DASH-9 → future workstream once underlying data primitives ship |

**Standalone Dashboard work** that doesn't wait on anything:
- **DASH-PR1 — Bento-box layout rework. ✅ Done 2026-05-30.** Refactor today's flat single-column layout into the 12-column bento grid. Renders existing sections as cards with their assigned spans (alerts strip · now-playing hero · countdowns · stat cards · breakdown · activity heatmap). No new data, just structural rework — every existing section keeps its current behaviour, just becomes a span-sized card. Mobile collapses to single column in span-order. **The skeleton everything else fills into.** See landing notes below.
- **DASH-PR2 — Time-axis toggle. ✅ Done 2026-05-30.** Adds `// this year / this month / all time` toggle above completion ratio + achievements rollup cards. Server changes: dashboard endpoint accepts a `?period=` param; aggregates re-compute. Modest scope. See landing notes below.
- **DASH-PR3 — Sync-error banner in alerts strip. ✅ Done 2026-05-30.** Surfaces `Platform.syncStatus = 'error'` as a banner. Adjacent to but independent of the bigger callouts that thread in via other workstreams. First entry into the bento alerts-strip surface. See landing notes below.

Everything else threads in. Dashboard doesn't need its own large workstream — it's the *integrator* of others. Sensible to ship **DASH-PR1 (bento-box layout)** before too many feature workstreams land so they all snap into the new grid cleanly rather than having to refactor the layout for each.

#### DASH-PR1 landing notes (2026-05-30)

- **Decisions confirmed before write:**
    - The `// the hoard · in numbers` 8-tile stat grid (TOTAL OWNED / COMPLETED / PLAYING / BACKLOG / ON HOLD / DROPPED / WISHLIST / TOTAL PLAYED) was **removed entirely** — informationally redundant with sidebar shelf counts + the new dedicated cards. The bento can breathe.
    - The multi-card `// wishlist · dropping soon` panel was **replaced by a single dominant `NextReleaseCountdown` (span-3)** + `see all →` link to `/releases`. Per spec §7.4 — Dashboard answers "what's next?" with the next single release; the multi-item view lives on `/releases`.
- **What shipped:**
    - New `apps/web/src/components/screens/dashboard/NextReleaseCountdown.tsx` — compact span-3 card with live 1Hz d/h/m/s tick (reuses `useNow(1000)` + `countdownParts`). Distinct from the wider `/releases` HeroCountdown (180×240 cover); same behaviour, narrower footprint.
    - `BentoCard` wrapper component (inline in `DashboardDesktop.tsx`) — applies `gridColumn: span N` + `data-bento-span` introspection attr + the existing `.panel` styling. Span sizes communicate importance per §7.4 visual-hierarchy table.
    - Greeting + bignum + system status hero row stays **above** the bento grid (terminal-aesthetic-y personal touch; doesn't fit the span pattern).
    - Bento layout (desktop, 12-col):
        - Row 1: `now-playing+rotation (span-6)` · `next-release-countdown (span-3)` · empty 3-col tail (EV-PR1 fills with next-event countdown later).
        - Row 2: `backlog-picker (span-4)` · `completion-gauge (span-4)` · `achievements-gauge (span-4)`.
        - Row 3: `genre-breakdown (span-6)` · `hours-by-platform (span-6)`. The "hours by platform" ASCII chart slots into the year-in-review reserved half — kept on Dashboard until OQ-DASH-9 ships, then displaced.
        - Row 4: `activity-heatmap (span-12)`.
        - Slim alerts strip span-12 deliberately absent — threads in via Q-series / EV-PR3 / DASH-PR3 / Deals as callouts arrive (progressive disclosure).
    - **Active rotation sub-section on now-playing card** — when `nowPlaying.length > 1`, renders compact rows below the hero for the other Playing games (`// active rotation · playing × N`). Spec §7.4 ASCII mockup landed without extending the API (`nowPlayingRaw` already returns up to 3 sorted by `lastPlayedAt desc`).
    - Mobile collapses to 1-col in OQ-DASH-1 #1 fixed-by-importance order: `now-playing → next-release → backlog → completion → achievements → breakdown → platforms → heatmap`. The 4-tile mobile stat grid was removed alongside the desktop 8-tile grid for consistency.
    - GD-PR3 inline edits (`[+min]` / `[done]` / `[+note]`) explicitly out-of-scope per §7.4 matrix — they ship with the GameDetail State 3 workstream.
- **Bundle delta:** DashboardDesktop chunk 15.18 kB (gzip 4.23 kB), DashboardMobile 11.41 kB (gzip 3.48 kB), initial JS `index-CBdT25FT.js` 257.05 kB / 81.73 kB gzipped — modest gzip increase vs. the prior baseline consistent with adding `NextReleaseCountdown` + bento wrapper logic; no concerning bloat.
- **Tests:** 8 new in `apps/web/src/components/screens/__tests__/Dashboard.bento.test.tsx` — bento-grid card presence + correct `data-bento-span` per §7.4 (size = importance regression guard) + active rotation conditional rendering + NextReleaseCountdown surfaces the next wishlist title + the two **removed sections stay removed** as anti-regression pins (the 8-tile stat grid + the multi-card wishlist panel are easy to accidentally re-add). Mobile asserts the OQ-DASH-1 fixed-by-importance card order. Plus an in-scope React key warning fix (the system status `.map` was rendering Fragments with keys on children, which React drops — moved key to `React.Fragment`).
- **What's expected for the next contributor of any DASH addition:** add the card via `<BentoCard span={N} testId="card-foo">`. Mobile auto-folds in `[data-testid^="card-"]` order — the test pins desktop layout + mobile order, so adding cards to the desktop grid in a different position will fail tests on both axes (caught early). Reserve the alerts strip as `span-12` at the top of the grid (no slot today, but render at `gridColumn: '1 / -1'` when callouts arrive).

#### DASH-PR2 landing notes (2026-05-30)

- **Semantics confirmed before write** (resolving OQ-DASH-8): the toggle is **engagement-scoped**. `// this year` and `// this month` aren't "X completions logged in the period" (we don't have `completedAt` or per-achievement timestamps); they're "stats AMONG UserGames whose `lastPlayedAt` falls in the period." Reads as *"of the 47 games you played in 2026, 12 are completed (26%)."* Tractable from current schema; intuitive *your-year-in-games* framing; matches the activity heatmap's lastPlayedAt-based temporal slice.
- **Andrea-driven iteration 2026-05-30 (post-first-pass eyeball):** the v1 split that put a copy of the toggle inside *each* of the completion + achievements cards felt redundant — *"if this is the intended logic then the two widgets don't have to be separated, but unified so the control is shown once."* Merged into **one combined `card-progress` (span-8)** with completion + achievements as two halves inside, divided by a hairline. Toggle in the card header, shown once. **DASH-PR1's row 2 layout updated:** `backlog-picker (span-4) | card-progress (span-8)` — was `(4) | (4) | (4)`. Mobile collapses to stacked vertical halves inside one panel divided by a horizontal rule. When achievements data is absent for the active period, the divider + right half are hidden and completion fills the card. The original spec §7.4 ASCII still shows two cards for backward compatibility; this is the lock that overrides it.
- **No-flicker fix in the same iteration:** clicking a chip used to flash the bento back to the loading skeleton because the cache key change (`dashboard` → `dashboard:year`) momentarily set `data=undefined`. Now uses a `lastGoodRef` per Dashboard component — once any payload has loaded, period switches fall back to it while the new one fetches in the background. Toggle chip flips immediately (state is synchronous); numbers update when the new fetch resolves. The loading skeleton only fires on cold start (no data ever).
- **Achievements card uses the same scope** — sums all-time achievement counts on the games last-played in the period. Card label stays `// achievements` (now an inner half-label inside the progress card); the toggle just narrows the set of games being summed. When period ≠ all-time and no engaged game has achievement data, the right half progressive-discloses (hidden, completion expands to full card width).
- **Period-scoped fields are additive on `DashboardStats`, not in-place overwrites:** top-level `completedCount` / `totalGames` / `completionPct` / `achievementsRollup` stay all-time (the greeting header + other cumulative surfaces depend on them). New `period: 'all' | 'year' | 'month'` + `periodStats: { completedCount, totalGames, completionPct, achievementsRollup }` carry the scoped variants. When `period === 'all'`, `periodStats` is collapsed server-side to mirror the all-time values so the frontend has no branching.
- **What shipped:**
    - `packages/types/src/index.ts` — new `DashboardPeriod` type + `DashboardPeriodStats` interface; `DashboardStats` extended with `period` + `periodStats`.
    - `apps/api/src/routes/dashboard.ts` — new `parsePeriod(req.query.period)` (unknown values silently collapse to `'all'`, no 400 — the toggle UI only emits the three known values) + `periodStart(period)` (UTC, start-of-current-calendar-month / start-of-current-calendar-year / null for `all`). Single iteration over `aggUserGames` now tallies the all-time rollup AND the engagement-scoped tallies in one pass. Dropped the separate `achievementsRows` query — its `achievementsByPlatform` select rides along on `aggUserGames` since the new period semantics already need both `status` and `achievementsByPlatform` on the same row.
    - `apps/web/src/components/screens/dashboard/PeriodToggle.tsx` (new) — three-state `[ this year | this month | all time ]` chip group with `role="radiogroup"` + `role="radio"` semantics. **One instance** per Dashboard component, mounted in the combined `card-progress` header (post-Andrea-iteration; was two instances pre-iteration).
    - `apps/web/src/hooks/useDashboard.ts` — accepts a `DashboardPeriod` arg (default `'all'`). Cache key is the legacy `'dashboard'` for the default + `'dashboard:year'` / `'dashboard:month'` for the scoped variants — `cache.invalidate('dashboard')` prefix-matches all three, so existing mutation invalidation continues to cover the new keys without per-mutation changes.
    - `apps/web/src/lib/api.ts` — `api.dashboard(period?)` omits the query param when `period === 'all'` (keeps URLs clean + matches server default).
    - `DashboardDesktop` + `DashboardMobile` — both lift `const [period, setPeriod] = useState<DashboardPeriod>('all')` at the parent and `useRef<DashboardResponse | null>(null)` for stale-while-revalidate (no skeleton-flash on chip click). The combined `card-progress` reads from `stats.periodStats.*` instead of the top-level all-time fields; greeting header still reads all-time.
- **Tests:** +7 backend in `dashboard.test.ts` (default period = all + unknown period silently collapses + period=year denominator + period=month boundary + null lastPlayedAt excluded + period-scoped achievements rollup + top-level all-time stats unaffected by period) → **39 backend suites / 589 tests pass** (+7 vs DASH-PR1's 582). +4 frontend in `Dashboard.bento.test.tsx` post-iteration: (i) exactly one `[role="radiogroup"]` in the combined `card-progress` (not duplicated per half) — pins Andrea's *"show the control once"* call; (ii) defaults to `period='all'` and reads from `periodStats` not top-level (sample fixture intentionally diverges the two so the binding source is unambiguous); (iii) clicking year chip refetches with `?period=year` and both halves of the progress card update together; (iv) **no skeleton-flash regression guard** — bento stays mounted while a new period is in flight, previous values remain visible (stale-while-revalidate via `lastGoodRef`). Plus 4 in `api-dashboard.test.ts` (default / explicit-all / year / month URL encoding) + 1 in `api-invalidation.test.ts` (`cache.invalidate('dashboard')` covers all period suffixes). **48/48 across targeted vitest scope.** Typecheck + lint + rename-rule + production build all clean.
- **Bundle delta (post-iteration):** DashboardDesktop chunk 15.18 → 16.10 kB (+0.19 kB gzipped), DashboardMobile 11.41 → 12.01 kB (+0.17 kB gzipped), initial JS index 257.05 → 257.08 kB (+30 bytes gzipped, type-only). Combined card + lastGoodRef + PeriodToggle add ~0.4 kB gzipped across both — still negligible.
- **Sticky property for future DASH workstreams that add cards reading period-scoped data:** the toggle owner is the parent (Desktop / Mobile component), single source of truth — new period-scoped cards should accept `period` as a prop OR call `useDashboard(period)` if they need the same payload. Don't introduce a second period-state owner. **AND if a card's data shares the same period scope as another card, merge them rather than duplicating the toggle** — the v1 split into two cards was the visual mistake Andrea caught on first eyeball ("if this is the intended logic then the two widgets don't have to be separated, but unified so the control is shown once"); the merged `card-progress` is the lock.

#### DASH-PR3 landing notes (2026-05-30)

- **First entry into the bento alerts-strip surface** (span-12 at top of grid per §7.4). Surfaces any connected platform with `syncStatus === 'error'` per OQ-DASH-11. The strip pattern is laid out for future workstreams to thread additional chips through: Q-series (pending-review), EV-PR3 (events-missed), Deals (sale callouts).
- **Two design calls locked via AskUserQuestion before write:**
    - **Single aggregated chip** for multi-platform errors. One chip: `⚠ steam · psn — sync error` (lists codes inline at 1-2 errored platforms); `⚠ 3 platforms — sync error` (collapses to a count at 3+). One click → `/settings/platforms`. Avoids chip-overflow / visual noise when many platforms error simultaneously.
    - **Not dismissible.** The chip auto-disappears when the underlying error clears on the next successful sync. No localStorage state to manage; no risk of the user dismissing-and-forgetting an unresolved error.
- **What shipped:**
    - New `apps/web/src/components/screens/dashboard/AlertsStrip.tsx` — pure component, returns `null` when there's nothing to surface. Inside a grid context it spans `gridColumn: '1 / -1'` (span-12); outside a grid (mobile) the parent wraps it in a padding container that's also conditionally rendered.
    - Visual treatment: `Icon name="warn"` (red) + `// sync error` (red) + ` · steam · psn` (paper-dim) + `view in settings →` (faint, right-aligned). Red border (`var(--red-dim)`) on `var(--ink)` background to read as alert without overwhelming the bento.
    - Wired into both `DashboardDesktop` (mounted as the first child of the bento grid; reflows naturally when null) and `DashboardMobile` (parent-level conditional render so the padding wrapper doesn't carry blank space when no alerts).
    - Accessibility: `role="region"` + `aria-label="Dashboard alerts"`; the chip itself is a real `<button>` with an `aria-label` that spells out the count for screen readers (`"2 platforms failed to sync — open Settings"`).
- **Tests:** 8 unit tests in new `apps/web/src/components/screens/dashboard/__tests__/AlertsStrip.test.tsx` — null when no platforms / no errored platform; correct copy for 1, 2, and 3+ errored platforms; click navigates to `/settings/platforms`; NOT dismissible (regression guard — exactly one button in the strip, no dismiss affordance); edge case of `syncable=false` platform with `syncStatus='error'` still surfaces. Plus 2 integration tests in `Dashboard.bento.test.tsx`: alerts strip hidden by default; renders at top of bento as first child when an errored platform is present. **22/22 across both files.** Typecheck + lint + rename-rule + production build all clean.
- **Bundle delta:** DashboardDesktop chunk 16.10 → 16.21 kB (+0.01 kB gzipped), DashboardMobile 12.01 → 12.24 kB (+0.05 kB gzipped). Negligible.
- **Sticky property for the next alerts-strip workstream** (Q-series / EV-PR3 / Deals): add new chip kinds INSIDE `AlertsStrip.tsx` rather than mounting parallel strip components. The strip's `null`-when-empty contract is what makes the bento layout collapse cleanly when no alerts exist; multiple parallel components would each render their own wrapper and break the bento spacing. The aggregation pattern (lists at 1-2, count at 3+) and the chip styling (warn icon · semantic label · `view in settings →` affordance) generalize: pending-review can use the same shape with a different icon/color + nav target.

---

## 8. Deals (new top-level surface)

### 8.1 Purpose

Deals is the *right-now buying opportunities* surface — aggregator of storefront discounts + trusted third-party-reseller offers, scoped to the user's wishlist + owned-platforms + library-adjacent context, in the user's locale currency. Hoard already knows what platforms a user owns games on and what they wishlist; Deals applies that knowledge to filter the noise of "sales the user can act on" vs. "sales the user can't care about."

User jobs:
1. **"Is anything on my wishlist on sale right now?"** — primary actionable surface. Filtered to wishlisted titles, sorted by discount % or absolute savings.
2. **"What's broadly on sale that I might want?"** — secondary discovery. High-discount titles on the user's owned platforms, excluding games the user already owns (wishlist exception applies — see §8.4).
3. **"What about completing a series I started?"** — library-completion deals: sequel/series-mate games on sale where the user owns earlier entries (depends on B-Stash-5 reference entities).
4. **"Any retro / console-physical deals worth tracking?"** — physical deals are in scope, especially for retro + console collectors. Sourced from Amazon (per user's market) + curated trusted resellers. Hoard's S0 collector identity means physical-collectible deals are first-class, not an afterthought.
5. **"What's the catalog inside this sale event?"** — sale events (Steam Summer Sale, Sony Days of Play, Epic Mega Sale, etc.) are surfaced as their own grouping; users can drill into a specific event to browse everything inside.
6. **Cross-link from Dashboard alerts strip** — "5 wishlist games on sale" callout lands here; this is the destination page for the Dashboard signal.
7. **Cross-link from GameDetail S1 (+ S3 Wishlist-past-release)** — the price-offers card on those states shares the same ITAD pipeline; clicking through a price → storefront, same plumbing as Deals page deep-links.

The page is net-new. Same family as Events in the §1 inventory (both top-level new surfaces); shares the ITAD client with GameDetail price-offers cards (B-Storefront-2). One client, two surfaces.

**Shared component architecture.** The per-game *price-offers panel* — the row of storefront entries with price / discount / chips / `[buy →]` deep-link — is a **single reusable React component**. Rendered cross-game as the row of the Deals page (`/deals`) and single-game as the dominant card on GameDetail S1 + S3-Wishlist-past-release. Same data shape, same affiliate routing, same `// historical low` / `// trending down` chips. Cheaper to build, impossible to drift between the two surfaces.

**Cross-page already-owned exclusion** — the "skip deals for games the user already owns unless wishlisted" rule applies uniformly:
- On `/deals` — at query level (game-list filter)
- On GameDetail price-offers card — at storefront-row level: if the user owns Diablo IV on Battle.net, the Battle.net storefront row is hidden from the price-offers panel even on the GameDetail page for that game. The Steam row stays if the user has Steam wishlisted, or appears for unwishlisted-but-unowned platforms.

Concretely: the panel renders only the storefronts that pass the per-platform check (owned-on-this-platform AND not-wishlisted-on-this-platform → skip; otherwise → show).

### 8.2 Current state

*Does not exist.* No `/deals` route, no ITAD integration, no price-aggregation client. The closest adjacencies today:
- Wishlist UserGames exist (post CM12 + wishlist-as-library work)
- Per-platform IDs on `Game` from M-series (`steamAppId`, `psnConceptId`, `xboxTitleId`, `gogAppId`, `epicCatalogItemId`, `nintendoTitleId`, `itchGameId`) — supply the storefront-side identifiers ITAD will need to query prices per title

### 8.3 Gaps vs benchmark

The whole page IS the gap. There's no Hoard surface for this today.

| Gap | Sources | Notes |
|---|---|---|
| No `/deals` page at all | B-Storefront-2 | Entire surface — wishlist filter, broader feed, ITAD sync pipeline, storefront deep-links |
| No ITAD client | B-Storefront-2 + OQ-GD-16 | Same client powers GameDetail S1 price-offers card; one integration, two consumers |
| No user-market preference | (architectural — Andrea 2026-05-30) | Drives both Amazon storefront selection AND locale currency display. New `User.marketCode` column |
| No physical-deals data source | B-Storefront-2 extension (Andrea 2026-05-30) | Amazon Product Advertising API per user's market; possibly other physical retailers. Retro + console focus |
| No locale-currency display | (architectural — Andrea 2026-05-30) | All prices in user's currency. ITAD supports per-region pricing queries via country parameter |
| No already-owned exclusion | (Andrea 2026-05-30) | Never show deals for games the user already owns *unless* they're wishlisted (CM12 per-platform wishlist counts — game owned on PSN but wishlisted on Switch → show Switch deal) |
| No sale-event grouping | (Andrea 2026-05-30) | Group deals by sale event (Steam Summer Sale / Sony Days of Play / Epic Mega Sale / etc.); users can drill into an event to browse its full catalog |
| No historical-low markers | (Andrea 2026-05-30) | Surface `// historical low · never been cheaper` chip when current price equals or matches historical low |
| No trend alerts | (Andrea 2026-05-30) | Flag wishlist games with multiple recent price drops as "trending down" — pre-emptive nudge before they hit historical low |
| No Dashboard "X wishlist deals" callout | (§7 alerts strip) | Cross-page dependency — Dashboard surfaces the callout only after Deals workstream ships the data primitive |
| No library-completion-deal surfacing | B-Stash-5 + B-Storefront-2 | "Bayonetta 3 on sale (you own Bayonetta 1 + 2)" — depends on series reference data |
| No affiliate-link routing | (Andrea 2026-05-30 reversal — see OQ-DEALS-5) | Hoard runs at the cost of Railway + IGDB + ITAD APIs; affiliate revenue covers operating expense |

### 8.4 Target state

`/deals` is a list-heavy page with a clear hierarchy: dominant wishlist deals at top, broader feed below, library-completion + physical-deals + sale-event grouping in between. All prices in the user's locale currency (driven by `User.marketCode`).

**Storefront taxonomy** — two distinct categories, governed by different rules:

1. **Official first-party storefronts — always in scope, never filtered.** These aren't resellers — they're where the publisher sold the game. Hoard treats them as the canonical source:
    - Steam · GOG · Epic Games Store · itch.io · Humble Store · Battle.net
    - PSN Store · Xbox Store · Nintendo eShop
    - Coverage caveat per OQ-DEALS-3: ITAD's data for PSN / Xbox / Nintendo is sparser than PC.
2. **Third-party resellers — curated allow-list only.** This is the trusted-reseller filter (OQ-DEALS-9). Anything not on the list is excluded entirely (grey-market sources like G2A / Eneba never appear).

**Rules across every section:**
- Show official first-party storefront deals (always) + reseller deals from the curated allow-list (only)
- Skip deals for games the user already owns, *unless* the game is wishlisted (per-platform wishlist via CM12 counts — owned on PSN + wishlisted on Switch → show the Switch deal)
- Surface a `// historical low` chip when current price equals historical-low
- Surface a `// trending down` chip when a wishlist game has had ≥2 price drops over a sliding window (threshold locked in OQ-DEALS-13)
- All deep-links go through the affiliate-router *where an affiliate program exists* — most resellers (Humble / GMG / Instant Gaming / Kinguin / CDKeys / Fanatical / GamesPlanet) have programs; most official first-party storefronts (Steam / PSN / Nintendo / Xbox) do *not* — those links go direct (see OQ-DEALS-5)

```
// DEALS · refreshed 4h ago · market: AT 🇦🇹           [change market] [refresh now]

┌─ top wishlist deal ───────────────────────────────────────────────────────┐
│ DIABLO IV                                              -50%  €34.99       │  ← dominant hero card
│ on Battle.net · ends in 2d 14h                         was €69.99         │     (highest % off on
│ ▮ wishlist · PC  // historical low  // trending down                      │     your wishlist right now)
│                                                        [buy →]            │
└───────────────────────────────────────────────────────────────────────────┘
[span-12]

// wishlist deals (5)                       sort: % off ▾ · storefront: [ all ▾ ]

┌──────────────────────────────────────────────────────────────────────────┐
│ ▢ Diablo IV         Battle.net   -50% €34.99 · ends 2d   // historical low│
│ ▢ Cyberpunk 2077    Instant Gam. -45% €32.99 · ends 4d   // trending down │
│ ▢ Hades             GOG          -40% €14.99 · no expiry                  │
│ ▢ Hollow Knight     Humble       -25% €11.24 · ends 1d                    │
│ ▢ Ori & the Blind…  GMG          -20% €15.99                              │
└──────────────────────────────────────────────────────────────────────────┘
[span-12 list]

// library completion (3)                                 ← B-Stash-5 dep
   Bayonetta 3        Switch eShop  -33% €40.19 — you own 1 + 2
   Mass Effect LE     Steam         -50% €29.99 — you own 1 + 2
   Pokémon Sword      Switch eShop  -25% €44.99 — you own Ruby + Sapphire

// physical deals — retro + console (4)                   ← Amazon Product API
   Zelda: Skyward HD       Amazon.de   -40%  €23.99
   Persona 5 Royal PS4     Amazon.de   -45%  €27.49
   Resident Evil 4 GC      ebay.de    €38 used "very good"
   Castlevania SymphonyN   Amazon.de   -30% €17.49

// sale events (2 active)                                 ← group-by event
   Steam Summer Sale 2026 · 4,832 games · ends 8d              [browse →]
   Sony Days of Play 2026 · 312 games   · ends 14d             [browse →]

// also on sale on your platforms (28)        sort: % off ▾ · platform: [ all ▾ ]
   [scrollable list — broader discovery; high-discount titles on user's
    owned platforms, excluding library entries unless wishlisted]
```

**Element matrix:**

| Element | Default state | Ships when |
|---|---|---|
| Top-wishlist-deal hero | hidden when no wishlist deals exist | DEALS-PR1 |
| Wishlist deals list (sorted by % off) | hidden when no wishlist deals | DEALS-PR1 |
| `// historical low` chip on card | rendered when `currentPrice == historicalLow` | DEALS-PR1 |
| `// trending down` chip on card | rendered when ≥2 drops in window (threshold per OQ-DEALS-13) | DEALS-PR1 |
| Already-owned exclusion (unless wishlisted) | enforced at query level | DEALS-PR1 |
| Library-completion section | hidden until B-Stash-5 + series reference data | DEALS-PR2 |
| **Physical deals section (retro + console)** | hidden when no Amazon market data yet | DEALS-PR3 (Amazon Product API integration) |
| **Sale-events section** | hidden when no active events recognised | DEALS-PR2 (or DEALS-PR3 — depends on data source) |
| Broader-feed list | hidden when no relevant deals | DEALS-PR1 |
| **Market picker in toolbar (`[change market]`)** | always present | DEALS-PR1 (or Settings — see OQ-DEALS-10) |
| **Locale-currency display** | always — driven by `User.marketCode` | DEALS-PR1 |
| Storefront filter chips (officials always; resellers per allow-list) | always present | DEALS-PR1 |
| Discount range filter | optional toggle | DEALS-PR4 |
| Source-type filter (digital storefront / reseller / physical) | always present | DEALS-PR1 (digital); physical chip with DEALS-PR3 |
| Per-card deal-expiry countdown | when ITAD provides expiry timestamp | DEALS-PR1 |
| Per-card `[buy →]` deep-link | always — routed through affiliate-router | DEALS-PR1 |
| Per-card cross-link → GameDetail | always present | DEALS-PR1 |

Progressive-disclosure same as Dashboard / Library: sections without content don't render. A fresh user with empty wishlist sees only the broader-feed section.

**Trusted-RESELLER allow-list (locked 2026-05-30):** **Humble · Instant Gaming · GMG · Kinguin · CDKeys.** Additional candidates flagged for future expansion: **Fanatical** (clean / official affiliate), **GamesPlanet** (clean / official affiliate). The allow-list filters *resellers only* — official first-party storefronts (Steam / GOG / Epic / PSN / Xbox / Nintendo / etc.) are always shown and never subject to this filter. This list IS Hoard's curation of resellers Andrea personally trusts to buy from — not "every reseller ITAD returns." Anything not on this list (G2A / Eneba / etc.) gets filtered out entirely. See OQ-DEALS-9 for expansion path.

### 8.5 Open questions

- **OQ-DEALS-1 — ITAD API key acquisition + env-var setup.** ITAD requires an API key from their dashboard (free tier exists). Pattern same as IGDB / Steam / GOG / Epic credentials — env vars on Railway: `ITAD_API_KEY=...`. Recommendation: **ship as env-vars-only**, same pattern as GOG_CLIENT_ID. Pre-deploy gotcha: needs to be set on Railway before the page works in production.
- **OQ-DEALS-2 — Refresh cadence.** Prices change daily but not hourly; ITAD's API has rate limits. Three options:
    1. **Nightly cron + manual `[refresh now]` button** — covers daily price drift, admin can force a refresh when a major sale lands. *Recommended.*
    2. On-page refresh per visit (wasteful, hits rate limits at scale)
    3. Smart per-game refresh (when GameDetail S1 hits a game's price card, trigger an ITAD refresh just for that game) — adds complexity, only worth it if the nightly is too stale.
    Recommendation: **#1 — nightly cron + admin manual button.** Matches the Events §6 OQ-EV-2 decision; same operational shape.
- **OQ-DEALS-3 — Console storefront coverage gap.** ITAD's coverage of PSN / Xbox / Nintendo is weaker than PC storefronts (less complete pricing history; some titles missing entirely). Three options:
    1. **Accept ITAD's coverage as-is** — surface what we can; the user knows console pricing varies; ship simple.
    2. Supplement with direct storefront-API queries for console pricing — substantial engineering, ToS-risky for some platforms.
    3. Hide console games entirely from Deals (PC-only) — too aggressive; many Hoard users have console-heavy libraries.
    Recommendation: **#1 — accept the coverage gap.** Document it in an empty-state copy on the page ("console pricing data is sparser than PC; check the platform store directly if you don't see what you expected").
- **OQ-DEALS-4 — Mobile shape.** Deals is list-heavy. Mobile compression: stack the hero + list vertically; storefront filter as a single sheet-picker rather than chip-row; per-row card density reduced (drop storefront chip, keep title + discount + countdown). Worth a separate mockup pass during DEALS-PR4.
- **OQ-DEALS-5 — Affiliate-link revenue routing. ✅ REVERSED 2026-05-30 (now IN SCOPE).** Original rejection was framed as "Hoard is not a monetisation surface." That framing was wrong on a closer look — Hoard *runs at a cost* (Railway + IGDB + ITAD + Vercel hosting; future ITAD paid tier if scale demands it). Affiliate revenue from storefronts where the user was already going to buy is *cost-recovery*, not monetisation-driven product behaviour. **Critically:** affiliate routing does NOT change anything the user sees or does — the `[buy →]` button already exists for the user's benefit; the affiliate ID is appended to the URL invisibly. No new buy-pushing UX, no upgraded prominence, no fake-urgency. The product behaviour is identical with or without the affiliate ID; the revenue just covers operating expense.
    **Implementation pattern:** per-reseller affiliate ID config (env vars: `HUMBLE_AFFILIATE_ID`, `INSTANT_GAMING_AFFILIATE_ID`, `GMG_AFFILIATE_ID`, `KINGUIN_AFFILIATE_ID`, `CDKEYS_AFFILIATE_ID`, etc.); a thin URL-rewriter wraps every reseller `[buy →]` link with the affiliate ID using the reseller's documented format. Affiliate program signups handled out-of-band by Andrea.
    **Scope clarification:** affiliate routing applies *primarily to resellers*. Most official first-party storefronts (Steam / PSN / Nintendo / Xbox Store / Epic) do NOT operate public affiliate programs — those `[buy →]` links go direct, no rewriter. The exceptions are GOG (has an affiliate program), Humble Store (has one), and itch.io (has one). The router is a per-storefront-keyed mapping; storefronts without an entry get the unrewritten URL.
    **Identity boundary preserved:** Hoard does NOT add buy-promoting UX, does NOT change ranking/sort to favor higher-commission storefronts, does NOT hide deals from non-affiliated storefronts. The trusted reseller allow-list (OQ-DEALS-9) is curated for *what Andrea actually buys from*, not "where Hoard makes the most money."
- **OQ-DEALS-6 — Cross-region price comparison.** "Steam US $34.99 vs Steam EU €34.99 vs Steam ARS ₽X" — ToS-grey territory (some storefronts explicitly forbid region-arbitrage promotion). Recommendation: **skip.** Out of scope; if a user wants region pricing they have ITAD's own site for that.
- **OQ-DEALS-7 — Deal-drop notifications.** "Hades dropped to €14.99 — you wishlisted it!" — requires a notifications channel Hoard doesn't have. Same gating as Events OQ-EV-10. Recommendation: **defer entirely** until a notifications-channel workstream lands. The Deals page is browse-when-you-visit, not push-when-it-happens.
- **OQ-DEALS-8 — Library completion deals — depth.** Series reference data (B-Stash-5) is the primitive. The completion-deals surface needs a query: "find on-sale games whose franchise/series is also owned by the user, but this specific entry isn't." Two depth options:
    1. **Series only** — exact franchise match (Pokemon, Final Fantasy, Mass Effect, etc.)
    2. **Series + developer** — also surface "you've played 3 FromSoftware games; Armored Core VI is 30% off"
    Recommendation: **#1 in DEALS-PR2; #2 only if usage signal demands it.** Series ownership is a stronger "I want the next one" signal than developer affinity.

- **OQ-DEALS-9 — Trusted-RESELLER allow-list expansion.** **Locked 2026-05-30 at: Humble · Instant Gaming · GMG · Kinguin · CDKeys.** Andrea's personal-purchase set. The allow-list applies to *resellers only* — official first-party storefronts (Steam / GOG / Epic / PSN / Xbox / Nintendo / Battle.net / itch.io / Humble Store) are always shown without filtering. Additional reseller candidates flagged for future expansion when convenient:
    - **Fanatical** — clean (official affiliate program, no grey-market concerns)
    - **GamesPlanet** — clean (UK-based, official affiliate program)
    The allow-list is *config-driven* not user-driven — a single source-of-truth list in the codebase (`apps/api/src/services/deals/allowList.ts` or similar). When Andrea wants to add a reseller, edit the list, deploy. Future enhancement could be admin-editable via the `/admin` panel.
- **OQ-DEALS-10 — Market picker UX placement.** New `User.marketCode` column drives both Amazon storefront selection (Amazon.de for AT/DE, Amazon.it for IT, Amazon.com for US, etc.) AND locale currency display across the page. Where does the user *set* this preference?
    1. **Settings → Account section** — single source of truth, set-and-forget. Add a `market: [ AT 🇦🇹 ▾ ]` field alongside email/name. Cross-page affects (Deals, GameDetail S1 prices, anywhere currency is shown).
    2. **Settings + a `[change market]` chip in the Deals toolbar** — same data, two affordances; the chip in Deals jumps straight to the Settings field for quick swap.
    3. **Auto-derive from `Accept-Language` header + IP geolocation on first visit, user overrides only if wrong** — zero-friction default; harder to debug when wrong.
    Recommendation: **#2 — Settings field as source-of-truth + chip in Deals toolbar as quick-access affordance + Accept-Language as the initial default value on user creation.** Three-layer fallback: explicit user-set → Accept-Language-derived → null (omit non-localized fields). Schema: `User.marketCode: String?` (ISO 3166-1 alpha-2, e.g. "AT" / "IT" / "US" / "DE").
- **OQ-DEALS-11 — Physical-deals data source.** ITAD is digital-only. Physical deals (retro + console) need a separate pipeline. Options:
    1. **Amazon Product Advertising API** — official affiliate-program-gated API; requires an active Amazon Associate account (Andrea would need to register). Covers Amazon.de / Amazon.it / Amazon.com / etc. — picks the right market per `User.marketCode`. *Chicken-and-egg: API requires affiliate sign-up; cost-recovery from OQ-DEALS-5 starts here.*
    2. **Curated retailer-RSS / curated scraping** — list of trusted physical retailers (Multiplayer.it, Mediaworld, GameStop, etc.), scrape their deal pages. ToS-grey, brittle.
    3. **Skip physical for v1; ship later** — Andrea said in scope but if Amazon API friction is high we could defer.
    Recommendation: **#1 in DEALS-PR3 (Amazon API), with the affiliate sign-up as a pre-deploy ops step. If sign-up takes ages, ship DEALS-PR1+PR2 without physical and add it as DEALS-PR3 when the affiliate account exists.**
- **OQ-DEALS-12 — Sale-event grouping data source.** Steam Summer Sale / Sony Days of Play / Epic Mega Sale etc. — how does Hoard know an event exists + which games are in it?
    1. **ITAD-derived** — ITAD has a `bundles` and `sales` API surface; coverage varies but it tags some events
    2. **Manual curation** — Andrea creates a `SaleEvent` row when a big event launches; populates via a query over ITAD data for that storefront + date window
    3. **Pattern-detection** — auto-detect "many deals from same storefront within same date window" as an event
    Recommendation: **#2 + #1 hybrid** — pull event metadata from ITAD where possible, augment with a small `SaleEvent` table in Hoard for events ITAD doesn't tag. URL: sub-route `/deals/event/:slug` so events are linkable + browsable. New schema: `SaleEvent { id, slug, name, storefront, startsAt, endsAt, coverUrl?, description? }` + a derived query that finds all current deals matching the (storefront, date window).
- **OQ-DEALS-13 — Trend-alert threshold.** When does a wishlist game qualify for the `// trending down` chip?
    1. **≥2 price drops within 30 days** — moderate sensitivity; surfaces real downward momentum
    2. **≥3 price drops within 60 days** — high sensitivity; more confident signal
    3. **Any drop where current price < 90% of 30-day avg** — math-based, less interpretable
    Recommendation: **#1 (≥2 drops in 30 days) as the default**, tunable via env var if cohort signal demands adjustment. Requires storing per-game price history (extend ITAD nightly sync to persist a `PriceSnapshot` per game per day).
- **OQ-DEALS-14 — Historical-low marker precision.** When current price equals historical low exactly, surface `// historical low · never been cheaper`. What about "within 5% of historical low" — close but not exactly equal? Recommendation: **strict equality for the primary chip; render `// near historical low` as a softer secondary chip when within 5%.** Two distinct chips for two distinct moments.

### 8.6 Sequencing notes

DEALS ships as its own workstream — call it DEALS-series. Larger than the original spec after Andrea's 2026-05-30 expansion (affiliate routing + market preference + locale currency + already-owned exclusion + physical deals + sale-event grouping + historical-low + trending-down + curated allow-list). Still smaller than GameDetail v2.

- **DEALS-PR1 — Foundation (digital, locale-aware).**
    - ITAD client (`apps/api/src/services/deals.ts`)
    - Nightly cron + admin manual refresh button
    - `User.marketCode` schema column + Accept-Language-derived default
    - Settings → Account: market picker field
    - Per-reseller affiliate-router (env vars: `HUMBLE_AFFILIATE_ID`, `INSTANT_GAMING_AFFILIATE_ID`, `GMG_AFFILIATE_ID`, `KINGUIN_AFFILIATE_ID`, `CDKEYS_AFFILIATE_ID`). Official first-party storefronts mostly lack affiliate programs — those links go direct.
    - Trusted-reseller allow-list config (locked: Humble · Instant Gaming · GMG · Kinguin · CDKeys per OQ-DEALS-9). Official storefronts (Steam / GOG / Epic / PSN / Xbox / Nintendo / etc.) always shown, not subject to the filter.
    - `/deals` page: top-wishlist-deal hero + wishlist deals list + broader-feed list
    - All prices in user's locale currency
    - Already-owned exclusion with wishlist exception (per CM12 follow-through)
    - Storefront filter + source-type filter + per-card deep-links (affiliate-routed)
    - `// historical low` + `// trending down` chips on cards
    - Per-game `PriceSnapshot` persistence (extends nightly sync) — required for trend detection
    - `[change market]` chip in toolbar (jumps to Settings field)
    - Sidebar nav integration
    - Dashboard alerts-strip callout ("X wishlist games on sale")
- **DEALS-PR2 — Library completion + sale events.**
    - Library-completion section (gated on B-Stash-5 series reference data)
    - Sale-event detection + grouping + `SaleEvent` schema table
    - Sub-route `/deals/event/:slug` for per-event catalog browsing
- **DEALS-PR3 — Physical deals.**
    - Amazon Product Advertising API integration (per `User.marketCode`)
    - Physical-deals section on `/deals`
    - Retro + console focus per Andrea's S0 collector identity framing
    - Pre-deploy ops: Amazon Associate affiliate account registration
- **DEALS-PR4 — Filter + mobile polish.**
    - Discount range filter + sort options + storefront-availability chips
    - Mobile compression layout per OQ-DEALS-4
    - Trend-alert threshold env-var tunability (per OQ-DEALS-13)

**Shared with GameDetail S1 (B-Storefront-2):**
- The ITAD client built in DEALS-PR1 is consumed by GameDetail S1's price-offers card. Either workstream ships first; the other consumes the existing client. Recommended ordering: ship DEALS-PR1 first (the page has more dependent data shape — affiliate routing, market preference, allow-list filter), then GameDetail v2 GD-PR1 (S1) just reads the existing infrastructure.

**Pre-deploy ops checklist:**
- `ITAD_API_KEY` env var on Railway (same pattern as GOG_CLIENT_ID)
- Per-reseller affiliate IDs on Railway: `HUMBLE_AFFILIATE_ID`, `INSTANT_GAMING_AFFILIATE_ID`, `GMG_AFFILIATE_ID`, `KINGUIN_AFFILIATE_ID`, `CDKEYS_AFFILIATE_ID` (matching the locked allow-list). Optional: GOG / Humble Store affiliate IDs if Andrea sets those up — Steam / PSN / Xbox / Nintendo don't have public programs and are left blank.
- Amazon Associate account + API credentials (DEALS-PR3 only)

**Cross-page dependencies fed by DEALS-PR1:**
- Dashboard alerts strip surfaces "X wishlist games on sale" callout (closes part of §7 OQ-DASH-2)
- GameDetail S1 price-offers card consumes the ITAD client + affiliate router + locale-currency pipeline (B-Storefront-2)
- Settings → Account gains the market picker field (small Settings addition; ships as part of DEALS-PR1 since Deals is the primary consumer)

---

## Doc-lifecycle notes

- Page sections fill in iteratively per Andrea-led discussion sessions. Order: GameDetail (this commit, §3) → next session per Andrea.
- Open questions get resolved into the matching `*_PLAN.md` for the workstream that ships the page (e.g. `docs/GAMEDETAIL_V2_PLAN.md` once GD-PR1 opens). This doc remains the *functional spec*; the plan docs handle PR sequencing + tests + decisions.
- Benchmark catalog (§2) is append-only — new observations get new IDs (`B-<source>-<n>`). Don't renumber.
