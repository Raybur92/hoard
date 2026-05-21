# Hoard — User Research

**Purpose.** This doc is the canonical record of observed user behaviour for Hoard's beta cohort. It exists because, as of 2026-05-12, Hoard's "observation channel" was implicit — bug-driven discoveries scattered through `CLAUDE.md` Recent Fixes — and that won't scale beyond N=3 beta users.

Two parts:
1. **Corpus + synthesis** (§1–§5) — extracts the observations already in the codebase's history and turns them into candidate job stories.
2. **Observation channel plan** (§6) — how new observations get captured going forward, now that beta users exist beyond Andrea.

Source for synthesis: `CLAUDE.md` Recent Fixes block (2026-05-05 → 2026-05-11) + workstream plan docs (`docs/RELEASES_PLAN.md`, `docs/INTERACTION_DEBT_PLAN.md`, `docs/SETTINGS_AUDIT_PLAN.md`, `docs/INVITE_CODES_PLAN.md`, `docs/ADMIN_POLISH_PLAN.md`) + git log narrative on bug-driven commits.

---

## 1. Beta cohort (as of 2026-05-12)

| User | Email | Status | First seen | Platforms · Games | Notes |
|---|---|---|---|---|---|
| Bedkarma | andreacama92@gmail.com | ADMIN | 2026-05-02 | 2 (Steam + PSN) · 749 | Andrea — sole source of ~80% of observed behaviour to date |
| Luigi Romano | luigiromano866@gmail.com | ACTIVE | 2026-05-06 | 2 (Steam + PSN) · 395 | First non-Andrea beta. Triggered the all-Backlog bug + Steam-redirect-to-localhost gap. Has since connected both Steam *and* PSN — suggests the Steam OAuth gap (O2) was either resolved between his attempt and now, or worked around. **Worth confirming with Andrea whether `API_URL` was set on Railway.** |
| Andrea Cama | karmagames92@gmail.com | ACTIVE | 2026-05-07 | — · — | **Open question:** appears to be a second Andrea account (matching surname, similar timing to admin account). Test account, secondary email, or unintentional sign-up? Treat as Andrea-test until clarified. |
| Daniel Guernieri | daniel.guernieri@gmail.com | ACTIVE | 2026-05-09 | — · — | Friend of Andrea, signed up as a friendly QA tester. **Connected Steam, then tested the wipe-library function** — that's why his current platform/game count is 0. Remains available for future tests. (Resolves the "re-signup mystery" from earlier — it was intentional re-onboarding for QA.) |
| Giuseppe Spizzico | giuseppe.spizzico.93@gmail.com | ACTIVE | 2026-05-10 | 1 (TBD) · 505 | First real onboarding via the new admin invite flow. Connected one platform with a substantial library. **Platform identity not yet confirmed by Andrea.** |
| Gaetano Iannì | gaetanoianni82@gmail.com | ACTIVE | 2026-05-11 | 1 (PSN) · 625 | Second invite-code redeemer. Connected PSN **via mobile, with Andrea's hands-on assistance** — the PSN guided flow was broken on mobile, so Andrea had to send him the desktop-browser version of the NPSSO instructions for copy-paste. Onboarding was *not* autonomous. |

Andrea's continuous self-dogfooding is the primary research instrument. The cohort grew 3 → 6 users in 5 days. Two important provenance notes:

- **The cohort is friendly-fire.** All 5 non-Andrea users are friends or test accounts. This is a strong signal source for early bugs and feature gaps, but a weak one for first-impression / onboarding generalizability — none of them are strangers encountering Hoard cold.
- **Daniel is a QA tester, not a typical user.** He's available for adversarial testing (wipe-library, edge cases) but his behavioural data shouldn't be read as user-need signal.

---

## 2. Raw observations

Each entry is one observation, tagged with: source / what was seen / what was inferred / confidence (Observed / Inferred / Assumed).

### O1 — PSN sync placed everything in Backlog regardless of play state
- **Source:** Luigi's first PSN test, 2026-05-06
- **Seen:** Imported games all landed in `Backlog`, including titles Luigi had hundreds of hours in
- **Inferred:** Users expect imported status to reflect what they've been playing, not a default-Backlog assumption
- **Confidence:** Observed (Luigi)
- **Followup:** Fixed in commit `6c624a0` — status now derived from total merged playtime

### O2 — Steam connect on production redirected to `localhost:3001`
- **Source:** Luigi's Steam connect attempt, 2026-05-06
- **Seen:** Vercel 404 after OAuth redirect; Steam's `return_to` pointed at dev URL
- **Inferred:** First-connect failure on the second platform someone tries is corrosive — Luigi had already had to wait for the PSN-Backlog fix
- **Confidence:** Observed (Luigi)
- **Status:** Documented in Known Gaps; needs `API_URL=https://api.gamehoardr.com` set on Railway. Still open.

### O3 — Wrong-game IGDB matches felt worse than missing games
- **Source:** Andrea's own Steam sync (Slay-the-Spire-2 / sequel) + Luigi's PSN (Ragnarok-MMO / platform-collision), 2026-05-08
- **Seen:** Both users noticed the wrong game appeared in their library; both surfaced it as "this is wrong" not "this is missing"
- **Inferred:** Sync correctness > sync coverage. Users would rather have N matched games right than N+5 with some wrong
- **Confidence:** Observed (Andrea + Luigi)
- **Followup:** Smart `pickBestMatch` + in-app remap UI + audit script (sync-quality batch, 2026-05-08)

### O4 — Wishlist hero showed a non-wishlisted game
- **Source:** Andrea's eyeball on `/releases` post-R6, 2026-05-07
- **Seen:** Wishlist-mode hero rendered a game Andrea hadn't starred
- **Inferred:** Scope semantics matter — if the page label says "wishlist", every primary surface on it must respect that filter
- **Confidence:** Observed (Andrea)
- **Followup:** Cascade audit found 5 related bugs (commit `b95ce35`)

### O5 — Deep-link preservation looked tested but didn't actually work
- **Source:** Andrea's smoke test #3 on deployed I-series build, 2026-05-09
- **Seen:** Unit tests for `?next=` passed; live registration on production redirected to `/` instead of the original deep-link
- **Inferred:** Integration-shaped bugs (context drift between auth + UserProvider + RequireAuth) are invisible to unit tests. Manual end-to-end verification on live env is non-optional for auth flows.
- **Confidence:** Observed (Andrea) — explicitly recorded as a process lesson in `INVITE_CODES_PLAN.md` §5.2
- **Pattern:** Recurring — surfaced again in LoginScreen `setUser`-before-`navigate` bug

### O6 — Decorative UI controls were noticed and called out
- **Source:** Andrea's Settings audit, 2026-05-08 (`SETTINGS_AUDIT_PLAN.md`)
- **Seen:** The "auto-refresh 7d before expiry" PSN toggle, four scope checkboxes, the empty Log tab, and the unwired `[reveal]` NPSSO button were all read as "the app is lying to me" rather than "this feature isn't built yet"
- **Inferred:** Lying-by-affordance is worse than missing-by-absence. A control that looks tappable but does nothing reads as a broken promise; a feature that simply isn't there reads as roadmap.
- **Confidence:** Observed (Andrea) — Andrea-only, but strong
- **Followup:** Settings audit PRs A + B dropped lying controls and wired real ones

### O7 — Frozen-on-render screens felt broken even when correct
- **Source:** Andrea's "feel alive" batch, 2026-05-07
- **Seen:** `HeroCountdown` rendered correct d/h/m/s but didn't tick — read as "is this app frozen?". Sync frequency picker showed a radio selected but with no persistence. Cmd-K appeared bound but wasn't.
- **Inferred:** Liveness signals (animation, persistence, keyboard) are part of perceived correctness, not nice-to-haves
- **Confidence:** Observed (Andrea) — Andrea-only
- **Followup:** `useNow` ticker hook + auto-sync hook + Cmd-K wiring

### O8 — Live-page eyeballing produced 4 polish commits after `/admin` shipped
- **Source:** Andrea's review of deployed `/admin` (2026-05-10, A-series commits `01cf7c8` + `2fba14c`)
- **Seen:** Truncation in PLATFORMS/used-by columns at medium widths; keyword case mismatch in `ConfirmModal`; buttons cramped against neighbours; flex slack distribution wrong at wide widths
- **Inferred:** Pixel-level details that ship clean in tests still need a live-page pass before they're done. Test environments don't render at every viewport.
- **Confidence:** Observed (Andrea) — Andrea-only
- **Pattern:** Same shape as O5 (passing tests ≠ working feature in the wild)

### O9 — Giuseppe completed onboarding end-to-end without intervention
- **Source:** Andrea's note in `2fba14c` commit narrative, 2026-05-10
- **Seen:** Giuseppe redeemed invite, signed up, landed in product. No reported friction.
- **Inferred:** I-series welcome flow is functionally complete for at least one fresh user
- **Confidence:** Observed (Giuseppe, but no qualitative signal beyond "didn't fail")
- **Gap:** What did he do next? Has he opened the app again? We don't know.

### O10 — Mobile shell felt "floating" because of mis-placed safe-area padding
- **Source:** Andrea's mobile testing, 2026-05-08 (commit `976a692`)
- **Seen:** Tab bar appeared to hover above the home indicator instead of sitting flush
- **Inferred:** Mobile chrome positioning is judged by feel, not by spec
- **Confidence:** Observed (Andrea) — Andrea-only

### O11 — New beta users connected platforms with substantial libraries (but not all autonomously)
- **Source:** `/admin` user roster snapshot 2026-05-12 + Andrea's qualitative notes on each beta user
- **Seen:** Giuseppe Spizzico (joined 2026-05-10) connected 1 platform (TBD) with 505 games autonomously (no reported friction). Gaetano Iannì (joined 2026-05-11) connected PSN with 625 games **but needed Andrea's hands-on help** — see O12. Daniel Guernieri (joined 2026-05-09) connected Steam, then tested wipe-library — see O13.
- **Inferred:** First-sync data per se is reachable — but the autonomous-vs-assisted split (1 autonomous out of 3 attempted) means we cannot yet claim the onboarding flow works for cold users without intervention. The data is contaminated by Andrea's availability as a help channel.
- **Confidence:** Observed (Andrea + the 3 users). Mixed positive/negative signal.

### O12 — PSN guided flow was broken on mobile; required Andrea's manual intervention
- **Source:** Andrea's account of Gaetano's onboarding, 2026-05-11
- **Seen:** Gaetano attempted PSN connection via mobile. The screen rendered the React error **`useSearchModal must be used inside <SearchModalProvider>`**. The flow was blocking enough that Andrea intervened — he sent Gaetano the **desktop browser link** containing the NPSSO copy-paste instructions; Gaetano then copy-pasted the token and the sync completed.
- **Root cause (confirmed by code inspection):** `/settings/platforms/:code/connect` is routed at [App.tsx:90-92](../apps/web/src/App.tsx#L90-L92) OUTSIDE the `AppShell` layout (the `/connect` routes were deliberately full-bleed). But `PsnGuidedFlowMobile` uses `MobileHeader`, which calls `useSearchModal()` — and the `SearchModalProvider` is mounted inside `AppShell`. The provider is unreachable from outside the AppShell subtree, so the hook throws. Desktop unaffected — `PsnGuidedFlowDesktop` doesn't use `MobileHeader`.
- **Inferred:** Concrete confirmation of G5. At least one cold beta user hit a hard mobile-only onboarding block. The cost of being wrong was high: without Andrea's chat-channel intervention, Gaetano would likely not have connected PSN at all.
- **Confidence:** Observed (Gaetano + Andrea), root cause confirmed
- **Actionable:** Now logged as a Known Gap in `CLAUDE.md` with three fix candidates (lift provider, replace header, or no-op the hook). Treated as first-priority fix ahead of new feature work.
- **Meta-pattern signal:** Andrea is acting as a *human fallback* for friction the product can't resolve on its own. This is OK while the cohort is 5 — it's invisible scaffolding. It stops being OK at ~20 users.

### O13 — Daniel tested wipe-library end-to-end as a friendly QA volunteer
- **Source:** Andrea's account of Daniel's role, 2026-05-12
- **Seen:** Daniel connected Steam, then exercised the wipe-library function (shipped in Post-8 PR C, 2026-05-06). His current state (0 platforms / 0 games) is the post-wipe state, not a never-connected state.
- **Inferred:** Wipe-library works end-to-end on a non-Andrea account — including the typed-confirmation flow, FK cascade, and the platform disconnect side-effect. Post-wipe, Daniel's account is in the same shape as a pre-connection ACTIVE user (which is correct: D10 explicitly preserves account + preferences after wipe).
- **Confidence:** Observed (Daniel, mediated by Andrea)
- **Note:** Daniel's role is QA volunteer, not typical-user proxy. His behavioural data validates feature correctness but doesn't speak to user *needs*.

---

## 3. Patterns

Grouped themes that surface across multiple observations.

### P1 — Sync correctness is the trust anchor
**Supporting:** O1, O3
**Statement:** Users (both Andrea and Luigi) evaluate a sync by whether the right games are matched to the right metadata, not by raw count. A wrong match erodes trust faster than a missing game. The remap-on-mismatch UI is the trust-recovery mechanism when matching fails.

### P2 — UI must mean what it shows
**Supporting:** O6, O7 (different sides of the same coin)
**Statement:** Both "lying controls" (decorative without function) and "frozen surfaces" (no liveness) read as the same failure mode to the user: the app is signaling something it can't back up. Andrea's reaction in both cases was "wait, this should be doing X." This is stronger than a usability gripe — it's a credibility issue.

### P3 — Integration verification requires live env, not just tests
**Supporting:** O5, O8
**Statement:** Twice now, deferrals or features have been declared "closed" based on passing tests, only to fail on live verification. The pattern lives in the gap between component-level correctness and end-to-end UserContext / UserProvider / RequireAuth coordination. The lesson is recorded in `INVITE_CODES_PLAN.md` §5.2 but the implication for *this* layer is: any observation channel needs to favour live-env signal over test-env signal.

### P4 — First-contact friction compounds fast — and mobile is the weak axis
**Supporting:** O2, O9, O11, O12 (positive and negative examples)
**Statement:** Of 3 cold non-Andrea connection attempts, only 1 was autonomous: Giuseppe. Luigi hit two consecutive first-impression problems on day 1 (PSN-Backlog, Steam-localhost). Gaetano hit a mobile-only PSN guided-flow break and needed direct intervention. The pattern: desktop autonomous-onboarding probably works (Giuseppe + Andrea's own); mobile autonomous-onboarding has at least one confirmed hard failure. The 33% autonomous rate is small-N but high-cost — without Andrea's chat-channel rescue, Gaetano likely wouldn't have connected at all.

### P5 — Andrea is both the research instrument *and* the human fallback
**Supporting:** O4, O6, O7, O8, O10 (Andrea as observer) + O12 (Andrea as live-support)
**Statement:** 80% of observed behaviour to date is Andrea noticing something via continuous self-dogfooding. New nuance from O12: Andrea also acts as a *human fallback* — when the product fails a user (Gaetano on mobile PSN), Andrea steps in via chat and walks them through. This is invisible scaffolding right now and it's making the cohort look smoother than it actually is. Both roles (observer + fallback) calibrate to Andrea: decisions made on Andrea-intuition over-fit; users rescued by Andrea-intervention don't generate the friction logs that would justify fixing the underlying break.

### P6 — The cohort is friendly-fire
**Supporting:** §1 cohort notes — Luigi, Daniel, Giuseppe, Gaetano all friends or test accounts; Daniel is explicitly a QA volunteer
**Statement:** Every non-Andrea user is in the cohort because Andrea invited them, knows them, and is available to help. This produces strong adversarial-testing signal (Daniel) and strong rapid-feedback signal (Luigi) but weak first-impression-generalizability signal — no one in the cohort encountered Hoard cold, with no contextual priming and no help line. The first stranger-user will be a meaningful research event.

---

## 4. Candidate job stories

Drafted from the patterns. Confidence ratings reflect how grounded each one is in observed (not assumed) behaviour.

**JS1.** *When I connect a platform account for the first time, I want the imported library to reflect my actual play state (not a default-Backlog assumption), so I recognise my collection immediately.*
- Confidence: **Observed** (Luigi, O1)
- Need: status-from-playtime inference logic. Shipped.

**JS2.** *When I notice a synced game is matched to the wrong IGDB entry, I want to remap it in one tap without losing my notes / status / playtime, so I can trust the data even when the source's ranking lies.*
- Confidence: **Observed** (Andrea + Luigi, O3)
- Need: `[wrong game?]` UI + merge transaction. Shipped.

**JS3.** *When the UI shows me a control or a number, I want it to do something real and stay current, because lying or frozen affordances make me distrust the whole app.*
- Confidence: **Observed → Andrea-only** (O6, O7) — this is real but unverified outside Andrea
- Need: audit + drop or wire every decorative control; liveness on time-sensitive surfaces. Shipped for Settings + Releases + sync.

**JS4.** *When I'm browsing a list filtered by some scope (wishlist, platform, status), I want every surface on that page to respect the scope, so I don't have to re-verify what I'm looking at.*
- Confidence: **Observed → Andrea-only** (O4)
- Need: scope-semantics invariants across hero + agenda + banner + grid. Shipped after the R6 audit cascade.

**JS5.** *When I sign up via an invite, I want to land somewhere that explains what happens next, because the first 30 seconds of pending-state without context feel like the app is broken.*
- Confidence: **Assumed** — closer to Assumed than Inferred. The Welcome screen was design-anticipated, not observation-grounded. Nobody has been observed bouncing off a pending state; we just imagined someone might. Worth verifying against Giuseppe or Gaetano in an L3 chat.
- Need: Welcome screen with state-aware copy. Shipped.

**JS6.** *When I'm a collector, I want dense terminal-aesthetic information presentation, because that density is part of what makes the tool feel like mine.*
- Confidence: **Observed → Andrea-only** (sole-owner preference; explicitly recorded in `AGENT.md` decisions)
- Need: protect the aesthetic even as the app scales. Hard rule in `CLAUDE.md`.
- **Risk flag:** This job story may not generalize to Luigi or Giuseppe. We don't know.

**JS7.** *When I open Hoard, I want to immediately see what I'm playing now / what's next / how my libraries are changing, because dashboards that don't surface "what's relevant right now" become wallpaper.*
- Confidence: **Inferred** — implicit in the Dashboard design but no behaviour data
- Need: relevant-now surface (now-playing, recent releases, upcoming this week). Largely shipped.

---

## 5. Research gaps

Questions the corpus does not answer. These become the brief for the observation channel in §6. Ordered by **cost-of-being-wrong**, not by topical sequence.

**G1 — Non-Andrea behavioural data is nearly zero.** Luigi has produced 2 bug reports. Giuseppe + Gaetano produced successful onboardings. We don't have data on: how any of them browses the library, whether they wishlist, whether they use Releases, whether they read the receipt aesthetic the way Andrea does, whether they've come back since day 1.

**G2 — Terminal-aesthetic generalizability is unknown.** JS6 might be Andrea-only. None of the beta users have commented. This is the biggest single design decision in the app and we have zero data on it from outside the owner. Cost-of-being-wrong: catastrophic — would require redesigning the entire visual language.

**G3 — Releases page (R1–R6) has zero non-Andrea observation.** R1–R6 was the largest single design investment in the product. Modes / zooms / buckets / agenda rail / hero countdown — all designed by Andrea, for Andrea. Cost-of-being-wrong: if Luigi or Gaetano opens Releases once and never returns to it, that's a months-of-engineering signal. Worth surfacing this *fast*, ahead of L1 telemetry — the L3 chats should probe this directly. (Previously listed G4; promoted to #3 per cohort feedback 2026-05-12.)

**G4 — Retention signal doesn't exist.** No telemetry for "did Luigi open the app again after the PSN fix?" or "has Giuseppe come back since onboarding?" We're flying blind on whether fixes land for the user who reported them, and on whether new users return.

**G5 — Mobile parity is confirmed-broken on at least one onboarding path.** Phase 8 PR 4 mobile ports were Andrea-judged. As of O12 we now have concrete evidence the PSN guided flow fails on mobile (Gaetano needed Andrea's desktop-link workaround). Beyond that single confirmed failure, we still have no observed mobile usage in the wild for browsing / library / Releases / game-detail flows.

**G6 — We don't know what users *want to do* that the app doesn't support.** Every observation so far is reactive — bugs in shipped features. None are proactive — features users wished existed. Without a feedback channel, this gap grows silently.

**G7 — Unexplained user-state anomalies.** The karmagames92 account is unaccounted for (possibly a second Andrea account; needs clarification). The Daniel re-signup is now explained per O13 (intentional QA re-onboard). These are individually minor but the *class* of question matters: as the cohort grows, "who is this user and what are they doing here?" becomes harder to answer without admin visibility into intent.

**G8 — No cold-stranger first-impression data.** Per P6, the entire non-Andrea cohort is friendly-fire. Every user has either a personal relationship with Andrea or is an explicit test account. Onboarding success/failure rates in this cohort cannot be generalised to cold strangers, who will lack both contextual priming and a help line. The first stranger sign-up — whenever that happens — should be treated as a primary research event.

---

## 6. Observation channel plan

The brief: turn the observation channel from "Luigi tells Andrea on chat → Andrea writes a commit" into something that survives a 5-user beta and produces data for the user-needs layer.

### 6.1 Design constraints
- **Cohort size: 3, growing to ~10 by end of year.** No need for analytics platforms or research panels.
- **Andrea's time is the bottleneck**, not user willingness. Channels should bias toward low-Andrea-overhead.
- **Aesthetic constraint.** No popovers, no toast prompts, no marketing-style modals. Terminal aesthetic is non-negotiable per JS6 and `CLAUDE.md` Hard Rule 1.
- **Live-env primacy.** Per P3, the channel needs to surface signal from the actual deployed app, not from synthetic test environments.

### 6.2 Channel design — three layers

**L1 — Event log (always-on telemetry).** A new `UserEvent` model in the schema, written via a fire-and-forget helper similar to `platformLog.ts`. Captures touchpoint events only — not granular UI interactions:
- `signup.completed`, `signup.pending` (via I-series flows)
- `platform.connected` (per code)
- `sync.first` (first sync per platform per user — high-signal moment)
- `library.first_open` (first time the user navigates to `/library` after a sync)
- `remap.used` (every `[wrong game?]` invocation — this IS the trust-recovery moment from P1)
- `wishlist.toggled` (with `igdbId` so we can see what's being wishlisted)
- `releases.scope_changed` (wishlist / all / my-platforms — answers G4 partially)
- `session.opened` (one row per session, throttled to 1/hour/user — answers G3)
- `error.surfaced` (any error visible to the user, with route + error class)

One read endpoint: `GET /api/admin/user-events?userId=&since=` for Andrea to review in `/admin`. Bias toward storing more, surfacing less.

**Cost:** ~1 day to build (schema + helper + write-hooks at the touchpoints + minimal admin view). Reuses the `PlatformLog` pattern verbatim.

**L2 — In-app feedback form (low-friction qualitative).** A new About section at the bottom of Settings (between Data Export and Danger Zone) hosts a `[report something weird]` button. Clicking expands an inline textarea + `[send]` + `[cancel]` below the button — no modal, no mailto, no context switch out of the app. On submit, a `Feedback` row is persisted to the DB (`{ userId, message, viewport, ua, read=false, createdAt }`) and a new `// FEEDBACK` section in `/admin` surfaces unread entries to Andrea. Viewport + user-agent are auto-captured to make mobile-vs-desktop bugs (like O12) attributable without asking. No external delivery channel in v1 — Andrea reads feedback by visiting `/admin`, the same surface he already checks for the user roster. Rate-limited 10/hour and 20/day per user via the existing two-tier limiter pattern from I-series.

**Cost:** ~1 day. Schema + migration (1h), three backend routes incl. admin pagination + mark-read (2h), frontend `FeedbackForm` component wired into desktop + mobile Settings (2h), admin section (1.5h), backend + frontend tests (1.5h).

**Why not mailto / webhook / email-out in v1:** mailto bounces the user out of the app and breaks the terminal aesthetic. Webhook + transactional-email both add a delivery dependency and a configuration decision (which channel? which provider?) before we even know what feedback volume looks like. Easier to add a push channel later than to rip one out. Decision locked 2026-05-13 — see §8 D6.

**L3 — Reactive async DMs (low-touch qualitative).** Replaces the original scheduled-chats design per D10 (2026-05-21). The friends-cohort (P6) makes booked slots feel obligated; the time-pressure framing of a "fresh-experience window" was working backwards from a cost the users themselves weren't going to absorb. The L3 layer still exists — qualitative-human is the only channel that can answer G2 (aesthetic generalizability) and G6 (wished-for features) — but it now fires *reactively*, not on schedule.

When L1 telemetry surfaces a specific question worth asking (e.g., *"noticed you only opened the releases page once — anything missing or just not your thing?"*), Andrea sends a one-line DM via the user's existing chat channel. Each DM is tighter and easier to answer than the original "walk me through the last time…" prompt. No DM goes out unless the data says it would be useful. Single one-liners ("be honest — does the look feel weird or fine?") for the purely-qualitative gaps (G2) can be sent ad-hoc whenever Andrea feels like it.

Captured replies land in `§7 Session notes` as raw quotes (one per DM exchange). Don't synthesise in the moment — synthesise into §2–§4 weekly.

**Cost:** ~5 min per DM, sent on demand. Zero calendar coordination, zero recurring overhead.

### 6.3 What we'd learn

| Gap from §5 | Channel layer | What surfaces |
|---|---|---|
| G1 — non-Andrea data | L1 | All major touchpoints visible per user; zero user effort |
| G2 — aesthetic generalizability | L3 (reactive DM) | One-line ad-hoc DM ("does the look feel weird or fine?") when convenient |
| G3 — Releases task flow | L1 + L3 reactive | `releases.scope_changed` reveals whether users open Releases at all; if patterns are odd, a single DM probes why |
| G4 — retention signal | L1 | `session.opened` events per user over time |
| G5 — mobile vs desktop | L1 | User-agent in event log |
| G6 — wished-for features | L2 (inbound) | Pure-passive wait; the in-app form is the only channel that surfaces this |
| G7 — user-state anomalies | Admin visibility | Clarify karmagames92 ownership (one-time question for Andrea) |
| G8 — no cold-stranger data | Wait + flag | Cannot be researched within the current cohort; treat first stranger sign-up as a primary research event |

### 6.4 Deliberately skipped

- **In-product survey prompts / NPS modals.** Hostile to aesthetic; high friction for low yield at N=3–10.
- **Full session recording (Hotjar / FullStory).** Massive overkill for cohort size; privacy headache.
- **Cohort segmentation / funnel analytics.** Too few users for statistical signal.
- **Public-facing changelog or feedback board.** Closed beta — premature.

### 6.5 Implementation order

If pursued, suggested phasing:
1. **R1 — L2 (in-app feedback form)** — **Done 2026-05-13**. Schema + 3 endpoints + `FeedbackForm` component + admin section. Settings placement: new About section at the bottom, between Data Export and Danger Zone. Rate-limited 10/hour, 20/day per user. No webhook / email push in v1 — read feedback at `/admin`. Full PR breakdown in `docs/FEEDBACK_PLAN.md` (F-series, single-PR workstream, 4 planned commits + closing doc commit). **Channel is operational end-to-end** at workstream close; 22 new tests across F1.1–F1.4; Feedback table live on Supabase.
2. **R2 — PSN mobile guided-flow fix** — **Done 2026-05-21**. `SearchModalProvider` lifted from `AppShell.tsx` to `App.tsx` so it wraps the entire `<Routes>` tree (including the full-bleed `/connect` guided flows that mount outside AppShell). Closes O12 — mobile PSN onboarding no longer crashes with the "useSearchModal must be used inside <SearchModalProvider>" render error. Existing tests already mounted the provider themselves, so no test changes; 73/73 regression tests across layout + admin + library + releases-recent + feedback green post-lift.
3. **R3 — L1 (event log telemetry)** — **Done 2026-05-21**. Plan + close-out at `docs/TELEMETRY_PLAN.md` (TL-series, single-PR with 5 commits TL1.1 → TL1.5, 27 new tests). Captures 8 server-side touchpoints — `session.opened` (daily throttle per TL-D3, **revised from hourly during plan review**), `signup.pending`, `signup.completed`, `platform.connected`, `sync.first` (with pre-update `wasFirstSync` capture), `remap.used`, `wishlist.toggled`, `error.surfaced` (with truncated message + requestId). `UserEvent` table live on Supabase; admin EVENTS section at the bottom of `/admin` reads via cursor pagination. **Directly answers G1 / G3 / G4 / G5 with zero user effort** — the goal that justified the no-calendar-chats decision (D10). The two events that need frontend dispatch — `library.first_open` + `releases.scope_changed` — deferred to a TL2 scope per TL-D8; closed-set enum constraint pre-locked for when a `POST /api/events` endpoint ever lands.
4. **R4 — L3 reactive async DMs** — driven by R3 signal, not on schedule. Single one-line DM via existing chat channels when telemetry surfaces a specific question (or any time for the pure-aesthetic G2 probe). Andrea decides cadence; the doc doesn't. **2026-06-04 is the natural earliest re-trigger** for the first round of "did anything interesting surface?" review (~2 weeks of TL-series telemetry collection from 2026-05-21).

   **Trigger criteria for a reactive DM (pre-specified 2026-05-21 to keep R4 actionable on 2026-06-04 instead of letting "we have telemetry" become an indefinite defer):**
   - **Funnel gap:** high `signup.completed` count but low `sync.first` count for the same users (onboarding stalls between code redemption and platform connection).
   - **Engagement gap:** `wishlist.toggled` activity not followed by a repeat `session.opened` within 7 days (one-and-done usage pattern).
   - **Quality spike:** `remap.used` > 2 per user per week (their sync's title-matching is failing them), OR repeated `error.surfaced` on the same route × user pair (silent regression they're hitting).
   - **Retention drop:** a previously daily-active user's `session.opened` gap exceeds 7 days (lost-interest signal — DM probes whether something broke or they just don't care).
   - **Ad-hoc G2 probe (aesthetic):** no telemetry trigger needed — send "does the look feel weird or fine?" whenever convenient. G2 is qualitative-only; telemetry can't surface it.

   These criteria are deliberately specific, not exhaustive. The point is to make "signal worth a DM" a recognisable condition rather than a subjective judgment that gets postponed. If telemetry shows any of the above on 2026-06-04 (or any subsequent review), the DM goes that week.

**Fallback rule (locked 2026-05-13; resolved 2026-05-13).** R1 → R2 was the planned order with R2 as the slip-fallback. R1 landed cleanly without slipping, so the fallback never triggered. R2 remains queued but is now ordinary backlog rather than safety-net.

With R1 done, **R3 (L1 telemetry) is the active engineering workstream**; R4 (reactive DMs) and R2 (PSN mobile fix) run on Andrea's pacing independently of telemetry build-out.

**Approach note (2026-05-21, supersedes the 2026-05-12 urgency framing).** The original §6.5 urgency framing was a 2-week fresh-experience window for booked chats with Giuseppe / Gaetano / Luigi. That framing is dropped per D10 — the cohort is friends and booked slots feel obligated. Telemetry replaces the "ask them questions" approach for behavioural gaps; reactive DMs cover the qualitative-only gaps when (and only when) a specific question surfaces.

---

## 7. Session notes

*(Empty. Capture JTBD-lite chat notes here as raw quotes, one per session. Synthesise into §2–§4 weekly.)*

---

## 8. Decisions locked in this doc

- **D1 — This doc is the canonical user-research record.** Bug-driven observations should still land in `CLAUDE.md` Recent Fixes (operational truth), but the *user-research interpretation* of those bugs lives here.
- **D2 — Andrea-only observations are flagged as such.** Confidence ratings (Observed / Inferred / Assumed) include user provenance. JS3 / JS4 / JS6 are explicitly Andrea-only until verified.
- **D3 — Observation channel is L2 + L3 first, L1 later.** Telemetry table is durable infrastructure but doesn't unblock the gaps; in-app feedback + chats do.
- **D4 — Job stories will be refined at the user-needs layer.** This doc captures candidates; `/layers-user-needs` is where they get pressure-tested and prioritised.
- **D5 — R1 (L2) is an in-app inline-textarea form persisted to DB, not mailto.** Decided 2026-05-13. Reason: mailto bounces the user out of the app and breaks the terminal aesthetic. Inline textarea + `POST /api/feedback` + admin view keeps everything inside Hoard, matches the closed-system feel, and seeds the schema/admin pattern we'd want for L1 anyway.
- **D6 — No push channel (webhook / email-out) in R1.** Decided 2026-05-13. Reason: Andrea would rather see actual feedback volume and cadence before committing to a delivery channel. Adding B (Slack/Discord) or C (transactional email) later is one route handler call away; ripping out an unwanted channel is more invasive.
- **D7 — L2 settings placement: new About section at the bottom, between Data Export and Danger Zone.** Decided 2026-05-13. Reason: clean isolation from Account / Privacy / data-management settings; About is a natural future home for version info, changelog links, license notices, support contact.
- **D8 — R1 → R2 has a slip-fallback.** Decided 2026-05-13. If R1 slips for any reason, R2 (PSN mobile guided-flow fix) jumps ahead. A 5-line fix to an active onboarding block should never be gated behind a feature-channel build-out that runs long.
- **D9 — L2 rate limit: 10/hour and 20/day per user.** Decided 2026-05-13. Reuses the existing two-tier limiter pattern from I-series (`POST /api/auth/redeem-invite`). Generous enough for legitimate burst-reporting after a bug discovery; tight enough that an accidental keyboard-spam can't write hundreds of rows.
- **D10 — No calendar chats; rely on telemetry + reactive async DMs.** Decided 2026-05-21. The original L3 design (booked 15-min JTBD-lite chats every 4–6 weeks) was rejected before any invite went out. Reason: per P6 the cohort is friends-of-Andrea, and a booked slot feels obligated in a way that distorts the signal — users would either decline (and Andrea would feel bad asking again) or accept reluctantly (and the answers would optimize for "what Andrea wants to hear"). Replaced with: L1 telemetry promoted from R4 to R3 (next active workstream) as the primary behavioural-gap instrument; L3 redefined as reactive async DMs sent in response to specific telemetry findings (or ad-hoc for the purely-qualitative G2). The "indirect, lower-touch on users" framing is the operative constraint. Side effect: the 2026-05-12 urgency framing (2-week fresh-experience window) is also dropped — the new design has no time pressure on users.

---

## 9. Next step

~~Per `/layers-observed-behaviour` close: these candidate job stories are ready to refine at the user needs layer. Run `/layers-user-needs` when ready — likely after R1 (mailto link) ships, so the user-needs session has at least one beta-user response to react to instead of being a pure Andrea-articulation exercise.~~

**Done 2026-05-21.** `/layers-user-needs` ran without waiting on L2 inbound or the 2026-06-04 telemetry baseline — refusing to start because "data isn't all in yet" was the indefinite-defer failure mode flagged for R4 elsewhere. Output landed in §10 below. The session's deferred-validation items become inputs for the 2026-06-04 review.

Next natural step: `/layers-product-strategy` once §10's opportunities are stable.

---

## 10. User-needs layer output (2026-05-21)

### 10.1 User framing

**One archetype, multiple contexts.** Option C from the framing decision: a single user model with cohort-specific divergences named at the point where evidence diverges (Andrea-only flags on JS3 / JS4 / JS6 — those needs are real for Andrea but unverified for the beta cohort).

**Archetype:** *A game collector who plays across multiple platforms (Steam + PSN as the heaviest, plus Xbox / GOG / Nintendo / Epic as long-tail), who wants a single place to see, organise, and remember their library and what they're playing.*

**Contexts in which needs arise** (each maps to one or more job stories below):
- First-time platform connect (onboarding moment)
- Routine library browse / search
- Discovering a sync produced a wrong match
- Tracking upcoming releases (wishlist + scope-filtered browse)
- Settings exploration (decorative-vs-real-control judgments)
- Opening the app cold (dashboard / "what's relevant right now")
- Sign-up / pending-state (welcome screen orientation)

**Cohort divergences flagged:** the Andrea-only confidence rating on JS3 / JS4 / JS6 means those needs are *real for Andrea-the-power-user* but *unverified for the friendly-fire beta cohort* (Luigi / Giuseppe / Gaetano / Daniel). The biggest unknown is **JS6 (aesthetic generalizability)** — see §10.4.

### 10.2 Refined job stories with functional / emotional / social layers

Each refined from §4 candidates. Format adds the three need types per the skill's prompt; provenance kept where §4 had it.

---

**N1. Status-from-play on first sync** *(refines JS1)*
> *When I connect a platform account for the first time, I want my imported library to land with statuses that reflect what I've actually been playing (not all-Backlog), so I recognise my collection immediately without having to re-categorise dozens of games.*

- **Functional:** status derived from total merged playtime (`>0 → OnHold`, else `Backlog`)
- **Emotional:** recognition — "this tool already knows what I've been doing" feeling on first run
- **Social:** —
- **Confidence:** Observed (Luigi, O1)
- **State:** well-served (shipped post-Luigi's all-Backlog bug, commit `6c624a0`)
- **Importance:** HIGH — first-impression friction is the canonical retention killer (P4)

---

**N2. Trust restoration on wrong-match discovery** *(refines JS2)*
> *When I notice a synced game points to the wrong IGDB entry (sequel, mobile clone, regional re-release), I want to remap it to the right one in one tap without losing my notes / status / playtime, so I can rely on the data even when the source's ranking lies.*

- **Functional:** rebind `UserGame.gameId` to a different `Game` row + preserve all user-data fields
- **Emotional:** **trust restoration** — sync correctness is the *trust anchor* of the whole tool (P1). Wrong match doesn't just create a wrong record, it taints confidence in every other record.
- **Social:** —
- **Confidence:** Observed (Andrea + Luigi, O3) — Ragnarok-MMO + Slay-the-Spire-2
- **State:** well-served (smart matcher + remap UI shipped)
- **Importance:** HIGH — every observation cluster around P1 traces back here

---

**N3. Liveness as credibility** *(refines JS3 — Andrea-only)*
> *When the UI shows me a control or a number, I want it to do something real and stay current, because lying affordances and frozen surfaces don't just disappoint individually — they make me distrust the whole app.*

- **Functional:** every control wired to real backend behaviour; time-sensitive displays update live
- **Emotional:** **credibility** — the meta-feeling that the tool is honest. Closely linked to N2's trust anchor but different in kind: N2 is about *data correctness*, N3 is about *interface honesty*. Both feed the same overall trust gauge.
- **Social:** —
- **Confidence:** Observed → **Andrea-only** (O6, O7). The "lying-affordance erodes trust faster than missing feature" pattern (P2) is strongly held by Andrea but never tested against the cohort.
- **State:** well-served on the surfaces audited (Settings PR A/B, "feel alive" batch); ongoing discipline elsewhere
- **Importance:** HIGH for Andrea; **UNKNOWN for cohort** — if a Luigi-class user wouldn't notice the difference between a lying control and a real one, the design budget for honest affordances would be lower

---

**N4. Scope invariant on filtered surfaces** *(refines JS4 — Andrea-only)*
> *When I'm browsing a list filtered by some scope (wishlist / platform / status), I want every surface on that page — hero, banner, agenda rail, counts, empty-state CTA — to respect the scope, so I don't have to re-verify what I'm looking at on each glance.*

- **Functional:** every dynamic element on a scoped surface reads from the same scope predicate
- **Emotional:** **focus** — not having to track context manually; offloading the "which slice of the data is this view showing me" cognitive job to the interface
- **Social:** —
- **Confidence:** Observed → **Andrea-only** (O4 — wishlist hero showing non-wishlisted game triggered a 5-bug audit)
- **State:** well-served on Releases post-R6; ongoing discipline
- **Importance:** HIGH for Andrea on dense filterable surfaces; **UNKNOWN for cohort** — a Luigi-class user may not interrogate hero vs. agenda for scope consistency

---

**N5. Orientation in pending state** *(refines JS5 — Assumed)*
> *When I sign up via an invite, I want to land somewhere that explains what happens next (especially if I'm pending), because the first 30 seconds of "I'm in but nothing's happening" without context feel like the app is broken or stuck.*

- **Functional:** welcome screen with state-aware copy (pending vs. has-requested-access vs. active)
- **Emotional:** reassurance — "I'm in the right place, not lost"
- **Social:** —
- **Confidence:** **Assumed** (per D2 revision — drives the I4 Welcome screen design but nobody has been observed bouncing off a pending state)
- **State:** shipped, unvalidated
- **Importance:** HIGH IF real, MEDIUM IF over-engineered. A probe candidate for the first L3 chat round once telemetry surfaces a funnel gap (N5 maps to the §6.5 R4 trigger "high `signup.completed` but low `sync.first`")

---

**N6. Aesthetic as identity** *(refines JS6 — Andrea-only)*
> *When I'm a collector using this tool day-to-day, I want dense terminal-aesthetic information presentation, because the density isn't just decoration — it's what makes the tool feel like mine, like a craft instrument, not a consumer app.*

- **Functional:** information density (many data points per screen), monospace typography, terminal-color palette
- **Emotional:** **ownership** — "this is *my* tool"; **craft pride** — using a precise instrument vs. a polished consumer surface
- **Social:** **aesthetic differentiation** — being perceived (or self-perceived) as the kind of user who prefers a power tool to a casual tool. Even though Hoard is private, the aesthetic signals "serious collector" in the same way a developer's terminal setup or a photographer's manual camera does — to oneself if no-one else is watching.
- **Confidence:** Observed → **Andrea-only**. **This is the highest-cost-of-being-wrong gap (G2).** If the cohort doesn't share the social/emotional resonance, the entire visual language is mis-targeted.
- **State:** core to current product
- **Importance:** **EXISTENTIAL for Andrea; UNKNOWN for cohort.** Resolving this is a strategy decision, not a tactical one — flagged for `/layers-product-strategy`.

---

**N7. Relevant-now on app-open** *(refines JS7 — Inferred)*
> *When I open Hoard, I want to immediately see what I'm playing now / what's launching soon I care about / how my library has changed lately, because dashboards that don't surface "what's relevant right now" become wallpaper I scroll past.*

- **Functional:** now-playing card, wishlist countdown, weekly-added or recent-activity surface
- **Emotional:** "this app has thought about my day" — the opposite of generic-dashboard wallpaper-fatigue
- **Social:** —
- **Confidence:** Inferred (no direct behavioural evidence; informs Dashboard design implicitly)
- **State:** shipped; telemetry will tell us if users open the app and then go elsewhere immediately
- **Importance:** MEDIUM — the dashboard isn't broken if users skip it (sidebar gets them to Library/Releases fast), but the dashboard's *value claim* depends on N7 being real

---

### 10.3 Hidden needs surfaced (Phase 3)

Three needs the §4 candidates didn't name but the corpus suggests:

---

**N8. One game across platforms, not one-per-platform** *(new — emerges from sync-quality work + JS2's adjacent territory)*
> *When I own the same game on multiple platforms (e.g. Slay the Spire on Steam AND PSN), I want one row in my library representing the game with combined playtime, not two separate rows, so my library reflects my collection not the source platforms' bookkeeping.*

- **Functional:** Game-record-per-game identity (already shipped via the `Game` + per-platform `playtimeByPlatform` JSON model)
- **Emotional:** **collection coherence** — the library represents *the collector*, not *the source systems*
- **Social:** —
- **Confidence:** Inferred from the architectural decision history (cross-platform identity matters enough to justify the `Game` model + playtimeByPlatform JSON shape). No direct user statement.
- **State:** shipped at the data layer; remap (N2) is the recovery mechanism when matching fails
- **Importance:** MEDIUM — it's the unspoken default that makes the rest work; users would notice if it broke

---

**N9. Data-freshness affordance** *(new — emerges from useAutoSync work + the platform.lastSyncAt visibility pattern)*
> *When I look at a library or release-tracking view, I want to know when this data was last synced from the source, so I can tell whether I'm seeing live information or a stale snapshot.*

- **Functional:** visible `lastSyncAt` indicators; sync-status badges; auto-sync running in background when the app is open (already shipped via `useAutoSync`)
- **Emotional:** **trustworthiness-by-timestamp** — closely related to N2 (data correctness) and N3 (interface honesty), but specifically about *recency* rather than *accuracy* or *liveness*
- **Social:** —
- **Confidence:** Inferred (drives the existing sync-frequency UI + useAutoSync hook; no direct user statement)
- **State:** partially shipped — sync timestamps visible on PlatformDetail; less prominent on Library / Dashboard / Releases
- **Importance:** MEDIUM — would matter most for a heavy multi-platform user who hasn't synced manually in days

---

**N10. Wishlist as planning tool, not just buying list** *(new — emerges from the Releases-rework R-series design intent + JS7's relevant-now adjacency)*
> *When I'm thinking about what to play next, I want my wishlist to function as a queue I plan from — not just an inventory of "things I want to buy someday" — so the gap between intention and play is short.*

- **Functional:** wishlist integration with the dashboard's "what's relevant" surface; countdown hero on Releases; wishlist→library transition at purchase
- **Emotional:** **anticipation** + **planning satisfaction** — wishlist as a productive tool, not a hoarding pile
- **Social:** —
- **Confidence:** **Assumed** — no direct evidence; informs the Releases-page R-series design + the Wishlist-as-library-citizen architectural decision (CLAUDE.md decision #29)
- **State:** partially shipped; the wishlist→library decision was about technical model, not user-facing planning UX
- **Importance:** UNKNOWN until telemetry shows whether `wishlist.toggled` correlates with subsequent engagement (R4 trigger criterion)

---

**N11. Complete library across all owned platforms** *(new — surfaced by Andrea's "platform coverage" question 2026-05-21)*
> *When I have games on platforms outside current sync coverage (Xbox / GOG sync stubs, manual-only Nintendo / Epic), I want them represented in my library too, because the implicit promise of "your hoard, unified" breaks if a Steam user with 200 PC games and 30 Switch games only sees the 200.*

- **Functional:** sync coverage extended to all platforms a user has accounts on; OR where API access is impossible (Nintendo / Epic per CLAUDE.md Hard Rule 6), a frictionless manual-add path that doesn't feel like a workaround
- **Emotional:** **completeness** — the library represents the *collector*, not the *currently-supported-platforms-subset*. Adjacent to N8 (one-game-per-platforms) but operating at a different level: N8 is about per-game identity; N11 is about platform-set coverage.
- **Social:** —
- **Confidence:** **Inferred** — Andrea is the only user with manual Xbox/GOG entries; cohort hasn't asked, but absence-of-complaint at N=6 isn't evidence of absence-of-need at scale. **Most relevant strategy-bet input at the next layer.**
- **State:** Steam + PSN sync shipped; Xbox + GOG are stubs returning `[]`; Nintendo + Epic are deliberately manual-only per Hard Rule 6
- **Importance:** TBD — depends on cohort growth + what platforms they actually own. The "should we build Xbox sync next?" question lives here and gets answered in `/layers-product-strategy`.

---

**N12. Frictionless way to flag what's broken or wished-for** *(new — surfaced by Andrea's same question 2026-05-21; was implicit in F-series channel design but not enumerated in §4)*
> *When I notice something wrong, weird, or wish for an improvement, I want to send it to the developer without bouncing out of the app or filing a formal ticket, because friction at the report-moment means the report never happens.*

- **Functional:** in-app inline-textarea feedback form persisted server-side (DB row); admin reads in `/admin` FEEDBACK section. **Settings entry renamed "About" → "Feedback" 2026-05-21** in post-deploy polish — "About" was vestigial copy from when the section was a placeholder.
- **Emotional:** **being heard without making it a project** — the difference between "I'll mention it next time we talk" (which never happens) and "5-second form, done"
- **Social:** (mild) **collaborator, not consumer** — the feeling of being part of the tool's development, especially relevant for the friendly-fire cohort where Hoard is "Andrea's thing they're helping with"
- **Confidence:** **Inferred** — this is precisely what F-series shipped; the need was implicit in the channel-design decision (D3, D5–D9) but never enumerated as a job story in §4
- **State:** **Well-served (deployed in the F-series commit cascade 2026-05-21).** Before this cascade the code was uncommitted and the channel was *built but not deployed* — a critical state distinction that surfaced during the user-needs review.
- **Importance:** HIGH — the channel feeds L2 inbound which feeds N1–N10 validation. Without it, the entire research-channel design (D3) is theoretical.
- **Maintenance signal:** if `Feedback` table stays empty over multiple weeks, the channel is not working as a channel even though it's technically operational. Promote to active investigation if that happens.

---

### 10.4 Prioritised opportunity ranking (Phase 5)

Opportunity score ≈ Importance × (1 / how-well-currently-served). Highest-opportunity = high importance + currently weakest.

**Ranked from highest opportunity for next investment:**

1. **N6 (Aesthetic as identity) — RESEARCH OPPORTUNITY, not implementation.** Highest cost-of-being-wrong (G2). The whole visual language depends on this need being shared by users beyond Andrea. **Action: hold for `/layers-product-strategy`** — if N6 generalizes, double down on the aesthetic as a positioning lever; if it doesn't, fundamental redesign. This is the only need that could justify changing the product's positioning.
2. **N11 (Complete library across all owned platforms) — STRATEGY-BET OPPORTUNITY.** Inferred from absent platforms (Xbox/GOG sync stubs, Nintendo/Epic manual-only). The "should we build Xbox sync next?" question lives here. Strategy-layer decision: how much cohort-growth pressure justifies the API integration cost vs. doubling down on Steam/PSN polish? Currently no cohort member has demanded it, but absence-of-complaint at N=6 ≠ absence-of-need at scale.
3. **N10 (Wishlist as planning tool) — DESIGN OPPORTUNITY.** Currently shipped at data-layer only; the user-facing planning UX (wishlist→play loop) isn't tightly designed. If telemetry shows high `wishlist.toggled` without follow-through (R4 trigger), this becomes the next-investment design surface.
4. **N7 (Relevant-now on app-open) — DESIGN OPPORTUNITY, depending on telemetry.** Inferred need; if `session.opened` shows quick sidebar-jump-away-from-Dashboard, the Dashboard's "what's relevant" claim is broken and needs redesign.
5. **N9 (Data-freshness affordance) — INCREMENTAL.** Partially shipped; could grow visibility on Library / Dashboard / Releases. Low cost-to-execute, medium value.
6. **N5 (Orientation in pending state) — VALIDATION FIRST.** Already shipped + Assumed. The question is whether it's needed at all, not whether it works. Probe in next L3 round.
7. **N12 (Feedback channel) — MAINTENANCE + MONITORING.** Well-served *post-deploy* (2026-05-21). The maintenance signal is the channel staying *populated* — if `Feedback` table accumulates rows, the channel is working; if it stays empty for weeks, the friction-budget is wrong and the channel isn't acting as one.
8. **N1 / N2 / N3 / N4 / N8 — MAINTENANCE.** Well-served; ongoing discipline rather than next-investment opportunities. Worth being explicit they're not "done" (the disciplines slip — the F1.2 router-prefix bug was a P2 regression that crept in).

### 10.5 Contradictions

- **N6 ↔ cohort generalizability.** The aesthetic that makes Hoard "feel like Andrea's tool" might be the same thing that makes it *not* feel like Luigi's or Giuseppe's. Resolution is a strategy decision, not a UX one — name and own the positioning.
- **N3 / N4 (Andrea-only) ↔ cohort engagement budget.** If a Luigi-class user wouldn't notice a lying control or scope drift, then the design discipline budget around them is over-spent for cohort needs and under-spent for Andrea-needs. Telemetry won't resolve this; only direct chat can.

### 10.6 Gaps — research questions still open

- **G-N1 (extension of G2 in §5):** Does N6 (terminal-aesthetic-as-identity) generalize beyond Andrea? Only L3 reactive DM probes can answer.
- **G-N2 (extension of G6 in §5):** Are there N-needs the corpus doesn't surface at all? Cold-stranger users (G8) would surface these — friendly-fire cohort won't.
- **G-N3:** Is N5 (welcome orientation) needed in the form it's shipped, or did the welcome screen over-engineer for a non-existent problem? Probe with the first cohort member who lands in the welcome screen for >1 minute (telemetry: high `signup.pending` + low immediate `signup.completed`).
- **G-N4:** Does N10 (wishlist as planning) actually drive engagement? Telemetry: `wishlist.toggled` + subsequent `session.opened` within 7 days = signal.

### 10.7 Confidence summary

| Need | Confidence | Andrea-only? | State | Opportunity rank |
|---|---|---|---|---|
| N1 | Observed | No | Well-served | 8 (maintenance) |
| N2 | Observed | No | Well-served | 8 (maintenance) |
| N3 | Observed | **Yes** | Well-served | 8 (maintenance) — cohort-validation pending |
| N4 | Observed | **Yes** | Well-served | 8 (maintenance) — cohort-validation pending |
| N5 | **Assumed** | — | Shipped, unvalidated | 6 (validate first) |
| N6 | Observed | **Yes** | Core to product | 1 (research priority) |
| N7 | **Inferred** | — | Shipped | 4 (telemetry-dependent) |
| N8 | **Inferred** | — | Well-served at data layer | 8 (maintenance) |
| N9 | **Inferred** | — | Partially shipped | 5 (incremental) |
| N10 | **Assumed** | — | Partially shipped | 3 (design opportunity) |
| N11 | **Inferred** | — | Steam+PSN shipped; others stubbed or manual-only | 2 (strategy-bet opportunity) |
| N12 | **Inferred** | — | Well-served post-deploy 2026-05-21 | 7 (maintenance + monitoring) |

**Three Assumed / five Inferred / four Observed** out of 12 (3 of which Andrea-only). Per the framework's close-out heuristic: "Several of these are marked as assumed. Before building strategy on them, consider running `/layers-observed-behaviour` to gather evidence." We already ran observed-behaviour — the corpus is what we have. The right move is to mark these explicitly when entering `/layers-product-strategy` and let strategy bets be calibrated by confidence.

---
