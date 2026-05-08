# Hoard — Settings Audit & Sync Log

> **Workstream:** audit every Settings surface for wired-vs-decorative controls, fix the unwired ones, and add a per-platform activity log so the existing-but-empty Log tab becomes useful.
>
> **Status:** Scoped 2026-05-08, decisions S1–S4 + L1–L4 locked inline below (no separate confirmation round — Andrea aligned in the audit conversation).
>
> **Trigger:** Andrea reported the scope-and-permissions controls on PlatformDetail "don't seem connected to anything" and asked for a check across all settings. I audited each Settings surface and produced the table in §1 below.

---

## 1. Audit findings

### Already wired (works as expected)

| Surface | Control |
|---|---|
| Settings → Account | display name input, email input, sign out, wipe library, delete account |
| Settings → Platforms | connect / disconnect / save NPSSO / PSN guided flow / sync all |
| Settings → Appearance | show HLTB, cover density, terminal cursor, upcoming hype filter ± |
| PlatformDetail → Sync tab | sync-frequency radios, sync now |
| PlatformDetail → Scope tab | Steam-only "profile must be public" note (T5) |

### Intentional v2 stubs (already labeled with `// v2` chip + opacity 0.5 + pointer-events: none)

| Surface | Control | Why deferred |
|---|---|---|
| Account | profile-visibility radios (3 options) | needs visibility model + share/profile UI |
| Account | sessions list (fake static rows) | needs JWT session table + revocation |
| Appearance | theme: light + auto radios | light mode = real design-system effort |
| Settings sub-pages | Library / Notifications / Privacy / Data export | render `ComingSoonPanel`, full implementations are v2 scope |

### Genuinely broken / decorative — the targets of this workstream

| Surface | Control | Current state |
|---|---|---|
| PlatformDetail → Auth (PSN) | `[reveal]` NPSSO button | renders, click does nothing |
| PlatformDetail → Auth (PSN) | "auto-refresh 7d before expiry" toggle | hardcoded `on={true}`, no onChange — and Sony has no token-refresh API so the feature is impossible |
| PlatformDetail → Scope tab | `library / playtime / trophies / friends` checkboxes | all hardcoded on/off, no onChange — none are meaningfully toggleable |
| PlatformDetail → Log tab | "// no log entries yet" stub | always empty, no platform-log data model exists |

---

## 2. Locked decisions

### S1 — Reveal NPSSO is wired (toggle masked/unmasked).

The credential is already in `Platform.credentials.npsso`. The `[reveal]` button toggles a local `revealed` boolean; when on, render the full 64-char NPSSO instead of the masked `NPSSO•••8e2f`. No backing data needed.

### S2 — Auto-refresh toggle is **deleted**, replaced by a token-health status row.

NPSSO is a session cookie; Sony has no refresh API. The toggle was lying about a feature we will never build. Replacement reads `Platform.syncStatus`:

- `syncStatus === 'ok'` → green dot · "// connection healthy · last verified {relative}"
- `syncStatus === 'error'` → red dot · "// last sync failed — token may be expired" + inline `[paste new token]` CTA that opens the existing PSN re-paste flow (the 64-char input on the auth tab)

We don't try to distinguish "token expired" from "PSN API down" — both cases want the same user action. Honest framing without overpromising. Future refinement: if `error` rate stays correlated with token age, add a "token age" hint.

### S3 — Scope checkboxes converted to read-only "what hoard reads" info.

The four scopes — `library` / `playtime` / `trophies` / `friends` — are not meaningfully toggleable in v1:

- **library** + **playtime** are mandatory if you sync at all (toggling them off = disconnect)
- **trophies** are auto-fetched when supported (Steam: only if profile public; PSN: always when synced)
- **friends** is permanently out of scope (per AGENT.md "What Hoard Is Not")

Conversion: keep the visual shape (icon row) but as a **read-only info panel** — green check for what Hoard reads, red X for what it doesn't, no checkbox affordance, no onChange, no hover state implying interactivity. Header re-labeled to "// what hoard reads" to make the read-only nature clear.

### S4 — Log tab is **deleted in PR A** and **reintroduced fully in PR B**.

The current placeholder ("// no log entries yet") is a permanent lie because there's no log data model. Two options: (a) leave the empty stub (decorative), (b) delete the tab in PR A and bring it back when there's real data. **(b)** wins — fewer dishonest surfaces. PR B reintroduces the tab with a real backing model.

---

## 3. PR sequence

### PR A — Settings cleanup (~100 LOC, ships first)

1. **S1**: wire `[reveal]` NPSSO toggle on `PlatformDetailDesktop` (PSN path) + `PlatformDetailMobile` (PSN path).
2. **S2**: delete auto-refresh toggle row on both screens; replace with token-health status row reading `Platform.syncStatus`. The error state's `[paste new token]` button opens the existing 64-char input area (already on the same screen).
3. **S3**: rewrite `ScopeTab` (desktop) + the mobile scope panel as read-only info display. Drop the checkbox visual; use icons + labels in a panel.
4. **S4**: delete the Log tab from both screens. `MobileTab` type drops `'log'`. Tabstrip array drops the entry. The `LogTab` component is deleted from `PlatformDetailDesktop` (currently inside the same file).
5. Tests: smoke tests for reveal toggle on desktop + mobile, token-health rendering for ok/error states.
6. Doc updates: `CLAUDE.md` Recent Fixes + Known Gaps adjusted.

### PR B — Platform sync log workstream (~half a day, separate batch)

#### L1 — Schema

```prisma
enum LogLevel {
  info
  warn
  error
}

model PlatformLog {
  id         String    @id @default(cuid())
  platformId String
  userId     String
  level      LogLevel  @default(info)
  event      String    // e.g. "sync.started", "library.imported", "trophies.matched", "token.expired"
  message    String    // human-readable, terminal-style
  details    Json?     // optional structured data for future debugging surfaces
  createdAt  DateTime  @default(now())

  platform Platform @relation(fields: [platformId], references: [id], onDelete: Cascade)

  @@index([platformId, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
}
```

Hand-written migration via the documented `db execute` + `migrate resolve` recipe (pgbouncer pooler can't run `migrate dev`).

#### L2 — Write helpers

A single `logPlatform(platformId, level, event, message, details?)` helper in `apps/api/src/services/platformLog.ts`. Called from every existing sync touchpoint:

- `routes/platforms.ts` POST `/sync` — `sync.started`, `sync.ok`, `sync.error`
- `services/syncRunner.ts` — `library.imported` (totals), `library.skipped` (per-game IGDB miss with title), `library.errored` (per-game crash)
- `services/trophies.ts` (PSN) — `trophies.matched`, `trophies.autoCompleted`, `trophies.missed`
- `services/platforms/steamAchievements.ts` — `achievements.fetched`, `achievements.skipped`, `achievements.autoCompleted`
- `services/wishlistImport.ts` — `wishlist.imported`, `wishlist.alreadyHad`, `wishlist.unresolved`
- Future: `token.expired` when expired-NPSSO detection lands

Writes are fire-and-forget (we don't await them in the sync hot path) but logged synchronously — easier reasoning + tests. Per-event payload stays small (<1 KB).

#### L3 — Read endpoint

`GET /api/platforms/:code/log?cursor=&limit=50` — cursor-paginated (cursor is the last seen `createdAt + id` tuple), descending by `createdAt`. Capped at 50/page. Returns `{ entries: PlatformLogEntry[], nextCursor: string | null }`.

#### L4 — UI

Reintroduce `Log` tab on PlatformDetail desktop + mobile. Render in terminal aesthetic:

```
[2026-05-08 17:55:09] info  · sync started
[2026-05-08 17:55:14] info  · library: 488 imported, 4 skipped
[2026-05-08 17:55:16] info  · trophies: 111 matched, 5 auto-completed, 0 missed
[2026-05-08 17:55:18] info  · wishlist: 12 imported, 0 already had
[2026-05-08 17:55:19] info  · sync ok in 10.2s
[2026-05-09 02:00:01] warn  · token expired — paste a new one
```

Lazy infinite-scroll via cursor pagination. Colorized by level (green info, amber warn, red error). Tests for the read endpoint + render.

---

## 4. Out of scope (deferred)

- **Distinguishing token-expired from PSN-API-down errors.** Both cases want the same user action; not worth the inspection logic until error patterns suggest otherwise.
- **Log retention / pruning.** Postgres handles ~15k rows/user/year easily; revisit if any user crosses 100k entries.
- **Log search / filter UI.** v2 — tail-only feed is enough for v1.
- **Auto-refresh for OAuth platforms** (Steam OpenID, future Google-linked PSN). Steam's session is long-lived and the OAuth flow already handles renewal; nothing to wire here.
- **Per-trophy or per-achievement event lines** in the log. Per-game would explode entry count. Aggregate counts are enough.

---

## 5. Status tracking

| PR | Status | Notes |
|---|---|---|
| PR A — Settings cleanup | Not started | Ships first. ~100 LOC, no schema. |
| PR B — Platform sync log | Not started | Schema + write hooks + read endpoint + UI. ~half a day. Awaits Andrea's go-ahead after PR A lands per hard rule 10. |

---

## 6. Decision history

- **2026-05-08 (audit + scoping):** Andrea asked for a wired-vs-decorative audit. Findings produced (§1 above), four genuinely broken controls identified. Andrea aligned on:
  - Wire `[reveal]` NPSSO (S1).
  - Replace auto-refresh toggle with expiry-status display (S2). Asked specifically: "do we know when the token is expired?" — answered via sync-failure detection without distinguishing root cause.
  - Convert scope checkboxes to read-only info (S3).
  - Build a real platform-log model (PR B → L1–L4) instead of leaving the empty stub. Asked: "what would be the implication on creating a platform sync log model?" — answered with the schema sketch + write/read effort estimates.
- **2026-05-08 (PR split):** PR A (settings cleanup) ships first as a quick win; PR B (sync log) is a separate workstream after PR A lands.
