# Hoard — Trophies & Achievements

> **Workstream:** pull PSN trophy + Steam achievement data into Hoard, surface aggregate completion on GameDetail, auto-flip games to `Completed` when 100% earned.
> **Status:** Decisions T-D1 … T-D10 locked by Andrea 2026-05-08. T1 (schema) ready to start; subsequent PRs follow the order in §3.
>
> **Why this matters:** today `UserGame.status` is purely user-asserted (or inferred from playtime > 0 → `OnHold`). With trophy/achievement data we can drive a real "completion rate" signal — and at 100% we can promote the row to `Completed` automatically, which is the obvious move.
>
> **Source documents:**
> - PSN: [`psn-api`](https://psn-api.achievements.app/) — `getUserTitles(auth, accountId)` is the relevant endpoint. Same NPSSO token already used for the library sync.
> - Steam: [Steam Web API](https://partner.steamgames.com/doc/webapi) — `ISteamUserStats/GetPlayerAchievements?key=...&steamid=...&appid=...` and `ISteamUserStats/GetSchemaForGame`. Existing `STEAM_API_KEY` env var works; we already have every `Game.steamAppId`.
>
> **This file** captures the proposed decisions, schema, PR sequence, and known risks. It does **not** assume any of it has shipped — flip the §6 status table as PRs land.

---

## 0. Background: what each platform exposes

### PSN trophies (via `psn-api`)

`getUserTitles(auth, 'me')` returns one entry per game the user has trophy progress on:

```typescript
{
  npCommunicationId: 'NPWR12345_00',  // STABLE PSN identifier (key opportunity — see T-D5)
  trophyTitleName: 'Slay the Spire',
  trophyTitleIconUrl: '...',
  definedTrophies: { bronze: 36, silver: 7, gold: 4, platinum: 1 },
  earnedTrophies:  { bronze: 12, silver: 2, gold: 0, platinum: 0 },
  progress: 34,                         // 0–100 percent (PSN's own calc)
  hiddenFlag: false,
  lastUpdatedDateTime: '2026-05-07T...'
}
```

**One call returns every trophy title for the user.** No per-game iteration needed — much simpler than Steam.

### Steam achievements (via Steam Web API)

Two endpoints, both per-game:

- `GET /ISteamUserStats/GetPlayerAchievements?key=...&steamid=...&appid=...`
  ```json
  {
    "playerstats": {
      "achievements": [
        { "apiname": "ACH_KILL_BOSS", "achieved": 1, "unlocktime": 1700000000 },
        { "apiname": "ACH_FIND_SECRET", "achieved": 0, "unlocktime": 0 },
        ...
      ]
    }
  }
  ```
  Returns 403 + `success: false` if the user's profile is private OR the game has no achievements at all. Treat both as "no data, skip silently."

- `GET /ISteamUserStats/GetSchemaForGame?key=...&appid=...` — total achievements available + display metadata. Per-game total isn't strictly needed (we can `count(achieved===1)` and `count(*)` from the player call), but `GetSchemaForGame` lets us cache the universal total separately.

**Per-game iteration required.** With ~500 games, that's ~500 API calls per Steam-connected user. Steam's hard cap is 100k req/day; plenty of headroom, but we throttle and run on the background queue (same pattern as HLTB) so the sync POST stays snappy.

---

## 1. Locked decisions (Andrea, 2026-05-08)

All ten confirmed in one pass. Each addresses a specific implementation question; together they pin down the v1 surface so T1–T6 can land without re-litigation.

### T-D1 — Aggregates only for v1, no individual trophies/achievements stored.

Schema additions are four columns on `UserGame`: `achievementsEarned`, `achievementsTotal`, `achievementsPercent`, `achievementsUpdatedAt`. **No** `Trophy` table, **no** per-trophy rows.

**Rationale:** the aggregate is what drives the auto-complete rule and the receipt-block UI. Storing thousands of individual trophy rows for unimplemented features is YAGNI. A "trophies earned this week" feed (v2) would add a `Trophy` table then — the schema migration is straightforward, and the fetcher already pulls per-trophy data we'd just need to start persisting.

**Tradeoff accepted:** no per-trophy detail on GameDetail without going back to PSN/Steam at render time. For v1 the receipt block's "// trophies · 12/35 · 34%" line is the whole UI surface, so this is moot.

---

### T-D2 — Auto-complete-at-100% scope.

When sync brings `achievementsPercent === 100`:

| Current status   | Action                |
|---                |---                    |
| Backlog           | → Completed           |
| OnHold            | → Completed           |
| Playing           | → Completed           |
| Completed         | no-op (already there) |
| Dropped           | **leave as Dropped**  |
| Wishlist          | **leave as Wishlist** |

**Rationale:** `Dropped` and `Wishlist` are explicit user decisions — "I gave up" or "I haven't bought it." Overriding those with auto-complete would be the agent disrespecting the user's library state. The other statuses are either defaults (Backlog from sync) or "in-progress" labels (OnHold/Playing) where 100% definitively means done.

**Edge case:** if a user manually flips `Completed → Backlog` (rare, "I want to replay") their next sync auto-flips it back. Acceptable — they 100%'d the game, status reflects reality. A "manually overridden" suppression flag is over-engineering for a personal tool.

---

### T-D3 — First-sync auto-complete uses the same code path.

No "previously seen this UserGame" gate. Every sync runs the rule on every `(UserGame, achievementsPercent)` pair it sees. For a fresh sync where you've already 100%'d 50 games, those go directly from Backlog → Completed in one pass.

---

### T-D4 — PSN inline, Steam background-queued.

PSN's trophy fetch is **one call** for all titles via `getUserTitles`. Done inline in `runSync` after the library import — adds ~1 API round-trip of latency, negligible.

Steam's achievement fetch is **N calls** (one per game). Done on the existing background-queue pattern — `runSync` returns immediately, achievements trickle into the database over the next few minutes. Same flow as HLTB. Throttled at ~3 req/s; Steam's per-key cap is 100k/day so this is generous.

**Implication:** after a Steam sync, games briefly have `achievements*` = null. The GameDetail receipt block hides the line in that state, so it's invisible until data arrives.

---

### T-D5 — PSN match by `npCommunicationId` (preferred) or normalized title (fallback).

`getUserPlayedGames` returns a `titleId` per game which is NOT the same as `npCommunicationId`. The two PSN endpoints don't share IDs, so:

- **First sync after T1 ships:** match by `cleanPsnTitle(name).toLowerCase()` against existing `UserGame.game.title`. Persist `Game.psnNpCommunicationId` from the trophy response.
- **Every subsequent sync:** match by `Game.psnNpCommunicationId` directly. Stable identity, no title-collision risk.

**Bonus:** `Game.psnNpCommunicationId` partially closes the "store platform-side IDs" gap from sync-quality decision #33 in `AGENT.md`. Future re-syncs can rebind UserGames by stable PSN identity, not just IGDB identity.

**Accepted miss rate:** PSN trophy title name doesn't always match the played-game name (regional variants, subtitle differences). First-sync title-fallback may miss ~5%. Those games get no trophy data until either (a) the next sync after a manual rename, or (b) the user uses the `[wrong game?]` chip on GameDetail to remap.

---

### T-D6 — PSN scope stays PS4+PS5.

Library sync filters to `ps4_game,ps5_native_game`; trophy fetch follows the same scope. PS3 / PSP / Vita excluded due to known PSN data quality gaps.

---

### T-D7 — Steam private-profile / unsupported-game handling + scope-tab notice.

`GetPlayerAchievements` returns `{ error: "Profile is not public" }` when the profile's privacy is friends-only / private. Our fetcher catches this, returns `null`, stores nothing. Same when the game has no achievements (older indies, DLC, F2P with no achievement support) — Steam returns `success: false`, fetcher returns `null`. The receipt block hides the line when `achievementsTotal === null`.

**Amendment (Andrea 2026-05-08):** because the silent-skip behavior is invisible by design, `PlatformDetailDesktop` and `PlatformDetailMobile` need a Steam-specific note in the **scope & permissions** tab next to the existing `trophies` row. Copy: something like "// note · steam profile must be public for achievement sync. settings → privacy → game details on steam." Conditional on `code === 'st'` only — PSN's NPSSO token bypasses the public/private distinction, and Xbox/GOG don't have achievement sync yet.

---

### T-D8 — Auto-complete is silent in v1.

When the rule flips a row to Completed, we write the status and stop. No banner, no email, no dashboard notification. The user sees it on their next visit to Library/Dashboard. A "you 100%'d X this week" feed is a v2 feature once we have individual-trophy timestamps.

---

### T-D9 — GameDetail UI is a receipt-block line, no progress bar in v1.

Add a single line to the existing receipt block:

```
// trophies · 12/35 · 34%       (PSN games)
// achievements · 12/35 · 34%   (Steam games)
```

Hidden when `achievementsTotal === null`. No progress bar — the receipt aesthetic is data-dense by design and visual cruft fights the design language.

---

### T-D10 — `psnNpCommunicationId` lives on `Game`. Achievement aggregates live on `UserGame`.

This decision has two parts that are easier to follow when laid out side-by-side with what we already do for Steam:

|                              | Steam                         | PSN                                |
|---                            |---                            |---                                  |
| Stable platform-side game id  | `Game.steamAppId @unique`     | `Game.psnNpCommunicationId @unique` |
| User's earned-trophy count    | `UserGame.achievementsEarned` | `UserGame.achievementsEarned`       |
| Total trophies for the game   | `UserGame.achievementsTotal`  | `UserGame.achievementsTotal`        |

**Why on Game (not UserGame):** the `npCommunicationId` is **universal per title** — every PSN player of "Slay the Spire" sees the same `NPWR21873_00`. The Game record is the universal-per-title row in our schema; Steam's `steamAppId` already lives there for the same reason. Putting `npCommunicationId` next to it keeps the "stable platform-side identifier" idea consistent.

**Why total trophies on UserGame (despite being universal):** logically `total` could live on Game (it's the same for every player). We put it on UserGame anyway because the receipt-block render is `{userGame.achievementsEarned}/{userGame.achievementsTotal} · {userGame.achievementsPercent}%` — putting all three on the same row lets us load them in one query without a JOIN to Game. Cost of the redundancy: a few extra integer columns per UserGame row. Trivial. Single-source-of-truth at the UserGame level for read-path simplicity.

**Why this matters for sync correctness:** once `Game.psnNpCommunicationId` is populated (T2), every subsequent PSN sync resolves trophy data by stable PSN identity — not by title fuzzy-matching. That makes PSN syncs immune to the wrong-sequel / wrong-region drift we saw in the sync-quality batch (Slay-the-Spire-2 class).

---

## 2. Schema changes (post-confirmation)

```prisma
model Game {
  // ... existing fields ...
  psnNpCommunicationId String? @unique  // T-D5: stable PSN identity, e.g. NPWR12345_00
}

model UserGame {
  // ... existing fields ...
  achievementsEarned    Int?       // null = no data fetched yet
  achievementsTotal     Int?       // null = game doesn't support achievements
  achievementsPercent   Int?       // 0..100, null when total is null or earned/total not yet fetched
  achievementsUpdatedAt DateTime?  // when we last fetched
}
```

**Migration:** hand-written SQL via the documented `db execute` + `migrate resolve` recipe (pgbouncer can't run `migrate dev`).

```sql
ALTER TABLE "Game"
  ADD COLUMN "psnNpCommunicationId" TEXT;
CREATE UNIQUE INDEX "Game_psnNpCommunicationId_key" ON "Game"("psnNpCommunicationId");

ALTER TABLE "UserGame"
  ADD COLUMN "achievementsEarned"    INTEGER,
  ADD COLUMN "achievementsTotal"     INTEGER,
  ADD COLUMN "achievementsPercent"   INTEGER,
  ADD COLUMN "achievementsUpdatedAt" TIMESTAMP(3);
```

All four `UserGame` columns are nullable — pre-trophy-sync rows have `null` everywhere; the GameDetail UI hides the line.

---

## 3. PR sequence

Six PRs, shippable independently. T6 is optional / deferrable.

### T1 — Schema + types

- Migration above (hand-written SQL, not `prisma migrate dev`).
- `@hoard/types`: `UserGame` interface gains the four `achievements*` fields; `Game` interface gains `psnNpCommunicationId`.
- `apps/api/src/lib/mappers.ts`: include the new fields in `mapUserGame()`.
- No behavior changes — all fields null until T2/T3 populate them.
- Tests: type-only; no runtime cases.

### T2 — PSN trophy fetcher

- New `getPsnTrophyTitles(npssoToken)` in `apps/api/src/services/platforms/psn.ts` using `psn-api`'s `getUserTitles(auth, 'me')`.
- New `applyPsnTrophyAggregates(userId, trophyTitles)` in `apps/api/src/services/syncRunner.ts`:
  - For each trophy title:
    - Match to existing `UserGame` by `Game.psnNpCommunicationId` (subsequent syncs) or normalized title (first sync).
    - On title-match, persist `Game.psnNpCommunicationId` so future syncs use the stable id.
    - Compute `earned = sum(earnedTrophies)`, `total = sum(definedTrophies)`, `percent = round(earned/total * 100)`.
    - Update `UserGame.achievements*`.
    - If `percent === 100` AND status ∈ `{Backlog, OnHold, Playing}`, set `status = Completed` (T-D2).
- Hooked into `runSync` after the existing library import — single PSN API call, inline, latency impact negligible.
- Tests: matching strategy (npCommunicationId path + title-fallback path), aggregate math, auto-complete each status branch.

### T3 — Steam achievement fetcher

- New `apps/api/src/services/platforms/steamAchievements.ts`:
  - `getSteamAchievementsForGame(steamId, appid): Promise<{ earned, total } | null>`.
  - Two API calls per game: `GetPlayerAchievements` + (cached) `GetSchemaForGame`. The schema is universal-per-game; cache it per `appid` in an LRU like `searchCache` for the same TTL. `GetPlayerAchievements` is per-user-per-game.
  - Returns `null` on private profile (403, "Profile is not public") OR game with no achievements.
- Background trigger: `triggerSteamAchievementsBackground(userId, gameId, steamId, appid)` — fire-and-forget, `setTimeout`-throttled in batches.
- Hooked into `runSync`: after library import completes, walk every Steam-platformed UserGame and trigger the background fetcher. Same fire-and-forget pattern as HLTB.
- Auto-complete logic identical to T2 (shared helper).
- Tests: mock Steam responses (success, private, no-achievements), schema cache, throttle, auto-complete.

### T4 — Refactor: shared auto-complete helper + tests

- Extract `applyAutoCompleteRule(userGame, percent): { newStatus | null }` into `apps/api/src/lib/achievements.ts`.
- T2 and T3 both call it. Single canonical place to assert the T-D2 rule.
- Tests: every status × percent matrix, edge cases (percent === null, percent < 100, percent === 100).

### T5 — GameDetail receipt-block UI + PlatformDetail scope note

- `apps/web/src/components/screens/GameDetailDesktop.tsx` and `GameDetailMobile.tsx`: add a receipt-block line:
  - PSN-platformed game → `// trophies · {earned}/{total} · {percent}%`
  - Steam-platformed game → `// achievements · {earned}/{total} · {percent}%`
  - Multi-platform → use the source the highest percent comes from (or just label "// completion" generically, TBD when we render).
  - Hide entirely when `achievementsTotal === null`.
- Style: same `t-mono` / `t-faint` treatment as adjacent receipt rows. Color the percent green when ≥ 80, amber otherwise (or skip color, keep monochrome — minor decision).
- **Scope-tab amendment (T-D7):** in `PlatformDetailDesktop.tsx` and `PlatformDetailMobile.tsx` scope tab, when `code === 'st'` only, add a small note line under the existing `trophies` checkbox: "// note · steam profile must be public for achievement sync. settings → privacy → game details." Renders nowhere on PSN/Xbox/GOG/etc.
- Tests: snapshot-style render assertions for the receipt line; conditional render for the Steam note.

### T6 — Dashboard rollup (deferrable)

- Side-panel stat: "// achievements · 1,242 / 4,580 · 27%" rolling all the user's library.
- Single Prisma query (sum of `achievementsEarned` + sum of `achievementsTotal` scoped to userId).
- Optional v1 add. Skip unless there's appetite — easy to bolt on later.

---

## 4. Risks / known unknowns

| Risk | Mitigation |
|---|---|
| PSN trophy title doesn't match played-game title (regional variant, subtitle drift). | Title-fallback match is best-effort. After the first sync, every match is by stable npCommunicationId so this only bites the initial population. Post-T1 the user can `[wrong game?]` to manually fix any holdouts. |
| Steam private profile means no achievement data. | `T-D7`: silent skip, store nothing, hide the receipt line. User can flip Steam profile to public + re-sync if they want the data. |
| `psn-api` fragility (it's an unofficial package). | Same risk as the existing PSN library sync — pinned package version, npsso token re-paste recovery if it breaks. No new exposure beyond what's already in production. |
| Auto-complete fires on a game the user isn't done with (e.g., 100%'d achievements but hasn't seen the ending). | Edge case: in PSN/Steam culture, 100% achievements implies completion. If this turns out to be a personal pet peeve, we add an `auto_complete_status: bool` user pref later. v1: trust the rule. |
| Hammering Steam API for users with huge libraries (~1000+ games). | T-D4 throttle + LRU schema cache. Budget for 1000 games is ~5 minutes background runtime — well under daily caps. |
| Steam achievement schema changes (devs renaming/removing). | Per-sync re-fetch handles drift naturally. We don't store individual achievements, just aggregates. |

---

## 5. Out of scope (deferred to v2)

- **Individual trophy/achievement records.** Stored at sync time, surfaced as a "trophies earned this week" feed or a per-trophy list on GameDetail. Requires `Trophy` + `UserGameTrophy` tables.
- **Rarity / global earn rate display** ("only 3.2% of players earned this"). Steam exposes this via `GetGlobalAchievementPercentagesForApp`; PSN exposes per-trophy rarity ranks. Would require individual storage too.
- **Trophy / achievement notifications.** "You unlocked X" toast on next visit. Needs individual records + a "since-last-seen" pointer.
- **Xbox achievements.** Xbox sync is a stub today (returns `[]`). When the Xbox library sync ships, achievements roll in alongside (OpenXBL exposes them per game). Same shape — `achievements*` columns reused.
- **GOG Galaxy achievements.** GOG's API exposes achievements but it's even more fragile than the library sync. Defer indefinitely.
- **Cross-platform reconciliation.** A game on both Steam and PSN: do you treat Steam's achievements and PSN's trophies as separate progress bars or merged? Current schema has one `achievements*` triple per UserGame — we'd take the higher percent in v1 if Andrea ever runs cross-platform games, with the receipt line labeled by the platform that contributed it. Not critical; revisit if it becomes a pain.

---

## 6. Status tracking

| PR | Status | Notes |
|---|---|---|
| T1 — Schema + types | Not started | Hand-written migration via documented db-execute recipe. |
| T2 — PSN trophy fetcher | Not started | Single inline call to `getUserTitles`. |
| T3 — Steam achievement fetcher | Not started | Per-game on background queue, throttled. |
| T4 — Shared auto-complete helper | Not started | Refactor extract from T2/T3. |
| T5 — GameDetail receipt UI | Not started | Hidden when `achievementsTotal === null`. |
| T6 — Dashboard rollup | Optional / deferrable | Only if Andrea wants v1 surface. |

Update this table as PRs land; mirror to `docs/PLAN.md` Phase Status row when the workstream wraps.

---

## 7. Decision history

This section captures the order in which decisions were considered and why each landed where it did. Update as decisions evolve.

- **2026-05-08 (initial scoping):** T-D1 through T-D10 drafted as proposals. Every decision was open pending Andrea's review.
- **2026-05-08 (decisions locked, same day):** Andrea confirmed T-D1 through T-D10 in a single pass. T-D7 amended to add a Steam-only "profile must be public" note in the PlatformDetail scope & permissions tab — handled in T5 alongside the GameDetail receipt-block line. T-D10 confirmed with the user noting they trust the call; rationale expanded inline with a Steam/PSN side-by-side table for future agents.
