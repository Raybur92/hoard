# Hoard — Product Strategy (2026-05-22)

**Purpose.** This doc captures the strategic decisions that shape what gets built next. Opportunity Solution Tree per `/layers-product-strategy`, built on the user-needs corpus in `docs/USER_RESEARCH.md` §10.

Strategy is the first layer of the solution space — the point where research-layer understanding converts into deliberate bets. Decisions here constrain the next three layers (conceptual model, interaction flow, surface).

Cross-references:
- `docs/USER_RESEARCH.md` §10 — user needs (N1–N12) that this tree's opportunities draw from
- `docs/USER_RESEARCH.md` §8 D1–D10 — locked decisions at the research layer
- `CLAUDE.md` Hard Rules — non-negotiable constraints that bound any strategy

---

## 1. Strategic stance (the constants)

Three positioning anchors locked before the tree gets drawn — these constrain every bet below.

### S0. North star — THE companion for any videogame enthusiast and collector

> *Hoard needs to be THE companion for any videogame enthusiast and collector. So we need to take into consideration any source a game can come from, and any platform a gamer could own games inside. — Andrea, 2026-05-22*

This is the long-horizon positioning that S2's near-term outcome contributes to. The implications:

- **Any source.** Beyond the canonical "Steam + PSN + Xbox + GOG" storefronts, Hoard's coverage ambition includes: Nintendo eShop, Epic Games Store, Itch.io, Humble Bundle library, subscription services (Game Pass, PS Plus Catalog, EA Play, Ubisoft+), physical media (disc-based PS5/Xbox/Switch, retro carts), ROM/emulation collections. Some of these have APIs; some require excellent manual-add UX as the permanent path.
- **Any platform a gamer could own games on.** PC + the three current-gen consoles is the floor, not the ceiling. Retro consoles (NES through Wii U; Game Boy through 3DS; Genesis through Dreamcast; etc.) are part of the long-term scope for serious collectors.
- **"Companion," not "library viewer."** The framing is relational — Hoard is meant to help the user manage their collection, not just display it. This pulls in adjacent needs (N7 relevant-now, N10 wishlist-as-planning) as part of the positioning, not just as nice-to-haves.

**S0 reframes the §10 user-needs corpus.** N11 ("complete library across all owned platforms") was originally scoped to current-gen mainstream platforms. Under S0, N11's true scope is "every source a user collects from." This is significantly broader than first-pass strategy treated it.

**S0 spans multiple ownership-state variants.** A collector's library isn't a uniform set of "games I own from a synced storefront." It includes (at minimum): games owned-via-sync (Steam/PSN/Xbox/GOG), games owned-via-manual-add (physical disc, retro cart, niche storefront), games owned-via-subscription (Game Pass / PS Plus catalog — playable but not owned in the property sense), games wishlisted (upcoming releases AND released-but-not-yet-owned), and games on the radar via gallery / news / deal-tracking. The product needs to represent each of these with the right metadata, the right UI treatment, and clear semantic distinctions. See S8.

**Operational implications:**
- The 2026-Q3 outcome (S2) is one milestone toward the north star, not the final destination. Strategy needs horizon-1 (S2, the next 4 months) and horizon-2 (2026-Q4 → 2027-Q2+) as distinct planning surfaces.
- Manual-add UX is **first-class**, not a fallback. Many sources (physical media, retro ROMs, niche storefronts) will never have a sync API. Hoard's relationship to manual-add can't be "the workaround when sync fails" — it has to be a credible primary path. This becomes S7 below.
- The conceptual-model layer has real gaps to address before some horizon-2 bets become buildable (subscription-vs-owned distinction, retro-platform enumeration, physical/digital media-type tracking). Flagged in §5.

### S1. The terminal aesthetic is a constraint, not a variable

> *Hoard is a personal tool that I'm planning to release to the public. So I want to like it first and foremost. — Andrea, 2026-05-22*

Per the original `/layers-user-needs` synthesis (USER_RESEARCH.md §10), the highest cost-of-being-wrong gap was G2 / N6 — whether the terminal aesthetic generalises beyond Andrea. That framing ranked N6 as the #1 research priority because "if it doesn't generalise, fundamental redesign."

**Strategy reframes G2/N6 from variable to constraint.** Hoard's positioning is "a dense terminal-aesthetic personal collector tool, for collectors who prefer that aesthetic." Strategy serves Andrea-the-prime-user + collectors-who-share-his-taste. It does NOT try to broaden the aesthetic to maximise cohort generalizability. The research-question shifts from "should we keep the aesthetic?" to "find users who fit the aesthetic" — an acquisition / targeting concern, not a redesign concern.

**Consequence:** Andrea-only needs (N3 liveness, N4 scope invariant, N6 aesthetic) are now first-class needs in this tree, not "wait for cohort validation" needs. They're constitutive of the product's identity.

### S2. The desired outcome — horizon-1 milestone toward S0 (Phase 1)

> *By end of 2026-Q3 (2026-09-30), Hoard is the credible primary library tool for a multi-platform PC+console collector — every common storefront has sync coverage OR a frictionless manual-add path, with manual-add treated as first-class (per S7).*

- **Measurable:** every common source (Steam + PSN + Xbox Live + GOG via sync; Nintendo + Epic via excellent manual-add) is a credible path — no platform produces a worse experience than another. Plus the §10 completeness surfaces shipped (N7 / N9 / N10).
- **Meaningful:** the first milestone toward S0. Releasing to the public hinges on a serious collector being able to represent their collection without feeling like Hoard is "limited" or "for Steam users only."
- **Bounded:** 4-month horizon (2026-05-22 → 2026-09-30). One major investment cycle, with subscription/retro/physical-media coverage explicitly deferred to horizon-2 (2026-Q4+).

### S7. Manual-add is first-class, not a fallback

Many sources will never have a sync API — physical media, retro ROM collections, niche regional storefronts, free-via-Twitch-Prime, Game Jam downloads. For S0 to hold, the manual-add path has to feel like a primary way to add a game, not a workaround you use when "the real way" failed.

**Operational consequences:**
- Adding a game manually should be ≤4 taps / ≤30 seconds for known IGDB-indexed games.
- **Manual entries inherently lack sync data** — no playtime, no last-played, no trophies/achievements, no per-platform progress. The detail page for a manual entry can't pretend to have these; it has to be designed honestly. UI options: hide the missing-data sections entirely, OR show them with a "// not tracked — added manually" affordance + a CTA to "track manually" (let the user enter playtime / completion status by hand if they want).
- The library shouldn't visually penalise manual entries, but the detail page has to reflect their narrower data shape. See S9 below.
- The platform picker on manual-add needs to span ALL platforms — not just the 6 sync-capable ones. A retro collector should be able to add a NES game on first try.
- The conceptual model may need new dimensions (media_type: digital/physical/cartridge; source_type: owned/subscription/borrowed/demo). Flagged for `/layers-conceptual-model`.

### S8. Wishlist intent has two distinct surfaces — a release tracker and a library want-shelf

**Two surfaces, related but not the same:**

1. **The Releases page (`/releases`) — the release tracker.** Upcoming-only by design. Countdown / hype / category / news / IGDB upcoming feed. Backed by `WishlistRelease` (which is correctly upcoming-shaped). **Stays as-is; no model rename.**
2. **The Library Wishlist shelf — the want-list.** Lives at `/library/Wishlist` already as a status filter. Any game the user wants to own, released or not. Backed by `UserGame.status = 'Wishlist'`. Model already supports this; the gap is *entry paths*.

**The gap.** Today the only way a game lands in the Library Wishlist shelf is via the Releases-tracker star (`POST /api/upcoming/:igdbId/wishlist`), which creates both `WishlistRelease` + `UserGame(Wishlist)` in a transaction. Released games — *"I want to play Persona 5 someday but don't own it yet"* — have no first-class entry path:
- Manual-add (B1c) currently defaults new entries to `Backlog`. No "Wishlist as initial status" option.
- Top-bar search → result → "+ wishlist" action doesn't exist (only "+ backlog" or open-detail-then-edit).
- GameDetail for a not-in-library game doesn't have a "+ wishlist" CTA either.

**Operational consequences:**
- **No model rename.** `WishlistRelease` stays the upcoming-release-tracking shape. `UserGame.status = 'Wishlist'` stays the library-want-shelf state. The two-table architecture is fine.
- **New UX entry paths needed:**
  - Manual-add with Wishlist as a selectable initial status (folds into B1c)
  - Search result row → "+ wishlist" action alongside "+ backlog"
  - GameDetail (when game not-yet-in-library) → "+ wishlist" CTA
- **Library Wishlist shelf renders heterogeneous entries:**
  - Entries WITH a `WishlistRelease` companion row (from the Releases-tracker star) — have release-date, hype, category, etc.
  - Entries WITHOUT a `WishlistRelease` (new "wishlist this released game" path) — no release-date / hype data
  - UI question: do we visually distinguish, or are they all just "games on the wishlist"? Probably the latter for the shelf; the upcoming-specific affordances stay on the Releases page only.
- **Released-wishlist detail page** (per S9) — shows cover, gallery, store deals (S10), HLTB, "where to buy" — not a countdown, the game's already out.

### S9. The game-detail page is a state machine, not a uniform render

The detail page can't be one template that switches a few fields on/off. The state determines the page's primary purpose:

| State | Page purpose | Key info shown |
|---|---|---|
| **Owned (synced)** | "How I'm playing this" | Playtime, trophies/achievements, status, notes, HLTB, per-platform breakdown |
| **Owned (manual)** | "What I own" | Cover, platform, manual notes, HLTB, completion status — no playtime / trophies |
| **Wishlisted, released** | "Why I want this" | Cover, gallery, current price across stores (S10), critic reviews / news, HLTB, deal alerts |
| **Wishlisted, upcoming** | "When can I play this" | Countdown, hype, gallery, news, trailers, "remind me at launch" |
| **Subscription-available** | "Playable now via X" | Subscription source (Game Pass etc.), expiry warning, "add to active rotation," limited playtime tracking |
| **Completed** | "Memorial / log entry" | Completion date, playtime, rating, notes, "play again" CTA |

Each state's detail-page variant is a real design surface. Some content (gallery, news, deals) is shared across multiple states. Strategic implication: the page isn't a v1 polish task — it's a v2 design surface that needs proper interaction-flow work.

### S10. Deals & offers is a first-class data domain, not a feature add-on

A "companion for any collector" tracks price + availability across stores, both official and third-party. This is a substantial new domain — entirely separate from the library / wishlist / release domains:

- **First-party storefronts:** Steam, PSN, Xbox, Nintendo eShop, Epic, GOG — each has a public price endpoint or scrape-friendly page
- **Third-party key resellers:** Instant Gaming, Kinguin, G2A, GreenManGaming, GamerHash, etc. — often substantially cheaper but with grey-market caveats
- **Aggregators:** IsThereAnyDeal API is the canonical aggregator for both first-party + third-party pricing. **Building on IsThereAnyDeal is probably the right horizon-2 path** rather than scraping each store individually.
- **Secondhand marketplaces** are a related but distinct domain — see S12 below. eBay / Vinted / Mercari / Yahoo Auctions Japan / specialist retro shops have *listings* (many concurrent per item, each with condition / region / seller) rather than canonical *prices*. Lives in its own opportunity (O11) and entity family (`Marketplace`, `MarketplaceListing` per `CONCEPTUAL_MODEL.md` §3.18–3.19).

**Operational consequences:**
- The wishlist page becomes a price-radar surface — "what's on sale from my want list right now?"
- Detail pages (released wishlisted games per S9) need a "where to buy / current prices" section
- Notification logic for "wishlisted game dropped below $X" — needs N12 (feedback channel) shape generalised to outbound notifications
- The third-party grey-market angle has positioning implications: surfacing Kinguin / G2A at all is a value-judgment about supporting key reselling. Worth a conscious decision (call it S10a if pinned).

### S12. Secondhand marketplace listings are a distinct data domain from digital deals

Per S0 + S11, serious collectors want to know *where to find* missing pieces — not just where to buy new at retail. A user building a SNES collection asking *"where can I get a Earthbound cart, and what's it going for?"* is doing something different from a user asking *"where's the best digital price on Persona 5?"* — different intent, different data shape, different UI. **And the same collector also needs to find the hardware itself** — *"where can I buy a SNES?"* / *"I'm missing a working AV cable for my Master System"* — which is the same marketplace shape with a different target.

**Strategic intent:**
- Integrate secondhand marketplace listings (eBay / Vinted / Mercari / Yahoo Auctions Japan / specialist retro shops) as a parallel data domain to S10's digital-deals work
- Cover **both Game listings AND Hardware listings** in the same entity (per CM9 — polymorphic `MarketplaceListing` with `targetType ∈ {GAME, HARDWARE}`). A SNES cart on eBay and a SNES console on eBay are the same kind of thing — a marketplace post with the same sync flow / lifecycle / query patterns — the target just varies.
- Surface Game listings on the physical-wishlisted detail-page variant (per S9 split + CONCEPTUAL_MODEL §3.4.1 wishlisted-physical state)
- Surface Hardware listings on **RetroPlatform detail surfaces** and on the Collection page (per S11) — NOT as a Game detail variant. "Find a SNES" lives where you're looking at SNES things; "find Earthbound" lives where you're looking at Earthbound.
- Use the collector-completionist mental model — "find this for my collection / setup" — not the bargain-hunter model
- The conceptual model names the entities: `Marketplace` + `MarketplaceListing` (CONCEPTUAL_MODEL §3.18–3.19), polymorphic on target per CM9, kept distinct from `Store` + `Deal` per CM8

**Operational implications:**
- Data sourcing is harder than digital deals — eBay has a paid API; Vinted / Mercari are scrape-only with community libraries; coverage is patchy and region-shaped (Vinted is EU-leaning, Mercari is JP-leaning)
- The aggregation question (median / lowest / recent-sales) is a UX call, not a model call (per OQ-15 in CONCEPTUAL_MODEL)
- Region matters across both Game and Hardware listings — a US collector mostly wants NTSC-U; a JP collector wants NTSC-J. A PAL SNES won't accept NTSC carts without modding. Filter by region as a first-class affordance on both lanes.
- Hardware listings have a `CONSOLE_BUNDLE` escape hatch — eBay listings like "SNES + 7 games + 2 controllers" render in a separate UI lane rather than mixing with single-target listings, because the sync flow doesn't disambiguate which targets are inside (per §3.19 key model decision)
- **Hardware ownership tracking is a parallel opportunity in scope (see S13 below).** Marketplace listings answer "where do I buy a SNES"; `UserHardware` (CONCEPTUAL_MODEL §3.20, per CM10) answers "what hardware do I own / want / used to own." Both ride on the same RetroPlatform infrastructure (B10) and share enums (`HardwareKind`, `HardwareCompleteness`, `Condition`, `Region`). The "find a SNES" CTA can be ownership-aware ("you already own one → find accessories?") once UserHardware is populated.
- Late-horizon-2 / horizon-3 territory — depends on retro-platform infrastructure (B10) landing first

### S13. Hardware ownership is part of collection-completion scope, not just games

Per S0's "any platform a gamer could own games on" + S11's collector surface + Andrea's 2026-05-22 scope pushback: Hoard's user owns *games AND the hardware to play them on*. A SNES collector tracks both the carts AND the console + controllers + Super Game Boy + AV cable. Without modeling hardware ownership, the Collection page (S11) is half-built — it can list a user's SNES games but can't answer "do I have a SNES to play them on?", and the "find a SNES" CTA from S12 can't be ownership-aware ("you already own one → here are accessories instead").

**Strategic intent:**
- Hardware ownership lives in a new `UserHardware` entity (CONCEPTUAL_MODEL §3.20, per CM10), parallel to `UserGame` for software
- Status lifecycle mirrors UserGame: `OWNED | WISHLIST | SOLD | DROPPED` — collectors *do* wishlist hardware before buying ("I want a CIB SNES with a working battery") and `SOLD` history matters ("I used to have one, want it back" is a real collector state)
- Free-text `displayName` field lets users name specific items ("Super Game Boy", "Multitap", "Henrik RGB mod cable") without forcing a HardwareItem reference catalog (OQ-17 stays deferred)
- Light collector metadata: `quantity`, `condition`, `region`, `hardwareCompleteness`, `modded` + `modNotes`, `testedWorking`, optional `acquisitionDate` / `acquisitionPrice` / `acquisitionMarketplaceId`
- Surfaces: the RetroPlatform detail page shows three lanes — **owned hardware** + **owned games** + **marketplace listings**. The Collection page (S11) summarizes hardware ownership per console-era ("you own: 1 SNES (PAL, CIB), 2 controllers, Super Game Boy")

**Operational consequences:**
- Schema add: one new entity + one new enum (`HardwareOwnershipStatus`). Reuses existing enums (`Condition`, `Region`, `HardwareKind`, `HardwareCompleteness`) — no new ones for the most part.
- "I got this!" UX shortcut on a `MarketplaceListing` pre-fills a new `UserHardware` row but with NO hard FK between them (listings are transient, ownership is durable per §3.20 key decision)
- The B11 marketplace work and the B12 ownership work are tightly coupled — ship together as one bundled workstream rather than two phases
- The "find a SNES" CTA (B11h) becomes ownership-aware: hides itself if `UserHardware(retroPlatform=SNES, hardwareKind=CONSOLE, status=OWNED)` exists; pivots to "find accessories" if true
- Hardware ownership data is also the foundation for late-horizon-3 features like collection valuation ("your SNES setup is currently worth ~€450 based on recent eBay sales of comparable-condition rigs")

### S14. AI-powered features are user-funded via BYO API key; Hoard never processes payments

Hoard is a free personal tool. Some features have real per-call costs — Claude vision for hardware identification (B12h) is the first; future features may join. These costs cannot be absorbed by Hoard at any meaningful cohort scale, and Hoard does not want to process payments (Stripe account, customer records, tax reporting, financial-services compliance overhead is inconsistent with "free indie tool" identity).

**Strategic intent:**
- Cost-bearing features (anything calling a paid third-party AI API) require the user to configure their own API key
- The user pays the provider directly; Hoard never sees a cent from AI features
- Voluntary tips ("buy me a coffee") let goodwill flow back, handled via external venue (Buy Me a Coffee) so Hoard handles no payment infrastructure
- Tip mentions are deliberately soft — Settings only + 1–2 contextual soft mentions after meaningful actions (post-first-sync, post-first-manual-add, post-first-hardware-add). Not aggressive, not modal, not behind any feature.
- The rule **"AI features are user-funded via BYO key; everything else is free forever"** is communicable and trustworthy; the precedent matters more than any single feature

**Operational implications:**
- New `UserApiKey` entity (CONCEPTUAL_MODEL §3.22, per CM11) holds encrypted keys per (user, provider)
- Anthropic-only at launch (per Andrea 2026-05-22); future multi-provider expansion (OpenAI, Google Vision) is a deferred research question (OQ-19) — driven by cohort signal, not preemptive
- AI features have an explicit "key missing / invalid / exhausted" UX with clear copy and link to provider sign-up
- No "demo mode" with free Hoard-paid AI calls — would mean Hoard absorbing real costs at scale
- Tip jar venue is **Buy Me a Coffee** — handles compliance/taxes/processing externally
- Implementation of soft tip-mention triggers can hook into the existing `UserEvent` feed (TL-series) + client-side localStorage for dismissal state; no new entities needed for v1

### S11. Retro / physical collection is a first-class surface, not a platform-picker entry

Per S0's "any platform a gamer could own games on" + S7's "manual-add is first-class," retro consoles + physical media deserve more than presence in a dropdown. Serious collectors of NES carts, PS1 discs, Game Boy collections, etc. want a **dedicated surface** that reflects their identity as collectors — not just a flat list of games filtered by a platform code.

**Strategic intent:**
- A retro / physical collection page (sub-route, sidebar entry, or library-mode toggle) that shows physical / retro entries with appropriate metadata: shelf location, condition notes, region (NTSC-U / NTSC-J / PAL), completeness (CIB / loose / sealed), authenticity, value-tracking (optional, late-horizon-2)
- Console-grouped views: "my SNES games," "my Game Boy collection" — collectors think in terms of console-eras, not chronological order
- The aesthetic is naturally well-suited to this — terminal-style cataloguing maps to physical-collection-logbook UX

**Operational consequences:**
- The conceptual model needs the retro-platform enumeration question (per S7) AND a "collection metadata" extension (shelf, condition, region, completeness). Bigger schema effort than horizon-1 manual-add.
- The information architecture grows beyond Library + Releases + Dashboard + Game-detail. A new top-level concept ("Collection" or similar) may be needed. Or "Library" expands to subsume both digital + physical with view-mode toggles.
- This is a late-horizon-2 push (2027-Q1+) — it depends on the conceptual-model work + on S7's manual-add UX maturity.

---

## 2. Opportunity mapping (Phase 2 — which §10 needs serve this outcome)

Cutting against §10's full N1–N12 list. Outcome S2 is about COMPLETENESS — which needs, if well-served, would close the gap between "good personal tool" and "true partner for any collector"?

| Need | In tree? | Why / why not |
|---|---|---|
| **N1** status-from-play | No (maintenance) | Already well-served. Not a gap. |
| **N2** trust restoration on remap | No (maintenance) | Already well-served. Not a gap. |
| **N3** liveness as credibility | **Yes** (constraint) | Per S1, Andrea-only needs are first-class. Liveness is part of "true partner" feel. Maintenance, not new investment. |
| **N4** scope invariant | **Yes** (constraint) | Same as N3. |
| **N5** welcome orientation | No | Orthogonal to outcome. Pre-app friction, not in-app completeness. |
| **N6** aesthetic as identity | **Yes** (constraint, not variable per S1) | Constitutive of the product. No bets target it — protected by S1 across all bets. |
| **N7** relevant-now on app-open | **Yes** | Dashboard is the daily-tool entry-point. Without a strong N7, completeness fails the "primary library tool" test. |
| **N8** one game across platforms | No (maintenance) | Well-served at data layer. Not a gap. |
| **N9** data-freshness affordance | **Yes — primary** | Major gap. Without "I know this is current," completeness fails the trust test. |
| **N10** wishlist as planning | **Yes** | Assumed need but tactical UX surface that completes the wishlist→play loop. Validation via telemetry pending. |
| **N11** complete library across all owned platforms | **Yes — primary** | THE biggest gap. Xbox + GOG are stubs; Nintendo + Epic are manual-only. A multi-platform collector with games on these platforms cannot use Hoard as a primary tool. |
| **N12** feedback channel | No (maintenance + monitoring) | Already shipped + monitored. Meta-channel, not core completeness. |

**Plus one operational opportunity not from §10:** **Admin IA structural redesign + delete feedback.** Captured in CLAUDE.md known-gaps post-deploy. Affects Andrea's ability to OPERATE Hoard as it grows. Not a user-facing completeness gap but a strategy-relevant one because Andrea is the primary user.

**Plus four scope-expansion opportunities surfaced 2026-05-22** (per S8 / S9 / S10 / S11 stances). These were not in the §10 user-needs corpus because they emerged from the strategic re-framing rather than from observed behaviour:

- **O6 (per S9) — Game-detail page as state machine.** Owned-synced / owned-manual / wishlisted-released / wishlisted-upcoming / subscription-available / completed. Each variant a real design surface. Affects every UserGame.
- **O7 (per S10) — Deals & offers across stores.** First-party + third-party (Instant Gaming, Kinguin, G2A, GMG, etc.) via IsThereAnyDeal API as aggregator. New data domain entirely.
- **O8 (per S8) — New entry paths for released-but-not-owned games into the Library Wishlist shelf.** No model change — `UserGame.status='Wishlist'` already supports any game. The gap is UX: manual-add with Wishlist as initial status, search-result "+ wishlist" action, GameDetail "+ wishlist" CTA for not-in-library games. Releases page (and `WishlistRelease` model) stays upcoming-only by design.
- **O9 (per S11) — Retro / physical collection surface.** Dedicated UI for cart / disc / region / condition / completeness collectors. Late-horizon-2.

### Opportunities in this tree (final list, 9):

- **O1** (N11) — Complete platform coverage
- **O2** (N9) — Data-freshness affordance
- **O3** (N10) — Wishlist as planning tool
- **O4** (N7) — Dashboard as daily-tool entry-point
- **O5** (admin) — Admin IA redesign for operating Hoard as it grows
- **O6** (S9) — Game-detail page as state machine
- **O7** (S10) — Deals & offers across stores
- **O8** (S8) — Wishlist extends to released-but-not-owned
- **O9** (S11) — Retro / physical collection as a first-class surface
- **O11** (S12) — Secondhand marketplace listings for collector-completion: **games AND hardware** (per CM9 — polymorphic listings) *(added 2026-05-22, hardware scope added same day)*
- **O12** (S13) — Hardware ownership / inventory tracking — "what consoles + controllers + accessories do I have, want, used to have" (per CM10 — `UserHardware` entity §3.20) *(added 2026-05-22 per Andrea's scope pushback)*

S1 constraints (N3 / N4 / N6) ride along every bet — bets are evaluated for aesthetic + liveness + scope coherence as a constraint check, not as separate opportunities.

---

## 3. Opportunity Solution Tree (Phase 3 — bets per opportunity)

```mermaid
graph TD
    NS[North Star S0: THE companion for any videogame enthusiast and collector — any source, any platform]
    NS --> OUT[Outcome S2 horizon-1: Credible primary library tool for multi-platform PC+console collector by 2026-Q3]
    NS --> H2[Horizon-2 expansion: subscription / retro / physical / deals / wishlist-extended / detail-variants]

    OUT --> O1[O1: Complete platform coverage<br/>N11 + S0/S7]
    OUT --> O2[O2: Data-freshness affordance<br/>N9]
    OUT --> O3[O3: Wishlist as planning tool<br/>N10 telemetry-validatable]
    OUT --> O4[O4: Dashboard as daily-tool entry-point<br/>N7 telemetry-validatable]
    OUT --> O5[O5: Admin IA redesign<br/>operational]
    OUT --> O8[O8: Wishlist entry paths for released games<br/>S8 — UX, no model change]

    H2 --> O6[O6: Detail-page state machine<br/>S9 — variants per state]
    H2 --> O7[O7: Deals and offers across stores<br/>S10 — new data domain]
    H2 --> O9[O9: Retro / physical collection surface<br/>S11 — dedicated UI]

    O1 --> B1a[B1a: Xbox Live sync via OpenXBL]
    O1 --> B1b[B1b: GOG sync via community endpoints]
    O1 --> B1c[B1c: Manual-add UX overhaul S7 first-class<br/>includes B9a Wishlist-as-initial-status]

    O2 --> B2a[B2a: lastSyncAt badge across views]

    O5 --> B5a[B5a: Tabs at top of /admin]
    O5 --> B5d[B5d: DELETE feedback endpoint + confirm]

    O8 --> B9a[B9a: Wishlist as initial status on manual-add<br/>folds into B1c]
    O8 --> B9b[B9b: Search-result + wishlist action]
    O8 --> B9c[B9c: GameDetail + wishlist CTA for not-in-library]
    O8 --> B9d[B9d: Heterogeneous shelf UI decision]
    O8 --> B9e[B9e: Wishlist sort / filter modes]

    O6 --> B7a[B7a: Detail-page variant for manual entries<br/>honest no-sync-data treatment]
    O6 --> B7b[B7b: Detail-page variant for wishlisted-released<br/>gallery + news + price]
    O6 --> B7c[B7c: Detail-page variant for completed<br/>memorial / log entry mode]

    O7 --> B8a[B8a: IsThereAnyDeal API integration<br/>aggregator-first approach]
    O7 --> B8b[B8b: Price-radar on wishlist surface<br/>what's on sale from my list]
    O7 --> B8c[B8c: Per-game where-to-buy section on detail]

    O9 --> B10a[B10a: Retro platform enumeration in conceptual model]
    O9 --> B10b[B10b: Retro/physical collection page<br/>console-grouped views]
    O10[B10c: Collection metadata fields<br/>shelf, condition, region, completeness] -.--> O9

    classDef primary fill:#d4a017,color:#07090a,stroke:#23292d
    classDef secondary fill:#69a1d4,color:#07090a,stroke:#23292d
    classDef horizon2 fill:#5fc26a,color:#07090a,stroke:#23292d
    classDef defer fill:#6b6f72,color:#ece8de,stroke:#23292d
    class B1a,B1c,B2a,B5a,B9a,B9b,B9c primary
    class B1b,B5d secondary
    class B7a,B7b,B7c,B8a,B8b,B8c,B9d,B9e,B10a,B10b,O10 horizon2
```

(Mermaid: amber = horizon-1 top priority; blue = horizon-1 secondary; green = horizon-2 expansion; grey = deferred. The S0 → horizon-1 + horizon-2 split is the top-level structural decision; the OST under it is a working sketch that will refine as conceptual-model + interaction-flow layers run.)

---

## 4. Prioritised bets with experiments (Phase 4 + 6)

### Top horizon-1 bets to pursue (2026-Q3, 4-month window)

Expanded from 3 to 5 after S0 / S7 reframing. The original "defer Xbox/GOG, double-down on Steam/PSN polish" framing died — under S0 all common sources are first-class.

---

#### **Bet B1a — Xbox Live sync via OpenXBL API** *(Primary; serves O1)*

> *We could implement Xbox Live library sync via OpenXBL (the apiKey credentials path already exists on `Platform.credentials`), which we believe would close the largest completeness gap (N11) for any cohort member with Xbox games.*

- **Core assumption:** OpenXBL's library endpoint is stable + returns enough metadata (title, playtime if available, last-played timestamp) to populate `UserGame` rows comparable to Steam/PSN. **Risk: medium** — OpenXBL is community-maintained, has rate limits, and Xbox playtime data may not be available without a Microsoft account permission Andrea doesn't yet have.
- **Aesthetic-constraint check (S1):** Pure backend integration — no UI surface, aesthetic-neutral. ✓
- **Effort:** ~1–2 days (similar shape to the PSN integration that exists; smart-matcher reused).
- **Reversibility:** High. If the integration is poor, leave the stub returning `[]` and document why. Low blast radius.
- **Experiment (B1a-E):** Before committing to the full integration, do a 30-minute scratch test against Andrea's own Xbox Live account (Andrea has Xbox games per the manual entries in his library). Hit OpenXBL's `/2.0/players/me/games` endpoint with a test API key, inspect the response shape, decide whether playtime + last-played data are present. If yes → green-light the workstream. If no (data too sparse) → fall back to B1c (improved manual-add).

---

#### **Bet B2a — "last synced N hours ago" badge across Library / Dashboard / Releases** *(Secondary→Primary; serves O2)*

> *We could add a small `lastSyncAt` badge on every view that shows synced data (Library, Dashboard, Releases), which we believe would close the N9 data-freshness gap with minimal cost and serve the "true partner" trust dimension.*

- **Core assumption:** Users (Andrea + cohort) need passive freshness signal, not active "refresh" button. **Risk: low** — Andrea already has the data (every sync writes `Platform.lastSyncAt`); only the UI surface is missing.
- **Aesthetic-constraint check (S1):** Mono-styled relative-time string, terminal-aesthetic-native. Already used in admin section ("// 2h ago"). ✓
- **Effort:** ~half-day. UI-only across 3 surfaces.
- **Reversibility:** Trivial. Pure additive UI.
- **Experiment:** None needed. Ship and observe. If telemetry shows users still asking "is this current?" via feedback (N12), iterate to B2b (stale warning at >7 days).

---

#### **Bet B1b — GOG sync via community endpoints** *(Promoted from deferred to primary under S0; serves O1)*

> *We could implement GOG library sync via community API endpoints (no official API exists), which we believe would extend coverage to a major DRM-free storefront that serious PC collectors commonly use.*

- **Core assumption:** Community-maintained GOG endpoints are stable enough for a personal-tool use-case, with documented or reverse-engineered patterns reliable across user accounts. **Risk: medium-high** — community endpoints can change without notice; rate-limiting is undocumented; auth flow is non-standard.
- **Aesthetic-constraint check (S1):** Backend integration, aesthetic-neutral. ✓
- **Effort:** ~1–2 days for happy-path; +0.5–1 day for resilience against endpoint drift.
- **Reversibility:** High. Stub returns `[]` if integration breaks; users fall back to manual-add (B1c) which under S7 is a first-class path anyway.
- **Experiment (B1b-E):** Scratch-test against Andrea's GOG account (if he has one) OR a research session reading the most-current community documentation + scratch-test before commitment. Same shape as B1a-E.

---

#### **Bet B1c — Manual-add UX overhaul** *(Promoted from deferred to primary under S7; serves O1 + S7)*

> *We could rebuild the manual-add flow as a first-class primary path — full platform picker spanning every recognised platform (not just the 6 sync-capable ones), IGDB-fast search, ≤30-second add-time for indexed games — which we believe would close the "any source, any platform" promise for sources that will never have an API.*

- **Core assumption:** Manual-add can be made fast enough that a user doesn't feel "downgraded" when adding a Nintendo / Epic / physical / retro game. **Risk: low-medium** — the IGDB search is already fast; the new work is the platform picker expansion + duplicate detection + bulk-import path.
- **Aesthetic-constraint check (S1):** Plat picker as terminal-style `[ NES ] [ SNES ] [ Genesis ]` etc. expands naturally. ✓
- **Effort:** ~2–3 days. Bulk-import (CSV) adds another day if included.
- **Reversibility:** Medium. Once collectors have manually populated retro libraries, the data shape becomes load-bearing. The conceptual-model surface (`media_type`, retro platform codes) needs `/layers-conceptual-model` before this lands at full scope.
- **Experiment (B1c-E):** Sketch the platform picker in ASCII showing the proposed full list (PC/PS/Xbox/GOG/Nintendo eShop/Epic/Itch + retro consoles + physical-media flags). Andrea reviews. Then scope the conceptual-model question separately — partial B1c without the model changes is still valuable.

---

#### **Bet B5a + B5d combined — Admin IA tabs + delete-feedback** *(Primary; serves O5)*

> *We could redesign /admin with a tab-based navigation (PENDING / FEEDBACK / USERS / CODES / EVENTS) and add a DELETE capability on feedback rows, which we believe would unblock Andrea's growing operational load as feedback + events accumulate.*

- **Core assumption:** Tabs are the right primitive vs. accordion or sub-routes. **Risk: medium** — tabs work well for ≤7 categories; if a 7th admin section ever lands, structure breaks. Accordion would handle that more gracefully. Sub-routes (each section as `/admin/feedback` etc.) would handle even more but introduce navigation friction for the daily-skim workflow.
- **Aesthetic-constraint check (S1):** Tabs implementable in terminal aesthetic (mono-styled, `[ tab ]` pseudo-bracket format). ✓
- **Effort:** ~1 day for design + ~1 day implementation. The "+ delete feedback" addition is ~half-day on top — small endpoint + confirm dialog + tests.
- **Reversibility:** Medium. Once admin users are used to tabs, reverting feels like a regression. Worth design-pass thought.
- **Experiment (B5a-E):** Before implementation, sketch the tab vs. accordion vs. sub-routes options in ASCII (terminal-aesthetic-native sketches) and Andrea picks. ~30 min of sketching. The decision should be documented as a locked decision in the workstream's plan doc.

### Deferred bets within horizon-1 (Phase 5)

These remain in the 2026-Q3 horizon as candidates but explicitly NOT pursued first. Re-evaluate at the 2026-08 signal review.

- **B1d (defer Xbox/GOG entirely)** — REJECTED as a path under S0 / S2. Leaving major storefronts as stubs forfeits the north star.
- **B2b (stale-data >7d warning)** — DEFER. Build on top of B2a if needed. Pure additive on B2a's surface.
- **B3a (Coming-up Dashboard surface)** — DEFER until telemetry validates N10. If `wishlist.toggled` → `session.opened` correlation is real at 2026-06-04 review, promote to next-investment. If not, hold.
- **B3b (wishlist→library auto-transition refinement)** — DEFER. Partially shipped; full auto-transition needs platform-side identity tracking which is a v2 schema-change effort.
- **B4a / B4b (Dashboard redesign based on telemetry)** — DEFER. Pure telemetry-dependent; can't act until 2026-06-04 review at earliest.
- **B5b / B5c (accordion / sub-routes for admin)** — DEFERRED ALTERNATIVES to B5a. Pick one as part of B5a's experiment.

### Horizon-2 bets (post-2026-Q3, serving S0 beyond the milestone)

These are the bets that make Hoard "THE companion for any videogame enthusiast and collector" in its full sense. Explicitly NOT in the 2026-Q3 horizon-1 — they're tracked here so they don't get lost and so the conceptual-model layer can prepare for them.

**Source expansion (storefronts beyond mainstream):**
- **B6a — Itch.io library sync.** Itch.io has a public REST API (`/api/1/<key>/my-owned-keys`). Indie / experimental games population. Effort: ~1 day.
- **B6b — Humble Bundle library sync.** Humble has a less-documented API + a key-claim flow. Worth investigating because many collectors have large Humble libraries.
- **B6c — Microsoft Store / Xbox-game-pass-not-PC tracking.** Separate from B1a (Xbox Live console games); covers PC-via-MS-Store + Game Pass for PC.

**Subscription tracking (different from "owned"):**
- **B6d — Xbox Game Pass catalog tracking.** A game in Game Pass is playable but not owned. Needs `source_type` distinction at the conceptual-model layer.
- **B6e — PS Plus Catalog + Premium tracking.** Same conceptual-model dependency.
- **B6f — EA Play / Ubisoft+ tracking.** Smaller catalogs but same shape.

**Physical media + retro:**
- **B6g — Physical disc catalog (PS5 / Xbox Series X|S / Switch).** Manual-add with explicit "physical disc" flag. Already partly served by S7 / B1c if the conceptual-model adds `media_type`.
- **B6h — Retro console enumeration.** NES through Wii U; Game Boy through 3DS; Genesis / SNES / Saturn / Dreamcast / etc. Some 30+ platforms. Could be IGDB-driven (they index retro platforms). The platform-picker UX in B1c needs the conceptual-model to support these before horizon-2 ships.
- **B6i — ROM / emulation library cataloguing.** Different from physical retro media. Could integrate with RetroAchievements API for playtime / progress data.

**Bulk operations + power-user tools:**
- **B6j — Bulk import (CSV / spreadsheet).** For collectors with existing detailed records (BackLoggd export, Grouvee, Listography, spreadsheets).
- **B6k — Bulk-add via barcode/UPC scanner.** Physical-media-collector affordance; mobile-camera capability via PWA `BarcodeDetector` API (no app store). Lookup pipeline: UPC → MobyGames / UPCitemdb → resolve to IGDB ID → add to library. **Free feature — no AI cost, mature technology.** Best ROI of the four capture mechanisms (per 2026-05-22 discussion); promote in horizon-2 priority. Covers boxed games (current-gen + retro CIB); loose carts/discs fall through to B6l.
- **B6l — OCR-assisted manual-add.** *(added 2026-05-22)* Tesseract.js runs **client-side** (no AI cost) to read game title text off a cartridge label, disc spine, or case cover; prefills the IGDB search field; user confirms the match. Lighter than full cover-art reverse-search; no ML training required; ships fast. **Free feature.** Complements B6k: barcode for boxed/sealed items, OCR for loose carts and damaged-box cases where the UPC isn't visible. Hardware OCR not in scope (consoles have molded-plastic model names that OCR handles poorly).

**Conceptual-model dependencies blocking horizon-2:**
The horizon-2 bets require schema additions that should be designed coherently rather than per-bet. Flagged as input to `/layers-conceptual-model`:
- `source_type` enum on `UserGame` or `Platform` (owned / subscription / borrowed / demo / free-with-prime / etc.)
- `media_type` enum (digital / physical-disc / physical-cart / rom)
- Expanded `PlatformCode` enum OR a separate `RetroPlatform` model (NES / SNES / Genesis / etc.) — the design call here is meaningful for query patterns
- Bulk-import data shape (column schemas, deduplication rules, manual-vs-synced precedence)
- **`WishlistRelease` scope reframe** (per S8) — the model is currently upcoming-release-shaped; needs to absorb released-but-not-owned wishlist items. Rename to `WishlistItem` with optional upcoming-release fields, or split into two related concepts.
- **Detail-page state enum** (per S9) — implicit in UserGame.status + the new media_type/source_type combinations, but worth pinning as an explicit derived state for UI variant routing.
- **`Deal` domain model** (per S10) — new tables for per-game-per-store pricing snapshots, deal-alert subscriptions, IsThereAnyDeal API response caching. Entirely orthogonal to library / wishlist domains.
- **Collection metadata fields** (per S11) — shelf location, condition (CIB / loose / sealed), region (NTSC-U / NTSC-J / PAL), authenticity. Optional fields on UserGame for physical / retro entries. Late-horizon-2 — design after retro platform enumeration lands.

### Newly added horizon-2 bet families (per the 2026-05-22 scope expansion)

**Detail-page variants (O6 / S9):**
- **B7a — Detail variant: owned-manual.** Hides sync-only sections (playtime, trophies, last-played) honestly with a "// not tracked — added manually" affordance + optional CTA for the user to log playtime / completion status by hand.
- **B7b — Detail variant: wishlisted-released.** Cover, gallery, news mentions, current-price-across-stores section (depends on B8), HLTB, deal-alert toggle.
- **B7c — Detail variant: completed.** Memorial / log entry mode — completion date, total playtime, rating, notes, "play again" CTA. Subtle aesthetic shift (e.g., muted-state styling) to mark "done."
- **B7d — Detail variant: subscription-available.** Subscription source label (Game Pass / PS Plus), expiry warning if the game is leaving the catalog soon, "add to active rotation" CTA.
- **B7e — Shared content blocks** (gallery, news feed, HLTB, store prices) factored into reusable components so the variants share rather than duplicate.

**Deals & offers (O7 / S10):**
- **B8a — IsThereAnyDeal API integration.** Aggregator-first approach over per-store scraping. Cache pricing snapshots; rate-limit-respectful refresh cadence.
- **B8b — Price-radar surface on the wishlist / want-list page.** "What's on sale from my list right now?" — uses S0's wishlist-as-want-list reframe to be useful for both released + upcoming.
- **B8c — Per-game where-to-buy section on detail page.** Renders on wishlisted-released + owned detail variants.
- **B8d — Deal-alert notifications.** "Wishlisted game dropped below $X" — needs notification-channel infrastructure (out-of-band: email, push, in-app). Deferred to subscription-channel buildout (relates to N12 generalised).
- **B8e — Third-party (Kinguin / G2A) inclusion policy.** Strategic decision more than implementation — whether to surface grey-market resellers. Worth a S10a-style lock when the bet runs.

**Wishlist entry paths (O8 / S8) — corrected 2026-05-22 after Andrea's pushback:**
No model change needed (`WishlistRelease` stays upcoming-shaped; `UserGame.status='Wishlist'` already supports any game). What's missing is UX:
- **B9a — Wishlist as a selectable initial status on manual-add.** Folds into B1c's UX overhaul (which is horizon-1, so this lifts into horizon-1 with it). Picker gains a "status: Backlog / Playing / Wishlist / ..." row alongside the existing platform / title fields.
- **B9b — Search-result `+ wishlist` action.** TopBar search results currently surface games with a `+ backlog` quick-add (or the game's existing status if already in library). Add a sibling `+ wishlist` action.
- **B9c — GameDetail `+ wishlist` CTA for not-yet-in-library games.** When a user navigates to a game's detail page (e.g., via search or IGDB cross-reference) and doesn't have it in their library, the page surfaces `+ wishlist` alongside the existing add-to-library actions.
- **B9d — Library Wishlist shelf heterogeneous-entries UI decision.** Shelf shows BOTH "tracked-upcoming" entries (have WishlistRelease companion) AND "released-want-this" entries (UserGame-only). UX question: visually distinguish them or not? Probably not on the shelf; the upcoming-specific affordances live on the Releases page only.
- **B9e — Wishlist sort / filter modes.** By date-added, by upcoming-release-date (if WishlistRelease present), by "now on sale" (intersects with B8b). Lives in the Library Wishlist shelf.

**Secondhand marketplace listings (O11 / S12):**
- **B11a — eBay Marketplace API integration.** Paid API but stable; covers global. Probably the first marketplace to ship — biggest catalog, most mature data. **Covers both Game AND Hardware listings** per CM9 — eBay's category tree distinguishes "Video Games" from "Video Game Consoles" / "Controllers & Attachments" cleanly enough to populate `targetType` + `hardwareKind` at sync time. Bundle disambiguation is the failure mode → falls back to `CONSOLE_BUNDLE`. Note: API rate limits + paid tiers affect operational cost.
- **B11b — Vinted scrape integration.** No public API; community libraries exist. EU-leaning catalog; complements eBay's reach. Higher operational risk (scraping breakage). Vinted's category tree is less crisp than eBay's — hardware vs. game disambiguation will require keyword heuristics on listing titles.
- **B11c — Mercari / Yahoo Auctions Japan integration.** Critical for retro collectors interested in NTSC-J originals (both carts AND Japanese-region consoles like the AV Famicom, Super Famicom, PC Engine). Japanese-language listings need translation surfacing.
- **B11d — Specialist retro shops aggregation.** Stone Age Gamer, DKOldies, RetroGames.bz, etc. — smaller catalogs but higher trust (specialist sellers, no scams, tested-working guarantees). These often sell hardware alongside games. May be RSS / sitemap-scrape territory.
- **B11e — Marketplace listing UX on Game detail page.** Physical-wishlisted detail variant (per S9 + §3.4.1) renders the Game-target listing feed with region / condition / price filters. Surface design — depends on B11a landing first.
- **B11f — "Find a copy" CTA from Collection surface.** When a user is viewing their SNES collection and notices a missing game, a one-tap "find a copy" CTA opens the marketplace-listing feed for that title. Late horizon-2.
- **B11g — Hardware-listings UX on RetroPlatform detail / Collection surface.** When a user opens their SNES collection page (or directly the SNES RetroPlatform detail surface), shows three lanes: (1) consoles (sorted by completeness desc then price asc), (2) controllers + accessories, (3) bundles. Region filter as first-class affordance. Depends on B10 (retro platform infrastructure) + B11a landing.
- **B11h — "Find a SNES" / hardware-completion CTA.** From the Collection surface, a one-tap CTA per console: "find a SNES" / "find a Super Game Boy" / "find an N64 RGB cable." Same shape as B11f but targets `RetroPlatform` + `hardwareKind` instead of `Game`. The natural collector-completionism cohesion bet — closes the loop "I'm building a SNES collection" → "I don't have the console yet" → "here are the consoles available right now." **Becomes ownership-aware once B12 ships** — hides itself when the user already owns the console; pivots to "find accessories" instead.

**Hardware ownership / inventory tracking (O12 / S13):**
- **B12a — `UserHardware` schema + migrations.** One new entity (per CONCEPTUAL_MODEL §3.20, CM10) + one new enum (`HardwareOwnershipStatus`). Reuses existing enums (`Condition`, `Region`, `HardwareKind`, `HardwareCompleteness`). Lighter schema effort than the marketplace integration work; can ship in parallel with B11a–c.
- **B12b — Hardware add/edit UX.** Mirrors the manual-add-game flow (per B1c). Platform picker (RetroPlatform selection) → hardware kind picker → optional `displayName` free-text → status + condition + region + completeness. Designed to be fast for the common case ("I have a SNES") and extensible for collectors who care about modded / tested-working / acquisition history.
- **B12c — Collection-page hardware summary.** Per console-era, summarize: "you own: 1 SNES (PAL, CIB), 2 controllers, Super Game Boy, RGB cable." Wishlist counts separately ("wanted: 1 console"). Sold/dropped items in a collapsed "previously owned" section.
- **B12d — RetroPlatform detail page three-lane layout.** Owned hardware (per UserHardware) + owned games (per UserGame filtered by retroPlatformId) + marketplace listings (per B11g). The hardware lane sorts CONSOLE first, then CONTROLLER, then ACCESSORY/CABLE/OTHER.
- **B12e — "I got this!" pre-fill from marketplace listing.** When a user clicks a `[+ I got this]` button on a tracked `MarketplaceListing`, pre-fill a UserHardware row with the listing's marketplace + price (as `acquisitionPrice`) + region + condition + hardwareCompleteness. No hard FK — the listing can expire, the ownership row persists.
- **B12f — Ownership-aware CTA wiring on B11h.** Hide "find a SNES" when an OWNED SNES UserHardware row exists. Surface "find SNES accessories" / "find a second controller" / "find a CIB upgrade" depending on owned-hardware completeness.
- **B12g — Hardware mod-history surface.** Late-horizon-2 / horizon-3 — for the modded-console subcohort (RetroTink upscalers, region-mod chips, internal SSDs on classic consoles). May warrant its own surface or just rich notes on UserHardware.
- **B12h — Camera-driven hardware identification via Claude vision.** "Point your phone at this thing, tell me what it is." Best fit: the *"what is this?"* garage-sale moment — found something unfamiliar at a flea market, want to know what it is before deciding to buy. Less useful for "add my SNES" (a good picker is faster when you already know what you have). Top-3 candidates with confidence levels; user confirms. **Depends on B13a + B13b (BYO API key infrastructure) landing first** because this is the first cost-bearing feature per S14. Manage expectations explicitly — variant-level accuracy is not promised (SNES vs SNES Jr distinction is hard for generic models).

**BYO API key infrastructure + voluntary support (S14 — cross-cutting, enables AI features in O12 and beyond):**
- **B13a — `UserApiKey` entity + encrypted-at-rest storage + Settings → AI features UI.** One row per (user, provider). Anthropic-only at v1 (per S14 + OQ-19). UI: add key / view key fingerprint (never plaintext after save) / rotate / disable / hard-delete. Encryption uses an app-level master key (env var, rotatable). Schema add is small; encryption hygiene is the load-bearing part.
- **B13b — Server-side Anthropic call wrapper.** Service that takes `(userId, image, prompt)` → fetches + decrypts the user's active Anthropic key → calls Claude vision → returns the response. Error handling: no key configured → 412; key invalid (Anthropic rejected) → mark UserApiKey row invalid + 412; rate-limit / network error → friendly retry. Calls are logged via `UserEvent` (TL-series) without storing the actual prompt/response payload (privacy + storage hygiene).
- **B13c — Locked-state UX for AI features.** Per-feature, when no valid key is configured: clear copy ("this feature requires your Anthropic API key") + `[ add key →  ]` deep-link to Settings + `[ how do I get one? →  ]` external link to Anthropic's signup. NEVER silently swallow the missing-key state into an error-toast.
- **B13d — Buy Me a Coffee link in Settings.** New "Support Hoard" subsection in Settings (or fold into the existing About/Feedback section — decision at the interaction-flow layer). Single external link with terminal-aesthetic copy: `// hoard's free. if it's useful → buy me a coffee ↗`.
- **B13e — Soft tip mentions after meaningful actions.** One or two times max across a user's lifetime, dismissable, client-side-remembered via localStorage. Triggers: post-first-sync-complete, post-first-manual-add, post-first-hardware-add. Single small unobtrusive line (`// hoard's been useful? ☕ →`) appears for ~10 seconds then auto-dismisses if not interacted with. NEVER modal, NEVER behind any feature, NEVER on first-time use.
- **B13f — Multi-provider expansion research.** Deferred per OQ-19. Cohort signal-driven (do users actually want OpenAI / Google Vision support, or is Anthropic-only fine for the lifetime of this feature?). Revisit after Anthropic-only ships + B12h has 3–6 months of usage data.

**Retro / physical collection (O9 / S11):**
- **B10a — Retro platform enumeration in conceptual model.** ~30+ platform codes added or a `RetroPlatform` model introduced. Decision point: extend `PlatformCode` enum vs. separate model — query-pattern + UI-picker implications.
- **B10b — Retro / physical collection page.** A dedicated UI surface (sub-route / sidebar entry / library-mode toggle) with console-grouped views: "my SNES games," "my Game Boy collection," etc.
- **B10c — Collection metadata fields.** Optional on UserGame: `shelfLocation`, `condition`, `region`, `completeness`, `authenticity`. Forms part of the physical-entry detail page (joins B7a's manual-entry variant when the entry is physical).
- **B10d — Per-console statistics surface.** "How complete is my SNES collection vs. its commercial catalog?" — needs reference data per console (catalog completeness percentage). Late-horizon-2 / probably horizon-3.

---

## 5. Open questions / untested assumptions

Strategic bets only — research-layer gaps stay in USER_RESEARCH.md §10.6.

- **OpenXBL API stability + data completeness** — B1a-E experiment will surface or refute this. If refuted, the strategy needs a re-think on N11.
- **Whether tabs work for the admin IA at N=5 sections + likely future growth** — B5a-E sketch experiment will surface this. If tabs feel cramped, accordion or sub-routes become the path.
- **Whether the cohort actually has Xbox / GOG / Nintendo / Epic accounts** — current data is "Andrea has manual entries on Xbox/GOG; cohort distribution unknown." Worth a one-line DM to each cohort member asking "what platforms do you collect on?" — single, async, cheap. Drives whether O1's investment should bias toward Xbox vs. GOG vs. manual-add UX.
- **Whether N6 (aesthetic) actually constraint-holds at scale** — locked by S1 here, but the strategic stance commits Hoard to a particular cohort of *future* users. If the friends-cohort grows in a direction that's aesthetic-mismatched, S1 is a wedge point that re-emerges at the next strategy review. **Not a current bet, but a flag for 2026-Q4 review.**

---

## 6. Roadmap shape (Now / Next / Later, horizon-1 + horizon-2)

Translates §4's prioritised bets into a tractable timeline. Not commitments — directional planning that can adjust on signal.

### Horizon-1: 2026-Q3 milestone toward S0

#### Now (2026-06)
- **B1a-E experiment** — scratch-test OpenXBL against Andrea's Xbox account (~30 min). Decision point: green-light B1a or refine.
- **B1b-E experiment** — scratch-test GOG community endpoints against Andrea's GOG account (~30 min). Decision point: green-light B1b or document instability.
- **B1c-E experiment** — sketch full platform picker for manual-add (~30 min). Surfaces conceptual-model questions early.
- **B2a** — `lastSyncAt` badge across views (~half-day). Lowest-risk highest-clarity bet.
- **B5a-E experiment** — sketch admin IA options (~30 min). Decision lock for B5a.

#### Next (2026-07 → 2026-08)
- **B1a** Xbox Live sync workstream — assuming B1a-E greenlit. Plan-doc, single-PR, F-series cadence.
- **B1b** GOG sync workstream — assuming B1b-E greenlit. Same cadence.
- **B1c** Manual-add UX overhaul — first pass without conceptual-model changes (full picker + faster IGDB search). The deeper retro/physical bits land in horizon-2.
- **B5a + B5d** Admin IA redesign + delete feedback — assuming B5a-E picked a primary path.
- **2026-06-04 telemetry signal review** — output may unlock B3a or B4b; gates remain open.

#### Later in horizon-1 (2026-09)
- **B3a** (Coming-up Dashboard) if N10 validated in telemetry.
- **B2b** (stale-data warning) if B2a's passive freshness signal isn't enough.
- Polish + cohort-feedback iteration based on what's surfaced through `Feedback` + `UserEvent`.

### Horizon-2: post-2026-Q3 (2026-Q4 → 2027-Q2+)

Sequenced rather than dated — each contingent on prior bets landing + cohort signal. Expanded 2026-05-22 after S8–S11 scope expansion.

1. **`/layers-conceptual-model` integrity pass.** Resolves the `source_type` + `media_type` + retro-platform-enumeration + WishlistRelease-scope + Deal-domain questions before any horizon-2 bet needs them. Pre-condition for nearly everything below. Probably the highest-value single horizon-2 deliverable because it unblocks parallel workstreams.
2. **B9a–B9c (Wishlist entry-path additions)** — Wishlist-as-initial-status on manual-add (folds into B1c), search-result `+ wishlist` action, GameDetail `+ wishlist` CTA. **Folded into horizon-1 alongside B1c**, not horizon-2. No model change required (per S8 corrected); just UX. B9d (heterogeneous-shelf-UI decision) + B9e (shelf sort/filter) stay horizon-2.
3. **B7a + B7b + B7c (Detail-page state variants)** — start with owned-manual + wishlisted-released + completed variants since they're the most common states beyond owned-synced. Subscription + wishlisted-upcoming variants follow once subscription tracking lands.
4. **B6a (Itch.io sync)** + **B6b (Humble Bundle sync)** — additional source coverage. Lower-risk after Xbox + GOG build operational confidence.
5. **B8a + B8b + B8c (Deals via IsThereAnyDeal)** — aggregator integration + price-radar on want-list + per-game where-to-buy on detail. The S10a third-party-inclusion decision belongs to this workstream's plan-doc.
6. **B6d / B6e / B6f (subscription tracking)** — needs `source_type` distinction from step 1 + the subscription-available detail variant (B7d). Game Pass first (biggest catalog), then PS Plus Catalog, then EA Play / Ubisoft+.
7. **B10a + B10b + B10c (Retro / physical collection)** — retro platform enumeration + dedicated collection page + collection metadata fields. Tightly coupled; design as one workstream after the conceptual-model pass.
8. **B6g (physical media digital catalog)** + **B6j (bulk CSV import)** — close on the manual-add side once retro + physical are first-class.
9. **B8d (deal-alert notifications)** + **B7d (subscription detail variant)** — second-wave horizon-2 features that depend on the infrastructure built in 2 / 5 / 6.
10. **B10d (per-console catalog completeness)** + **B6i (ROM / emulation)** — niche-power-user features, probably horizon-3 (2027-Q2+).

**Capture mechanisms (B6k + B6l + B12h, per 2026-05-22 discussion)** — three distinct capture paths for adding physical inventory:
- **B6k (barcode for games)** ships first within horizon-2; free, mature, biggest ROI; covers boxed games
- **B6l (OCR for loose game labels)** ships alongside B6k; also free (Tesseract.js client-side); covers loose carts
- **B12h (Claude vision for hardware ID)** ships after B13a + B13b (BYO API key infra) lands; the only one with per-call cost; covers the "what is this thing?" garage-sale moment

The free pair (B6k + B6l) can ship without any payment/AI infrastructure. B12h is gated on B13.
11. **B11a–h (Marketplace listings — games AND hardware) + B12a–h (Hardware ownership tracking + camera ID) + B13a–e (BYO API key + tip jar)** — ship as one bundled workstream because the cohesion bet (B11h "find a SNES") is only ownership-aware (per B12f) once `UserHardware` exists, and the camera-ID bet (B12h) requires the BYO key infra (B13a + B13b) before it can ship. Order within the bundle: **B12a (UserHardware schema)** + **B13a (UserApiKey schema)** as parallel cheapest-first-moves that unblock the rest; then **B11a (eBay API integration)** + **B12b (hardware add/edit UX)** + **B13b (Anthropic call wrapper) + B13c (locked-state UX)** in parallel; then **B11g (hardware-listings UX) + B12d (RetroPlatform three-lane layout) + B12c (Collection-page hardware summary)** as the surface work; then **B12h (Claude vision hardware ID)** lands as the first cost-bearing feature with B13a/b/c already in place; finally **B11h + B12f** close the cohesion-aware CTA loop "I'm building a SNES collection" → "I don't have the console yet" → "here are the consoles available right now (or — you already have one — here are accessories)." The tip-jar work (B13d + B13e) ships independently in parallel — no AI / inventory dependency. Vinted / Mercari / Yahoo Auctions JP / specialist retro shops (B11b–d) follow eBay. The mod-history surface (B12g) and multi-provider AI research (B13f) are late-horizon-3 unless signal surfaces sooner.

---

## Note on horizon-2 scope expansion vs. focus

S0 commits Hoard to a broad coverage ambition. The risk is scope creep — chasing every niche source erodes focus on the core multi-platform PC+console experience that's the daily-use case for most users. **Mitigation:** horizon-1 stays focused on common storefronts + first-class manual-add as the catch-all. Horizon-2 expands deliberately, one source family at a time, with cohort signal driving sequence.

---

## 7. Decisions locked in this doc

- **S0 — Hoard's north star is THE companion for any videogame enthusiast and collector.** 2026-05-22. Any source, any platform a gamer could own games on. This is the long-horizon positioning that constrains every strategy iteration. Horizon-1 (S2) is a milestone toward this, not the destination.
- **S1 — Terminal aesthetic is a constraint, not a variable.** 2026-05-22. Reframes G2/N6 from "research priority — should we keep the aesthetic?" to "constraint — the aesthetic is what Hoard is; find users who fit." Strategic positioning move. Andrea explicit framing: "I want to like it first and foremost."
- **S2 — Outcome is completeness for the serious multi-platform collector by end of 2026-Q3.** 2026-05-22. Distinct from positioning validation (alternative A in the Phase 1 candidates) or pure cohort retention (alternative B). Operational definition of success is "no manual workarounds for a typical multi-platform collector's workflow."
- **S3 — Andrea-only needs (N3, N4, N6) are first-class in this tree, not waiting on cohort validation.** Follows from S1 + S2 — Andrea is the primary user; serving his needs IS the strategy.
- **S4 — B1d (defer Xbox/GOG entirely) is rejected as a strategy path.** S2's "no manual workarounds" framing forbids leaving platforms stubbed indefinitely.
- **S5 — The aesthetic check is part of every bet's pre-acceptance criteria.** A bet that compromises the terminal aesthetic for cohort-broadening is automatically rejected, regardless of opportunity score. Stated explicitly so future bets don't drift.
- **S6 — Admin IA redesign + delete-feedback are coupled bets.** Per the CLAUDE.md known-gaps capture, they share the same surface; design once.
- **S7 — Manual-add is first-class, not a fallback.** 2026-05-22. Many sources (physical, retro, niche regional storefronts) will never have a sync API. Manual-add UX has to feel like a primary path, not a workaround. B1c (manual-add UX overhaul) is promoted from deferred to horizon-1 primary. Conceptual-model dependencies (media_type, source_type, retro platform enumeration) flagged for the next `/layers-conceptual-model` pass.
- **S8 — Wishlist intent has two distinct surfaces, not one.** 2026-05-22 (corrected after Andrea's pushback). The Releases page is the release tracker — upcoming-only by design, backed by `WishlistRelease`, stays as-is. The Library Wishlist shelf (`UserGame.status='Wishlist'` filter) is the want-list — any game I want to own, released or not. **No model rename or migration** — the architecture already supports the want-list semantic. The gap is UX entry paths: Wishlist-as-initial-status on manual-add, search-result `+ wishlist`, GameDetail `+ wishlist` for not-in-library games. Small enough to fold into horizon-1 alongside B1c.
- **S9 — The game-detail page is a state machine, not a uniform render.** 2026-05-22. Six states identified (owned-synced, owned-manual, wishlisted-released, wishlisted-upcoming, subscription-available, completed); each variant a real design surface with different primary purpose + info shown. Shared content blocks (gallery, news, deals, HLTB) factor into reusable components across variants. Horizon-2 design + implementation per O6 bets.
- **S10 — Deals & offers is a first-class data domain, not a feature add-on.** 2026-05-22. Tracking price + availability across first-party (Steam / PSN / Xbox / Nintendo eShop / Epic / GOG) + third-party (Instant Gaming / Kinguin / G2A / GMG / etc.) — likely via IsThereAnyDeal API as aggregator rather than per-store scraping. Entirely separate domain from library / wishlist; requires new `Deal` tables + deal-alert notification infrastructure. The third-party grey-market inclusion is a S10a positioning decision deferred to when the bet runs.
- **S11 — Retro / physical collection is a first-class surface, not a platform-picker entry.** 2026-05-22. Per S0 + S7, serious collectors of NES carts, PS1 discs, Game Boy collections deserve a dedicated UI (sub-route / sidebar entry / library-mode toggle) with console-grouped views + collection metadata (shelf, condition, region, completeness). Aesthetic is naturally well-suited to terminal-style cataloguing. Late-horizon-2 (2027-Q1+) — depends on retro platform enumeration + conceptual-model `media_type` addition landing first.
- **S12 — Secondhand marketplace listings are a distinct data domain from digital deals.** 2026-05-22. eBay / Vinted / Mercari / Yahoo Auctions Japan / specialist retro shops have *listings* (many concurrent per item, each with condition / region / seller) rather than *prices* (single canonical per Store). Different intent (collector-completionism vs. bargain-hunting), different UI, different model (Marketplace + MarketplaceListing per CONCEPTUAL_MODEL §3.18–3.19 + CM8). Polymorphic across Games AND Hardware per CM9. Late horizon-2 / horizon-3 — depends on retro infrastructure (B10) + physical-wishlisted detail variant (B7b extended) landing first.
- **S13 — Hardware ownership is part of collection-completion scope.** 2026-05-22 (Andrea's scope pushback). Hoard's user owns *games AND the hardware to play them on*. Modeled as `UserHardware` (CONCEPTUAL_MODEL §3.20, per CM10) parallel to `UserGame` — not polymorphism, parallel entities sharing enums. Includes `OWNED | WISHLIST | SOLD | DROPPED` lifecycle; free-text `displayName` for accessories without forcing a HardwareItem reference catalog. The "find a SNES" CTA becomes ownership-aware once UserHardware is populated.
- **S14 — AI-powered features are user-funded via BYO API key; Hoard never processes payments.** 2026-05-22. Hoard is a free personal tool. Features with real per-call cost (Claude vision for hardware ID is the first; future features may join) require the user's own API key — they pay the provider directly. Voluntary tips via Buy Me a Coffee (external venue, no Hoard payment infra). Anthropic-only at v1; multi-provider deferred to OQ-19. The rule "**AI features user-funded via BYO key; everything else free forever**" is the precedent — locking it matters more than the policy details. Surfaces in `UserApiKey` entity (CONCEPTUAL_MODEL §3.22, per CM11) + B13 bet family.

---

## 8. Next step

Per `/layers-product-strategy` close: *"The solution bets chosen here define the scope of what needs to be designed. Next: define the conceptual model — the objects, relationships, and vocabulary those solutions will work with. Run `/layers-conceptual-model`."*

**The earlier "skip conceptual-model" framing died with S0 / S7 / S8 / S9 / S10 / S11.** The model is significantly under-scoped for the strategic ambition Andrea named on 2026-05-22. The conceptual-model layer has nine real gaps now (was five), grouped into four families:

**Library-model gaps:**
1. **`source_type` distinction** — owned-via-purchase vs. owned-via-subscription vs. borrowed vs. demo vs. free-with-prime. Currently `UserGame` doesn't distinguish; subscription-catalog tracking (B6d–f) needs this.
2. **`media_type` distinction** — digital vs. physical-disc vs. physical-cart vs. ROM. Needed for physical (B6g) + retro (B10a) + ROM (B6i).
3. **Retro platform enumeration** — extend `PlatformCode` enum vs. introduce a separate `RetroPlatform` model. ~30+ codes either way; the design call matters for query patterns + UI picker.
4. **Manual-vs-synced precedence** — when a manual entry and a synced entry resolve to the same `Game`, which user-data fields win?
5. **Bulk-import data shape** — column schemas for CSV/spreadsheet input, including the conceptual fields above.

**Wishlist / want-shelf gaps (per S8 corrected):**
6. **Library Wishlist shelf entry-path additions** — no model change; `UserGame.status='Wishlist'` already supports any game and `WishlistRelease` stays upcoming-shaped. The work is UX: Wishlist-as-initial-status on manual-add (B9a folded into B1c), search-result `+ wishlist` action (B9b), GameDetail `+ wishlist` CTA for not-in-library games (B9c). Probably small enough to fold into horizon-1 alongside B1c rather than waiting for full horizon-2.
7. **Heterogeneous Wishlist shelf entries** — entries WITH `WishlistRelease` companion (release-date, hype, category) vs. entries WITHOUT (released-but-not-owned). UI design question for B9d: visually distinguish or not? Conceptual model is fine either way.

**Detail-page state gaps (per S9):**
8. **Detail-page state derivation** — six states (owned-synced / owned-manual / wishlisted-released / wishlisted-upcoming / subscription-available / completed). Derived from UserGame.status + new media_type/source_type, but worth pinning as an explicit derived state for UI variant routing.

**Deals domain (per S10):**
9. **`Deal` domain model** — new tables for per-game-per-store pricing snapshots, deal-alert subscriptions, IsThereAnyDeal API response caching. Entirely orthogonal to library / wishlist domains. Probably its own schema namespace.

**Plus the retro/physical surface gaps (per S11):**
- Collection metadata fields (shelf, condition, region, completeness, authenticity) as optional fields on UserGame for physical / retro entries.

**Sequencing recommendation:**

1. **Start `/layers-conceptual-model` now**, as a focused integrity pass against the now-significantly-expanded strategic surface. Output: confirmed-stable parts + named gaps with proposed schema solutions per the 9+ questions above. **Expect 1–2 working sessions** given the scope expansion — this isn't a quick check anymore.
2. **Then `/layers-interaction-flow`** for B5a (admin IA) + B1c (manual-add picker) sketches. The detail-page-variant flows (per S9) also surface here.
3. **Then start B2a** (lowest-cost horizon-1 bet) while the next workstream's plan-doc is being drafted.

Or, if you want to ship before designing the full horizon-2 surface:

- Start **B2a now** (no model dependency, low cost), then **B1a-E + B1b-E experiments**, and run `/layers-conceptual-model` after the experiments land their decisions. Risk: building B1a + B1b before resolving `source_type` + `WishlistRelease` scope means refactoring later. With the expanded scope, this risk is higher than under the original 5-gap framing.

Andrea's call. **My recommendation has shifted to "design first" with high confidence** — the conceptual-model surface is now load-bearing for nearly every horizon-2 bet, and getting the wishlist + detail-page + deals + retro models internally consistent is the highest-leverage horizon-2 prep work.
