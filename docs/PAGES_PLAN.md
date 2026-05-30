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
- **B-IGDB-3** Genre tags as a filterable / browseable dimension across the library. IGDB exposes `genres` (RPG / Action / Strategy / etc.), `themes` (Fantasy / Sci-Fi / Horror / etc.), and `player_perspectives` (First-person / Third-person / etc.) on every game. Stash merges all three into a single "tags" axis (per O14); Hoard scopes B-IGDB-3 to `genres` initially with `themes` + `perspectives` as a v2 extension if usage signal demands it. **Already integrated** — genres land on the IGDB `Game` payload we already fetch, so this filter is *less dependent* than developer/publisher/series (those need new reference entities; genres just need an index + filter UI).

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
| **Current price offers across storefronts (B-Storefront-2)** | **★** | — | — | — |
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
| **No genre filter or browse-by surface** | B-IGDB-3 | Genres already on `Game` via IGDB; just need a search index + filter UI + browse-by panel row. Lighter dependency than dev/pub/series — ships *before* B-Stash-5 |
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
| **Genre** | **`/library/by-genre/:slug`** | **B-IGDB-3 (lighter — genres already on Game; ships standalone, not gated on B-Stash-5)** |
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
| Status | platform · genre · developer · publisher · series · collection · rating |
| **Genre** | **platform · status · developer · publisher · series · collection · rating** |
| Collection | platform · status · genre · developer · publisher · series · rating |
| Developer | platform · status · genre · collection · rating |
| Publisher | platform · status · genre · developer · collection · rating *(developer as sub-filter is interesting; e.g. Nintendo publisher → drill to Game Freak. See OQ-LIB-9 on the asymmetry)* |
| Series | platform · status · genre · collection · rating |
| Rating bucket | platform · status · genre · developer · publisher · series · collection |
| Pending-review | platform · status *(other lenses don't usefully discriminate; needsReview rows are data-quality cases, not curated subsets)* |
| All | every secondary filter visible (status · genre · developer · publisher · series · collection · rating · platform) |

**Why genre is on nearly every lens:** genres are the most orthogonal of the available axes — every other lens (status, developer, publisher, series, collection, rating) meaningfully discriminates further when sliced by genre. *"Playing × JRPG"*, *"FromSoftware × Action-RPG"*, *"Pokemon collection × RPG"*, *"Rated 8+ × Horror"* are all natural queries.

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
   genre:      RPG 87 · Action 64 · Strategy 32 · [show all 19 →]    ← B-IGDB-3 (lighter dep)
   developer:  Game Freak 24 · Nintendo 47 · FromSoftware 8 · [show all 23 →]
   publisher:  Nintendo 89 · Sony 56 · Capcom 23 · [show all 18 →]
   series:     Pokemon 18 · Mega Man 11 · Final Fantasy 9 · [show all 12 →]
```

Each row in the browse-by panel renders *independently* — genres ship first (B-IGDB-3 is data-on-hand), developer/publisher/series fill in when B-Stash-5 lands. So Library landing has a meaningful browse-by section *before* the reference-data workstream ships.

**Element matrix per landing-page section:**

| Section | Default state | Ships when |
|---|---|---|
| ~~Find input + `/` shortcut~~ | **REMOVED 2026-05-30 — find is contextual to a lens, not global. Cmd-K SearchOverlay is the cross-everything path** | — |
| Pending-review callout | hidden when no needsReview rows | Q-series ships |
| Status shelves (6) | ✓ today | — |
| Completed shelf glyph treatment | absent today | B-Hoard-1 visual design lands (OQ-GD-13 resolution) |
| Collections shelves | hidden when no collections | B-Stash-4 ships |
| `[+ new collection]` CTA | hidden when B-Stash-4 unshipped | B-Stash-4 ships |
| Browse-by panel — genre row | hidden when genre index empty | B-IGDB-3 ships (lighter dep — already on Game) |
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
| **Genre filter + `/library/by-genre/:slug` + browse-by genre row** | **B-IGDB-3 workstream — genre index + filter UI. Lighter than B-Stash-5 (genres already on Game from IGDB)** |
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
- **Per-platform wishlist context** is a 1-PR enhancement on Releases standalone. Call it **REL-PR1**. Modest scope: ReleaseCard render logic update + 3-4 visual regression tests + mobile mirror. Could ship any time.
- **Card route alignment** lands in GD-PR1 (the GameDetail v2 route migration PR) — same atomic commit since the route source-of-truth migrates with the destination.
- **"Live now" today-release chip** is another standalone REL-PR2 if/when prioritised. Smallest possible scope, no dependencies.

No standalone "REL-series" needed. The work threads into other workstreams + 1-2 small enhancement PRs.

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

*To be filled in next session.*

Likely focus areas: less benchmark pressure (Stash has no Dashboard analogue, IMDB/HLTB don't ship a personal-dashboard view). More about polish + alignment with the other pages.

---

## 8. Deals (new top-level surface)

*Stub — to be filled in next session.*

### 8.1 Purpose (working hypothesis)

Hoard already knows what platforms each user owns games on and what they wishlist. The Deals page leverages that to surface **right-now buying opportunities** the user might not otherwise see: official-platform sales, third-party-reseller discounts on already-wishlisted titles, and aggregator-style "best price across all storefronts" for any game in the library or wishlist.

Two natural user jobs:
1. **"Is anything on my wishlist on sale right now?"** — primary surface filtered to wishlisted titles, sorted by discount % or absolute savings.
2. **"What's broadly on sale that I might want?"** — secondary surface, broader feed of high-discount titles that match the user's owned-platforms set.

### 8.2 Spec direction (TBD)

Data source: **IsThereAnyDeal (ITAD) API** is the locked candidate per OQ-GD-16 (also powers B-Storefront-2 price-offers on GameDetail S1). Same client, two surfaces.

Likely sections on `/deals`:
- **wishlist deals (★ dominant)** — every wishlist game currently discounted, sorted by % off
- **library completion** — sequel/series-mate games on sale where the user already owns earlier entries (depends on B-Stash-5 reference entities for series data)
- **platform-scoped feed** — high-discount titles on the user's owned platforms, excluding already-owned

Out of scope (to flag, not build):
- Cross-region price comparison (Steam US vs Steam EU etc. — ToS-grey)
- Affiliate-link revenue routing — Hoard is personal-tool, not a monetisation surface
- Price-drop alerts as push notifications (could come later as a notifications-channel workstream; out of scope for the page itself)

### 8.3 Open questions (TBD)

To be filled in the Deals drill session. Pre-seeded:
- OQ-DEALS-1: ITAD API key acquisition + env-var setup
- OQ-DEALS-2: Refresh cadence — every page-load is wasteful; nightly cron vs. on-demand-with-stale-cache?
- OQ-DEALS-3: Console storefront coverage gap (ITAD is weak on PSN/Xbox/Nintendo pricing) — accept as-is or supplement?
- OQ-DEALS-4: Mobile shape — Deals is a list-heavy page; mobile compression strategy

---

## Doc-lifecycle notes

- Page sections fill in iteratively per Andrea-led discussion sessions. Order: GameDetail (this commit, §3) → next session per Andrea.
- Open questions get resolved into the matching `*_PLAN.md` for the workstream that ships the page (e.g. `docs/GAMEDETAIL_V2_PLAN.md` once GD-PR1 opens). This doc remains the *functional spec*; the plan docs handle PR sequencing + tests + decisions.
- Benchmark catalog (§2) is append-only — new observations get new IDs (`B-<source>-<n>`). Don't renumber.
