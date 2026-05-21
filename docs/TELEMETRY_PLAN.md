# Telemetry — TL-series plan

L1 of the user-research observation system. A per-user event log surfaced via a new admin section. Promoted to the next active engineering workstream per D10 in `docs/USER_RESEARCH.md` (2026-05-21): friends-cohort makes scheduled chats feel obligated; telemetry becomes the primary behavioural-gap instrument because it gives us G1 / G3 / G4 / G5 signal with zero user effort.

Source-of-truth context: `docs/USER_RESEARCH.md` §6.2 (L1 spec) + §8 D10 (the no-calendar-chats decision that promoted L1). This doc owns the engineering plan.

Single-PR workstream (TL1) with 4 planned commits + a closing doc commit. Pattern mirrors F1 exactly — same shape, same cadence.

---

## 0. Sources

- `docs/USER_RESEARCH.md` §6.2 (L1 spec — original event list) + §8 D10 (promotion + rationale)
- `apps/api/src/services/platformLog.ts` — the direct pattern to mirror; `logPlatform()` swallows its own errors so a failed log write never fails a sync. TL1's `logEvent()` is the same shape against a different table.
- `apps/api/src/routes/admin.ts` — cursor-pagination + admin-section conventions to reuse for `GET /api/admin/events`.
- `apps/api/src/lib/mappers.ts` — mapper conventions (`mapFeedback` / `mapFeedbackWithUser` precedent from F1.1).
- `docs/FEEDBACK_PLAN.md` — the most recent precedent for this exact workstream shape; F1's structural decisions (cascade-delete, no-push, schema additivity, single-PR with 5 commits) carry over to TL1.
- `apps/web/src/hooks/useAdminFeedback.ts` + `apps/web/src/hooks/useAdminInviteCodes.ts` — SWR hook shape to mirror for `useAdminEvents`.

---

## 1. Locked decisions

Locked 2026-05-21 after Andrea's review of the plan-doc commit. Three required edits applied (TL-D3 daily, `error.surfaced` payload, §4 additions); section ordering taste-call resolved (EVENTS at the bottom). The naming follows the F-D / A-D / I-D pattern.

- **TL-D1 — Cascade-delete with user.** `UserEvent.userId` FK is `onDelete: Cascade`. Reason: same shape as F-D1 — telemetry IS the user's own activity record; if the user is deleted, their event history goes with them. Don't denormalize identity ("`userEmailAtSubmit`-style") to preserve rows past deletion — same GDPR-shaped reasoning as F-D1.
- **TL-D2 — Fire-and-forget writes.** `logEvent()` wraps its body in `try { ... } catch { console.error(...) }` and never re-throws. Reason: telemetry is observational; a logging failure must never fail the user-visible action that triggered it. Mirrors the `logPlatform()` precedent exactly.
- **TL-D3 — `session.opened` throttle: 1 row per user per day.** Server-side dedup via a `findFirst` against the last 24 hours for `event='session.opened'` AND this userId. Skip the write if a recent one exists. Other events have no throttle. Reason: `session.opened` exists to answer G4 (retention) — D1/D7/D30 cohort curves, not intraday engagement patterns. Daily granularity is enough for that signal at 1/24th the row count of hourly. If we later want intraday engagement (e.g. "do users open the app at lunch?"), the granularity decision changes; bring it up in a TL2 if so. Performance note: the `findFirst` is a DB round-trip on every authed request — fine at cohort size (~6 users producing <1k requests/day), but the standard optimization if it ever matters is an in-memory LRU keyed on userId with the same 24h TTL.
- **TL-D4 — `event` is a free-form string, not a Postgres enum.** New event tags can land without a migration. The canonical list lives in §3.4 below + in code comments at each call site. Mirrors PlatformLog precedent (`event: String` not enum).
- **TL-D5 — `details` is `Json?` for structured per-event payload.** `wishlist.toggled` → `{ igdbId, action: 'add'|'remove' }`; `error.surfaced` → `{ route, errorClass, status, message, requestId? }`; `session.opened` → `{ userAgent }`. v1 stores some fields; reserved for future per-event expansion without a schema change. **Call-site discipline (locked 2026-05-21):** every `logEvent()` call must pass a plain object literal as `details`, or omit the argument entirely. No `JSON.stringify`'d strings, no explicit `null`, no arrays. The mapper normalises any non-object JSON to `null` at the API boundary (see comment on `mapUserEvent` in `apps/api/src/lib/mappers.ts`) — that's a safety net, not a license to drift. Worth being consistent across all 8 touchpoints at first land rather than fixing in review.
- **TL-D6 — Admin endpoint: `GET /api/admin/events?userId=&event=&cursor=`.** Cursor-paginated (50/page), `[createdAt desc, id desc]` ordering. Optional `userId` filter to slice per-user; optional `event` filter to slice per-event-class. No date-range filter in v1 — cursor pagination handles "show me everything since this point" implicitly.
- **TL-D7 — Single admin view: new EVENTS section in `/admin` at the bottom, after INVITE CODES.** No dedicated `/admin/events` route. Reason: EVENTS will be the highest-volume section (hundreds of rows per week vs. tens for FEEDBACK / INVITE CODES); putting it last means high-signal-per-row sections (PENDING, FEEDBACK) stay above the fold and EVENTS is the scroll-to-bottom drill-down section. F1.4's FEEDBACK section establishes the integration pattern verbatim; only the insertion point differs.
- **TL-D8 — No client-side event submission in v1.** All `logEvent()` calls happen server-side in existing route handlers. There is no `POST /api/events` endpoint. Reason: keeps the surface area small, prevents client-supplied untrusted events, and the events that genuinely need frontend signal (`library.first_open`, `releases.scope_changed`) are deferred to a follow-up where the design tradeoff gets its own scope. See §4.
- **TL-D9 — Per-touchpoint write hooks, not generic instrumentation.** Each touchpoint explicitly calls `logEvent(userId, event, details)` in its existing route handler. No automatic request-level middleware that auto-instruments routes. Reason: Andrea's pattern preference (explicit > magic); auto-instrumentation gets stale and over-collects.
- **TL-D10 — Events are immutable.** No `PATCH` / `DELETE` / "mark read" semantics. Reason: an event is a fact about what happened; mutating it loses the observation. The admin view sorts and filters but doesn't mark or curate. Departs from F1.4's `read` boolean deliberately — feedback is a triage workflow, telemetry is a fact stream.

---

## 2. Scope

### In scope

- `UserEvent` Prisma model + migration applied via the documented pgbouncer recipe.
- `logEvent(userId, event, details?)` helper at `apps/api/src/services/userEvents.ts`.
- Write hooks at **8 touchpoints** (see §3.4). Each is a single-line call in an existing route handler.
- `GET /api/admin/events` endpoint, cursor-paginated, with optional `userId` + `event` filters.
- New `// EVENTS` section in `/admin` inserted at the bottom (after INVITE CODES) per TL-D7, mirroring F1.4's `FeedbackSection` shape.
- `useAdminEvents` SWR hook matching `useAdminFeedback`'s shape (same cache key pattern `admin:events`, same `loadMore` callback for cursor pagination).
- Vitest + Jest coverage.

### Out of scope (v1)

- **Client-side `POST /api/events` endpoint** — per TL-D8. Defers the events that need frontend dispatch.
- **`library.first_open` + `releases.scope_changed` events** — both need either frontend dispatch or stateful tracking. Deferred to a follow-up where the tradeoffs (whitelisted client endpoint vs. complex server-side state) get their own scope.
- **Real-time stream (SSE / WebSocket)** — admin polls via the standard SWR cache; refresh is on demand.
- **Aggregated analytics views** — no counts, no charts, no funnels in v1. Raw chronological feed only. Andrea reads the rows and synthesizes manually until volume justifies tooling.
- **Per-event filter UI beyond the URL query string** — admin can pass `?userId=` / `?event=` but there's no filter dropdown in v1. Resist the temptation to add one (F1.4's lesson about scope drift on the admin section).
- **Retention policy / archival** — events accumulate forever in v1. Storage cost at cohort size is negligible; revisit if the table hits 100k rows.
- **Export (CSV / JSON)** — deferred, same shape as F-series deferral.
- **Push notification on specific events** (e.g. "tell Andrea when a sync error happens") — deferred.
- **Per-user activity dashboard** — clickable user identity in the admin view that filters to that user's events is the closest equivalent; no separate per-user analytics page in v1.

### Explicitly *not* deferred — must ship in TL1

- **All 8 server-side touchpoints write events.** Partial coverage isn't useful — if `sync.first` ships but `platform.connected` doesn't, the funnel becomes unreadable.
- **Admin EVENTS section.** Without a read surface, telemetry is invisible to Andrea. Section + hook + cursor pagination land together or not at all.

---

## 3. Design / spec

### 3.1 Schema

```prisma
model UserEvent {
  id        String   @id @default(cuid())
  userId    String
  // Free-form event tag — e.g. "session.opened", "platform.connected",
  // "sync.first", "remap.used", "wishlist.toggled", "error.surfaced".
  // Not an enum so new events can land without a migration (TL-D4).
  event     String
  // Optional structured payload for filtering / drill-down. e.g.
  //   wishlist.toggled → { igdbId, action: 'add'|'remove' }
  //   error.surfaced   → { route, errorClass, status }
  //   session.opened   → { userAgent }
  details   Json?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@index([event, createdAt(sort: Desc)])
}
```

Three indexes:
- `createdAt-desc` powers the unfiltered chronological feed (default admin view).
- `userId+createdAt` powers the per-user filter slice.
- `event+createdAt` powers the per-event-class filter slice (e.g. "show me every sync.first across all users").

User model gains a back-relation `events UserEvent[]` (additive).

Migration name: `2026MMDDHHMMSS_user_events`. Hand-write the SQL (CREATE TABLE + 3 CREATE INDEX + ADD CONSTRAINT FK with `ON DELETE CASCADE` + ENABLE ROW LEVEL SECURITY). Apply via the documented `prisma db execute` + `prisma migrate resolve` recipe.

### 3.2 Helper

Location: `apps/api/src/services/userEvents.ts`.

```ts
import { prisma } from '@hoard/db';

// session.opened throttle window. Daily granularity per TL-D3 — the
// signal we want from session.opened is G4 retention (D1/D7/D30 cohort
// curves), not intraday engagement. Daily writes are 1/24th the rows
// of hourly with no loss for the retention use case. Revisit window
// only if we ever start asking intraday questions.
const SESSION_THROTTLE_MS = 24 * 60 * 60 * 1000;

export async function logEvent(
  userId: string,
  event: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    // session.opened throttle: skip if a recent row exists for this user.
    // Other event types always write.
    //
    // Perf note: this findFirst is a DB round-trip on every authed
    // request that hits the session.opened call site. Fine at cohort
    // size (~6 users → ~hundreds of requests/day → ~hundreds of
    // round-trips). The standard optimization when this matters is an
    // in-memory LRU keyed on userId with the same 24h TTL — defer
    // until profile data says it's worth it.
    if (event === 'session.opened') {
      const recent = await prisma.userEvent.findFirst({
        where: {
          userId,
          event: 'session.opened',
          createdAt: { gte: new Date(Date.now() - SESSION_THROTTLE_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    await prisma.userEvent.create({
      data: {
        userId,
        event,
        ...(details !== undefined ? { details: details as Prisma.JsonObject } : {}),
      },
    });
  } catch (err) {
    // TL-D2: telemetry must never break the user-visible path.
    // Log and swallow.
    console.error('[userEvents] logEvent failed:', err);
  }
}
```

### 3.3 Routes

**`GET /api/admin/events`** (auth: `requireUser → requireActive → requireAdmin`, via the existing admin router's `/admin`-scoped middleware after F1.2's prefix fix)

- Query: `?cursor=` (optional) + `?userId=` (optional) + `?event=` (optional)
- Returns 50/page, ordered `[{createdAt: desc}, {id: desc}]` for stable cursor pagination (mirrors F1.2 + PlatformLog pattern).
- Response: `{ items: UserEventWithUser[], nextCursor: string | null }`
- Each item includes joined user identity (id + email + name + steamId for `displayIdentity`).
- No `unreadCount` analogue — events are immutable per TL-D10.

### 3.4 Touchpoints (8 events to instrument in TL1.2)

| Event tag | Where it fires | Details payload |
|---|---|---|
| `session.opened` | `requireUser` middleware after JWT verify (with 1/hour throttle per TL-D3) | `{ userAgent }` |
| `signup.pending` | `POST /api/auth/register` when new user is created with `status: PENDING_INVITE` | `{ provider: 'email' \| 'google' \| 'steam' }` |
| `signup.completed` | `POST /api/auth/redeem-invite` when status flips to ACTIVE | `{ code }` (just the 4-4 suffix, no PII) |
| `platform.connected` | Steam OpenID callback connect-mode + PSN `/connect` + Xbox `/connect` (each route) | `{ code: 'ST' \| 'PS' \| 'XB' \| 'GG' }` |
| `sync.first` | `routes/platforms.ts` sync handler — write only when `Platform.lastSyncAt` was `null` pre-sync (i.e. genuinely the first sync for this user+platform). **Race-prone:** two concurrent syncs could both observe `null` and both write `sync.first`. Not a correctness problem — dedupe in the admin view. If exactly-once matters later, add a unique constraint on `(userId, event)` where `event='sync.first'`; not worth the complexity in v1. | `{ code, gamesImported }` |
| `remap.used` | `POST /api/games/:userGameId/remap` handler | `{ fromIgdbId, toIgdbId, merged: boolean }` |
| `wishlist.toggled` | `POST /api/upcoming/:igdbId/wishlist` handler | `{ igdbId, action: 'add' \| 'remove' }` |
| `error.surfaced` | global error middleware in `apps/api/src/index.ts` — fires when a route handler bubbles an unhandled error to 5xx | `{ route, errorClass, status, message: string, requestId?: string }` — `message` truncated to 200 chars (full stack stays in pino-http logs; row needs to be actionable without grep). `requestId` from `req.id` (pino-http assigns one per request) lets Andrea correlate the row with the structured log if needed. No PII / no full stack in the row itself. |

### 3.5 Frontend — `useAdminEvents`

Location: `apps/web/src/hooks/useAdminEvents.ts`.

Matches `useAdminFeedback` shape exactly (per the F1.4 "no new abstractions invented" rule from Andrea):
- `useQuery` for page 0 with cache key `admin:events`.
- Local state for accumulated extra pages.
- `loadMore` callback that fetches the next cursor and appends.
- Returns `{ items, nextCursor, loading, error, refetch, loadMore }`.

Cache invalidation: TL1 doesn't invalidate `admin:events` from any mutation (events are immutable). The hook re-fetches on mount + on manual refetch only.

### 3.6 Frontend — EVENTS section in `/admin`

Location: inline in `apps/web/src/components/screens/AdminScreen.tsx`, appended at the bottom after INVITE CODES per TL-D7. Final section order post-TL1: PENDING ACCESS REQUESTS → FEEDBACK → ALL USERS → INVITE CODES → **EVENTS**.

Section header: `// events (N)` — no chip (no read-state per TL-D10).

Row layout (CSS grid, `'80px 1fr 120px 100px'`):
1. **when** — `relativeTime(createdAt)`
2. **identity** — `displayIdentity(user)` (same helper as FEEDBACK + ALL USERS sections)
3. **event** — the `event` string, mono-styled
4. **details preview** — short text like `+ wishlist · igdb 12345` or `error · /api/sync · TimeoutError`. Empty for events without meaningful details (e.g. `session.opened` just shows `—`).

Click on row toggles an expanded `<pre>` view of the raw `details` JSON. Same `stopPropagation` pattern would apply if there were action buttons on the row, but per TL-D10 there are none — so no propagation guard needed.

`[load more]` button at the bottom when `nextCursor !== null`, mirroring F1.4 exactly.

### 3.7 Tests

Backend (Jest + Supertest):
- `userEvents.test.ts` — helper happy path; session.opened throttle (recent → skip, old → write); error-swallowing (db throws → no throw + console.error called); details serialisation.
- `admin.events.test.ts` — GET admin-only 404; GET pagination cursor stability; GET filter by `?userId=`; GET filter by `?event=`.
- ~3 touchpoint integration tests (just spot-check that `sync.first`, `wishlist.toggled`, and `error.surfaced` write the right event — full coverage of all 8 touchpoints would balloon the test count, so 3 sampled).
- Target: **~10 new API tests.**

Frontend (Vitest):
- `useAdminEvents.test.ts` — hook returns first page; loadMore appends; refetch resets.
- `AdminScreen.events.test.tsx` — section renders with rows; empty state copy; row click toggles expanded details JSON; pagination [load more] flow.
- Target: **~6 new web tests.**

**Total target: ~16 new tests.** Slightly under F1's 22 because there's no mutation surface and the helper is simpler than F1.3's 5-state machine.

---

## 4. Deferred / follow-ups

Not in TL1; tracked so they don't get lost.

- **`library.first_open` event** — needs either frontend dispatch (`POST /api/events`) or stateful server-side detection ("has this user ever had this event before?"). Deferred to a follow-up where the tradeoff (relax TL-D8 vs. add a `UserEvent` index for self-deduplication) gets its own scope. Until then, "did user X open their library" can be approximated from `session.opened` + `GET /api/games` request logs.
- **`releases.scope_changed` event** — same reason. The cleanest design is a whitelisted `POST /api/events` endpoint accepting a closed set of client-dispatched events (`releases.scope_changed`, `library.first_open`, future `dashboard.opened`, etc.). Deferred to a TL2 scope. **Lighter G3 alternative worth trying first:** server-side log of the `?scope=` query param on `GET /api/upcoming` — same data source, no client trust required, but with the noise tradeoff of writing on every scope-bearing request (vs. only on transitions).
- **Closed-set enum on `event` when a client endpoint lands.** TL-D4's free-form string is fine for server-internal calls where every call site is reviewed; the moment clients can dispatch events, the `event` field must become a Zod-validated closed-set enum at the API boundary to prevent both abuse and accidental telemetry drift. Lock this constraint into TL2's plan before opening `POST /api/events`. The DB column stays `String` — the enum is enforced at the request boundary, not the storage layer.
- **localStorage "N new since last visit" indicator on the EVENTS section header.** Cheap read-side affordance for the "did I miss any `error.surfaced` rows since I last looked?" worry — pure client-side: store the latest-seen event id in localStorage, compute the count of events with `createdAt > lastSeenAt` (or `id > lastSeenId`) on render. No DB write, no row mutation, doesn't violate TL-D10. Defer until inbox patterns show the gap actually bites — for now, the `?event=error.surfaced` URL filter (TL-D6) bookmarked is sufficient.
- **Aggregated analytics views** — counts, charts, funnels. Promote when cohort exceeds ~20 users.
- **CSV / JSON export of events** — mirror of F-series deferral.
- **Real-time event stream (SSE / WebSocket)** — admin polls via SWR refetch in v1. Promote if Andrea finds himself wishing he saw events live.
- **Retention policy / archival** — accumulate forever in v1. Revisit at ~100k rows or 12 months in.
- **Push notification on specific events** — e.g. Slack webhook fires when `error.surfaced` rate exceeds a threshold. Same shape as F-series push-channel deferral.
- **Per-event-class admin filter UI** — clickable chip in the section header to filter by `event=sync.first` etc. The URL query string supports it from day 1 (TL-D6); only the UI affordance is deferred.

---

## 5. PR sequence

Single PR (TL1) with 4 planned commits + closing doc commit. Mirrors F1 structure verbatim.

### TL1.1 — Schema + migration (pure additive)
- Add `UserEvent` model + three indexes + cascade FK to `packages/db/prisma/schema.prisma`; back-relation `events UserEvent[]` on User.
- Hand-write `2026MMDDHHMMSS_user_events/migration.sql` (CREATE TABLE + 3 CREATE INDEX + FK + ENABLE RLS).
- Apply via documented `prisma db execute` + `prisma migrate resolve` recipe (handed off to Andrea, not run by the agent).
- Add `UserEvent`, `UserEventWithUser`, `UserEventListResponse` to `@hoard/types`. Naming convention matches F1.1's late deviation — entity name in `@hoard/types`, `Row`-suffixed types stay internal to `mappers.ts`.
- Add `UserEventRow`, `UserEventRowWithUser`, `mapUserEvent()`, `mapUserEventWithUser()` to `apps/api/src/lib/mappers.ts`.
- Zero behavior change at this commit.
- ~2 mapper tests.

### TL1.2 — Helper + 8 write hooks
- New `apps/api/src/services/userEvents.ts` with `logEvent()` + the session-throttle branch.
- Write hooks at the 8 touchpoints per §3.4 — each is a single line of code in an existing handler.
- ~10 new API tests (4 helper + 3 sampled touchpoint integration + 3 cross-cutting).

### TL1.3 — Backend admin endpoint
- New `GET /api/admin/events` route added to the existing `apps/api/src/routes/admin.ts` (already has the `/admin`-prefix middleware after F1.2's fix).
- Cursor-paginated with `[createdAt desc, id desc]` ordering. Same in-handler code comments as F1.4 ("Secondary sort by id stabilises the cursor…") since the pattern is identical.
- Optional `?userId=` + `?event=` filters via simple Zod validation on the query string.
- Tests folded into TL1.2's `admin.events.test.ts` — no separate test file.

### TL1.4 — Hook + EVENTS section in /admin
- New `apps/web/src/hooks/useAdminEvents.ts`.
- Extend `apps/web/src/lib/api.ts` with `api.admin.listEvents(filters?)`.
- New `EventsSection` + `EventRow` inline in `AdminScreen.tsx`, at the bottom after INVITE CODES per TL-D7.
- Reuse F1.4's `SectionHeader` (no chip — `chip` prop simply omitted).
- ~6 new web tests in `AdminScreen.events.test.tsx`.

### TL1.5 — Doc closeouts
- Mark TL1 done in this plan's phase status table with commit hashes.
- Update `docs/PLAN.md` Phase Status row for TL-series → Done.
- Update `CLAUDE.md` Current Phase + add Recent Fixes entry for the workstream.
- Update `docs/USER_RESEARCH.md` §6.5 R3 row marked Done with reference to this plan.
- AGENT.md unchanged unless an architectural decision lands during TL1.1–TL1.4 (not expected — same shape as F-series; F1 didn't justify an AGENT.md entry, neither should TL1).

---

## 6. Phase status

| Phase | Description | Status | Commit |
|---|---|---|---|
| TL-plan | Plan doc lands (this commit) | Planned | — |
| TL1.1 | Schema + migration + types + mapper | **Done + DB applied 2026-05-21** | — |
| TL1.2 | Helper + 8 write hooks + tests | **Done 2026-05-21** | — |
| TL1.3 | Admin endpoint + tests | **Done 2026-05-21** | — |
| TL1.4 | useAdminEvents hook + EVENTS section + tests | **Done 2026-05-21** | — |
| TL1.5 | Doc closeouts | **Done 2026-05-21** | — |

**TL1.5 close-out notes (2026-05-21):**
- TL-series **complete**. Doc-only commit, no code. Updated: this plan's §6, `docs/USER_RESEARCH.md` §6.5 (R3 → Done), `docs/PLAN.md` Phase Status (new TL-series row), `CLAUDE.md` (Current Phase → no active workstream; TL-series Previous workstream block; 4 new Recent Fixes entries — TL-series complete + 3 operational gotchas cross-references; 2 new Known gaps — auth-chain smoke test + dotenv test-infra workstream candidate).
- **No `AGENT.md` entry per Andrea 2026-05-21.** TL1's decisions constrain TL-series specifically. The two operational issues that surfaced (dotenv-via-transitive-import + Express-4 async-rejection plumbing) are operational/test-infra concerns, not architectural — already landed in CLAUDE.md operational gotchas with full guidance and now cross-referenced in Recent Fixes as one-liners so future-me's scan-the-Recent-Fixes-first workflow surfaces them.
- **Final test posture across TL1.1 → TL1.4:** 27 new tests (3 mapper + 12 helper-and-touchpoint integration + 6 admin endpoint + 6 admin section) against a ~16 target. Overshoot pulled its weight: same-timestamp cursor stability test (TL-D10 belt-and-suspenders), web tests fixed at 6 minimum for the section's contract surface, plus the throttle-only-applies-to-session and details-omitted helper-unit additions.
- **Pre-existing failures noted:** 2 OAuth connect-mode failures in `auth.test.ts` are now formally pinned in CLAUDE.md known-gaps with a "predates F-series and TL-series" note so future workstream close-outs don't keep re-diagnosing them.
- **Production impact:** `UserEvent` table live and accumulating. Every authed request writes a `session.opened` row (daily-throttled per TL-D3 — Andrea's 7 sessions today would have produced 1 row, not 7). The 7 other touchpoints write their events as users hit them going forward. `/admin` EVENTS section shows the feed via cursor pagination. **Channel is operational end-to-end at workstream close.**

Test counts at workstream open: 171 API + 316 web. Target close: ~181 API + ~322 web.

---

## 7. Next action

Plan-doc review complete (2026-05-21). TL-D8 holds (no client endpoint in v1); TL-D10 holds (events immutable); TL-D3 set to daily; `error.surfaced` payload extended with truncated `message` + `requestId`; §4 picked up two new entries (closed-set enum lock when TL2 lands, localStorage unread indicator); EVENTS section appended at the bottom of `/admin` (not between FEEDBACK and ALL USERS).

Next action: **TL1.1 (schema + migration + types + mapper).** Same handoff shape as F1.1 — agent writes the schema + migration SQL + types + mapper + mapper tests; Andrea applies the migration to Supabase via the documented `prisma db execute` + `prisma migrate resolve` recipe.
