# Feedback channel — F-series plan

In-app feedback channel (the L2 layer of the user-research observation system). Replaces the bug-driven "Luigi tells Andrea on chat → Andrea writes a commit" workflow with a durable, on-brand channel that lives entirely inside Hoard.

Source-of-truth context: `docs/USER_RESEARCH.md` §6.2 (L2 spec) + §8 D5–D9 (locked decisions). This doc owns the engineering plan.

Single-PR workstream (F1) with 4 planned commits + a closing doc commit. Pattern mirrors A1.

---

## 0. Sources

- `docs/USER_RESEARCH.md` §6.2 — channel design
- `docs/USER_RESEARCH.md` §8 D5–D9 — locked channel decisions (in-app vs mailto; no push; About placement; slip-fallback; rate limit)
- `apps/api/src/services/platformLog.ts` — cursor-pagination pattern to mirror for `GET /api/admin/feedback`
- `apps/api/src/lib/inviteCodes.ts` + I-series rate-limit pattern — two-tier limiter to reuse
- `apps/web/src/components/screens/AdminScreen.tsx` — section conventions for the new `// FEEDBACK` block
- `apps/web/src/components/modals/ConfirmModal.tsx` — A1's promotion pattern, in case `FeedbackForm` later needs similar treatment

---

## 1. Locked decisions

Channel-level decisions live in `USER_RESEARCH.md` §8 (D5–D9). F-series adds these implementation-level decisions:

- **F-D1 — Cascade-delete with user.** `Feedback.userId` FK is `onDelete: Cascade`. The alternative — preserving feedback rows after user deletion by denormalizing identity at submit time (e.g. `userEmailAtSubmit: String`) — is rejected. Two reasons: **(1) GDPR-shaped alignment.** "User deletes account, their data goes" is the user's reasonable expectation. Preserving feedback under a denormalized PII column survives the deletion the user just performed, and the kind of post-deletion data retention that surprises users erodes trust faster than research-loss does. **(2) Don't quietly retain PII.** A `userEmailAtSubmit` field IS retained PII even if only admin-visible; the system would silently keep email addresses around past the account-delete event. The research-loss tradeoff is real — a few rows of context disappear with each deleted user — but losing rows is a smaller cost than running a system that quietly keeps email addresses. Matches A-series cascade behavior, not the I-series `InviteCode.usedById SetNull` audit-trail pattern.
- **F-D2 — Message is the only required field.** `message` ≥ 1 char, ≤ 16000 chars, validated server-side via Zod. `viewport` and `ua` are optional strings supplied by the client. If `ua` is omitted, the server falls back to `req.headers['user-agent']`. Viewport has no server fallback (can't be inferred); it's null if the client doesn't send it.
- **F-D3 — Rate limit response shape matches I-series.** 429 with `{ error: 'RATE_LIMITED' }`. Reuses the existing `rateLimit` middleware from `apps/api/src/middleware/rateLimit.ts`. Two-tier: per-user 10/h + 20/d, both production-only (skip in dev/CI per the established pattern).
- **F-D4 — Admin section order: PENDING REQUESTS → FEEDBACK → ALL USERS → INVITE CODES.** Reason: PENDING + FEEDBACK are "things that need attention" and belong adjacent; ALL USERS + INVITE CODES are reference data. Feedback rendered between them.
- **F-D5 — Read state is a single boolean, not a workflow.** No `in-progress` / `resolved` / `triaged` states in v1. Reason: cohort is 6; full ticket workflow is over-engineered. **Promotion path when volume justifies:** keep `read: Boolean` unchanged; add `processedAt: DateTime?` as a second column to distinguish "Andrea has seen this" (read=true) from "Andrea has acted on this" (processedAt is set). This is the obvious next step — two-column model gives you triage state without an enum migration, and the v1→v2 change is purely additive (no destructive change to the boolean). If later you need richer states (`status: Enum<TRIAGED | RESOLVED | WONTFIX>`), evolve `processedAt → processedAt + status`. Migration stays additive at every step.
- **F-D6 — No user-side edit/delete after submit.** Once a row is created the user cannot modify or retract it. Reason: keeps API surface minimal, matches the fire-and-forget feel mailto would have had. Admins can hard-delete via Prisma Studio if needed.
- **F-D7 — Plain text only.** Message field is rendered with `whiteSpace: 'pre-wrap'` so line breaks survive, but no markdown, no HTML, no rich text. Reason: terminal aesthetic + zero XSS surface.
- **F-D8 — Component lives in `apps/web/src/components/feedback/`.** New directory. Holds `FeedbackForm.tsx` (user-facing) and, if extracted, `FeedbackRow.tsx` (admin row). Reason: keeps the user-facing component out of `settings/` since per D7 in `USER_RESEARCH.md` it may migrate to a sidebar/global affordance later.
- **F-D9 — Settings section key extension.** `SectionKey` union in `SettingsDesktop` / `SettingsMobile` gains `'about'`. Sidebar/section nav adds the entry between Data Export and Danger Zone per D7 in `USER_RESEARCH.md`.
- **F-D10 — Unread chip on admin section header.** Section header shows `// FEEDBACK · N unread` where N counts `read=false` rows. Zero unread → no chip. Reason: cheap discoverability signal without adding badges to Sidebar nav.

---

## 2. Scope

### In scope
- `Feedback` Prisma model + migration applied via the documented pgbouncer recipe
- `POST /api/feedback` (authed, non-admin, rate-limited)
- `GET /api/admin/feedback` (admin, cursor-paginated, 50/page)
- `PATCH /api/admin/feedback/:id` (admin, toggles read)
- `FeedbackForm` component in Settings → About
- `// FEEDBACK` section in `/admin` with mark-read flow + unread chip
- Two-tier rate limit on `POST /api/feedback` (10/h + 20/d per user)
- Vitest + Jest test coverage for all of the above

### Out of scope (v1)
- Push delivery (webhook / Slack / Discord / email-out) — per D6 in `USER_RESEARCH.md`
- User-side edit / delete / retract of submitted feedback — per F-D6
- Markdown / rich text — per F-D7
- File attachments / screenshot upload
- Workflow states (triaged / resolved / etc.) — per F-D5
- Per-feedback reply / response thread
- Sidebar global affordance (`// feedback` entry) — deferred per D7 in `USER_RESEARCH.md`
- Mobile tab-bar global affordance
- Email digest / weekly summary of unread feedback
- Feedback search / filter / sort beyond "newest first"

### Explicitly *not* deferred — must ship in F1
- The slip-fallback rule (D8 in `USER_RESEARCH.md`): if F1 slips, R2 (PSN mobile fix) jumps ahead. F1 is *not* allowed to grow scope at the cost of R2's onboarding-block fix.

---

## 3. Design / spec

### 3.1 Schema

```prisma
model Feedback {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  message   String
  viewport  String?
  ua        String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([read, createdAt(sort: Desc)])
}
```

Two indexes: the first powers the admin list (chronological); the second powers the unread chip (`WHERE read=false ORDER BY createdAt DESC`).

Migration name: `20260514xxxxxx_feedback`. Hand-write the SQL (CREATE TABLE + CREATE INDEX × 2 + ADD CONSTRAINT FK with `ON DELETE CASCADE`). Apply via the documented `prisma db execute` + `prisma migrate resolve` recipe.

### 3.2 Backend routes

All three routes live in a new `apps/api/src/routes/feedback.ts` for the user-facing POST, mounted at `/api/feedback`. The two admin routes live in the existing `apps/api/src/routes/admin.ts` next to invite-code admin endpoints, mounted at `/api/admin/feedback`.

**`POST /api/feedback`** (auth: `requireUser → requireActive`)
- Body: `{ message: string (1..16000), viewport?: string, ua?: string }` — Zod-validated
- Rate-limited via two-tier limiter (10/h + 20/d, prod only)
- Creates `Feedback` row with `userId = req.user.id`, `read = false`, server `createdAt`
- `ua` fallback: `req.headers['user-agent']`
- Returns 201 + `{ id }`
- Error shapes: 400 (validation), 429 `RATE_LIMITED`

**`GET /api/admin/feedback`** (auth: `requireUser → requireActive → requireAdmin`)
- Query: `?cursor=` (optional) only — no server-side `unreadOnly` filter in v1 per Andrea 2026-05-13. Decision rationale: no real use case at cohort size, the unread chip already surfaces the count, and paginating + filtering on a mutable field (`read`) opens a skip-rows edge case not worth defending against for a feature with no demand. Index `[read, createdAt(sort: Desc)]` stays — it's already paid for and is what we'd want if `unreadOnly` ever comes back. See §4 deferred.
- Returns 50/page, ordered `[{createdAt: desc}, {id: desc}]` for stable cursor pagination
- Response shape: `{ items: FeedbackWithUser[], nextCursor: string | null, unreadCount: number }`
- Each item includes the joined user identity (email + name + steamId for the `displayIdentity` helper)
- `unreadCount` is always the total unread (not just on this page) so the chip stays correct as the user paginates

**`PATCH /api/admin/feedback/:id`** (auth: `requireUser → requireActive → requireAdmin`)
- Body: `{ read: boolean }` — Zod-validated
- Updates the row; returns 200 + the updated `FeedbackWithUser`
- 404 if row not found

#### Code comments to land in F1.2

Two route-handler comments. Both flag deliberate-but-looks-redundant decisions that a future optimizer (likely future-me) could revert without understanding the tradeoff. Worth pinning in code so the next read doesn't trigger a "this seems wasteful, let me fix it" reflex.

**In `GET /api/admin/feedback`, on the `unreadCount` computation:**

```ts
// unreadCount is total-across-all-pages, not page-scoped.
// Cheap at cohort size; lets the admin chip stay accurate
// while paginating. Don't fold it into the page query under
// perf pressure — the chip would silently drift.
```

**In `GET /api/admin/feedback`, on the cursor ordering `[{ createdAt: desc }, { id: desc }]`:**

```ts
// Secondary sort by id stabilises the cursor when multiple
// rows share the same createdAt (same-millisecond writes).
// Matches the platformLog precedent — don't drop it thinking
// it's redundant; the cursor would skip rows on boundaries.
```

The UA-fallback (`req.headers['user-agent']` when client omits it) does not need a comment — conventional enough to read self-explanatory at the route handler.

### 3.3 Frontend — FeedbackForm

Location: `apps/web/src/components/feedback/FeedbackForm.tsx`

States (single `state` discriminated union):
- `{ kind: 'idle' }` — renders `[report something weird]` button
- `{ kind: 'expanded', message: string }` — renders textarea (autofocused) + `[send]` button (disabled while message is empty after trim) + `[cancel]` text link
- `{ kind: 'sending' }` — renders disabled `[sending…]` button + locked textarea
- `{ kind: 'sent' }` — renders green `// thanks — your note is logged` for 3000ms then collapses to `idle`
- `{ kind: 'error', message: string, error: string }` — renders red error line + `[try again]` link (returns to `expanded` with message preserved)

Captures at send-time:
- `viewport: \`${window.innerWidth}×${window.innerHeight}\``
- `ua: navigator.userAgent`

Submits via new `api.feedback.submit({ message, viewport, ua })` client method. On success: invalidate `admin:feedback` (admin won't see the new row until they refresh otherwise).

Placeholder copy: `// what happened? mention the page if relevant.`

### 3.4 Frontend — Admin section

Location: inline in `apps/web/src/components/screens/AdminScreen.tsx`, sandwiched between PENDING REQUESTS and ALL USERS per F-D4.

Section header: `// FEEDBACK` + conditional `· N unread` chip if `unreadCount > 0`.

Row layout (CSS grid, `'80px 1fr 180px 110px'`):
1. **when** — `relativeTime(createdAt)` ("2h ago" / "yesterday" / etc.)
2. **identity** — `<span class="status-sigil">` (green if unread, hidden otherwise) + `displayIdentity(user)`. Status anchors to the identity text rather than floating in its own column; matches the existing `.status-sigil` utility pattern from the design system.
3. **viewport** — `viewport` or `—`
4. **actions** — `[mark read]` / `[mark unread]` toggle button

Click anywhere on the row (except action button — `stopPropagation()`) toggles a per-row expanded state showing the full `message` rendered with `whiteSpace: 'pre-wrap'`. Read rows render at `opacity: 0.6`.

New `useAdminFeedback` SWR hook in `apps/web/src/hooks/useAdminFeedback.ts` matching the `useAdminInviteCodes` / `useAdminUsers` shape.

`[load more]` button at the bottom if `nextCursor` is non-null.

### 3.5 Tests

Backend (Jest + Supertest):
- `feedback.test.ts` — POST happy path; POST validation (empty, >16000); POST rate-limit-prod-only; POST captures `userId` from auth not body; UA fallback when client omits it
- `admin.feedback.test.ts` — GET admin-only 404; GET pagination cursor stability; PATCH happy path; PATCH 404; PATCH admin-only
- Target: ~9 new API tests (was ~10 — dropped the `unreadCount`-independence variant that depended on the removed `unreadOnly` query param)

Frontend (Vitest):
- `FeedbackForm.test.tsx` — state transitions (idle → expanded → sending → sent → idle); empty message disables `[send]`; cancel returns to idle with no submit; error state shows retry
- `AdminScreen-feedback.test.tsx` — section renders with chip when unread > 0; mark-read flow; cascade invalidation on PATCH; empty state copy; pagination
- Target: ~12 new web tests

Total target: ~22 new tests. Running totals after F1 land: ~172 API + ~316 web.

---

## 4. Deferred / follow-ups

These are explicitly *not* in F1 but tracked here so they don't get lost:

- **Push notification channel (webhook / Slack / Discord / email)** — promote when feedback cadence justifies it. One route-handler-level addition; no schema change.
- **Sidebar global `// feedback` entry** — Andrea may want to promote the form out of Settings if cohort growth makes Settings-only too low-discoverability.
- **Mobile tab-bar feedback access** — same question.
- **Workflow states beyond `read` boolean** — `triaged` / `resolved` / `wontfix`. Promote to enum if volume justifies a real triage workflow.
- **User-side edit/delete** — currently F-D6 forbids. If users ask for it (likely after first round of L3 chats), revisit.
- **Reply / response thread** — let admin reply to feedback inline, send the reply back to the user. Adds a `FeedbackReply` model and an `/api/feedback/:id/replies` route. Significant scope; defer until volume + content justify it.
- **Email digest** — weekly summary of unread feedback for Andrea. Build only if `/admin` discoverability proves insufficient.
- **Linking feedback to USER_RESEARCH.md observations** — promote rich-signal feedback into new `O*` observations in §2. Manual process for now; consider an admin `[promote to USER_RESEARCH]` button later.
- **CSV / JSON export of feedback rows** — admin-side bulk export for archival, offline analysis, or feeding into a later research-synthesis pass. Out of v1 scope; promote when the feedback corpus is large enough to warrant offline tooling.
- **Server-side `unreadOnly` filter on `GET /api/admin/feedback`** — client-side filter is sufficient at cohort size; reintroduce when row count justifies it. The `[read, createdAt(sort: Desc)]` index already exists, so the v2 reintroduction is route-handler-only.
- **Cursor-aware optimistic reconciliation on mark-read** — at cohort size, pagination reset on cache invalidate is invisible; revisit when unread volume regularly exceeds 50/page. F1.4 ships with the simple version: `markFeedbackRead` invalidates `admin:feedback`, the hook re-fetches page 1, and any extra pages loaded via `[load more]` are dropped. A v2 implementation would either (a) skip the invalidation on read-state mutations and patch the row locally, or (b) re-walk the loaded cursor chain after invalidation. Either is more machinery than warranted at N=6 beta users.

---

## 5. PR sequence

Single PR (F1) with 4 planned commits + closing doc commit. Mirrors A1's structure.

### F1.1 — Schema + migration (pure additive)
- Add `Feedback` model + two indexes + cascade FK to `packages/db/prisma/schema.prisma`; back-relation `feedback Feedback[]` on `User`
- Hand-write `20260513120000_feedback/migration.sql` (CREATE TABLE + CREATE INDEX × 2 + FK + ENABLE ROW LEVEL SECURITY — RLS match for new public tables per `20260520120000_enable_rls_on_platform_log` precedent)
- Apply via documented `prisma db execute` + `prisma migrate resolve` recipe (handed off to Andrea, not run by the agent)
- Add `Feedback`, `FeedbackWithUser`, `FeedbackListResponse`, `PostFeedbackBody`, `PatchFeedbackBody` to `@hoard/types`. **Naming note:** plan originally said `FeedbackRow` in `@hoard/types`; shipped as `Feedback` to match the existing entity-name convention (`Platform`, `PlatformLogEntry`). `Row`-suffixed types stay internal to `mappers.ts` per existing convention.
- Add `FeedbackRow`, `FeedbackRowWithUser`, `mapFeedback()`, `mapFeedbackWithUser()` to `apps/api/src/lib/mappers.ts`
- Zero behavior change at this commit (no routes consume the new model yet)
- 4 mapper tests (basic shape, null viewport/ua handling, displayIdentity email path, displayIdentity Steam-name fallback)

### F1.2 — Backend routes
- New `apps/api/src/routes/feedback.ts` mounting `POST /api/feedback`
- Extend `apps/api/src/routes/admin.ts` with `GET /api/admin/feedback` + `PATCH /api/admin/feedback/:id`
- Zod schemas for POST body + PATCH body
- Two-tier rate limit via existing `rateLimit` middleware (10/h + 20/d, prod-only)
- ~10 new tests across `feedback.test.ts` + `admin.feedback.test.ts`

### F1.3 — FeedbackForm + Settings integration
- New `apps/web/src/components/feedback/FeedbackForm.tsx` with full state machine
- `api.feedback.submit()` client method in `apps/web/src/lib/api.ts` with `cache.invalidate('admin:feedback')` on success
- `SectionKey` union extended with `'about'` on both `SettingsDesktop` + `SettingsMobile`
- About section rendered between Data Export and Danger Zone, hosts `<FeedbackForm />`
- Sidebar / section nav entry added
- ~6 new web tests

### F1.4 — Admin feedback section + unread chip
- New `apps/web/src/hooks/useAdminFeedback.ts` SWR hook
- New `// FEEDBACK` section in `AdminScreen.tsx` inserted between PENDING REQUESTS and ALL USERS per F-D4
- `FeedbackRow` component inline in AdminScreen.tsx (extract to `apps/web/src/components/feedback/FeedbackRow.tsx` if it grows past ~80 lines)
- `[mark read]` / `[mark unread]` toggle wired to PATCH endpoint
- `[load more]` cursor pagination
- Unread count chip on section header
- ~6 new web tests

### F1.5 — Doc closeouts
- Mark F1 done in this plan's phase status table with commit hashes
- Update `docs/PLAN.md` Phase Status row for F-series → Done
- Update `CLAUDE.md` Current Phase + add Recent Fixes entry for the workstream
- Update `docs/USER_RESEARCH.md` §6.5 R1 row marked Done with commit reference
- AGENT.md unchanged unless an architectural decision lands during F1.1–F1.4 (not expected)

Eyeball polish (live-page review on prod after F1.5 lands) handled as additional unplanned commits per the A1 pattern — recorded in §6 phase status with their own hashes.

---

## 6. Phase status

| Phase | Description | Status | Commit |
|---|---|---|---|
| F-plan | Plan doc lands (this commit) | Planned | — |
| F1.1 | Schema + migration + types + mapper | **Done + DB applied 2026-05-13** | — |
| F1.2 | Backend routes (POST + GET + PATCH) + rate limit + tests | **Done 2026-05-13** | — |
| F1.3 | FeedbackForm + Settings About section + api client + tests | **Done 2026-05-13** | — |
| F1.4 | Admin section + unread chip + useAdminFeedback hook + tests | **Done 2026-05-13** | — |
| F1.5 | Doc closeouts | **Done 2026-05-13** | — |

Test counts at workstream open: 162 API + 304 web. Target close: ~172 API + ~316 web.

**F1.1 close-out notes (2026-05-13):**
- All code shipped: schema.prisma + migration SQL + @hoard/types entries + mappers + 4 mapper tests passing.
- **Migration applied to Supabase production** via the documented `prisma db execute` + `prisma migrate resolve` recipe. Pooler host `aws-0-eu-west-1.pooler.supabase.com:6543`; `Script executed successfully` + `Migration 20260513120000_feedback marked as applied`. Table is empty (no routes consume it yet).
- 2 pre-existing failures in `apps/api/src/routes/auth.test.ts` (OAuth connect-mode redirects at lines 391 + 417, redirecting to `/login?error=steam_failed`/`google_failed` instead of `/settings/*`). Independently reproducible by stashing F1.1 changes; surfaced now only because F1.1 added the workstream's first full-suite run since the I-series. Filed as out-of-scope for F1.1.

**F1.5 close-out notes (2026-05-13):**
- F-series **complete**. Doc-only commit, no code. Updated: this plan's §4 + §6, `docs/USER_RESEARCH.md` §6.5 (R1 → Done), `docs/PLAN.md` Phase Status (new F-series row), `CLAUDE.md` (Current Phase → no active workstream; Recent Fixes entry summarizing the workstream).
- **No `AGENT.md` entry per Andrea 2026-05-13.** Feedback is a new domain object but slots cleanly into existing patterns (PlatformLog cursor pagination, rate-limit middleware, SWR hook conventions). The F-D1 cascade decision is the closest call to an architectural moment but it's already captured in the F-series plan rationale where it belongs. `AGENT.md` is for decisions that constrain future work; F1's decisions constrain F-series specifically.
- **Final test posture across F1.1 → F1.4:** 22 new tests (4 mapper + 4 POST + 5 admin endpoints + 6 FeedbackForm + 6 admin section) against a ~22 target. Every scope-edge guard ("if you hit 9, something grew") respected.
- **Bonus finding shipped during F1.2:** latent router-middleware-without-prefix bug in `admin.ts` caught and fixed in scope, with the pattern note now living in `CLAUDE.md` Recent Fixes so future-me doesn't reintroduce the class.
- **Production impact:** `Feedback` table live on Supabase; `POST /api/feedback` accepts user submissions; `/admin` renders the FEEDBACK section with the unread chip + mark-read flow + [load more] pagination. Channel is operational end-to-end at workstream close.

**F1.4 close-out notes (2026-05-13):**
- New `useAdminFeedback` hook in `apps/web/src/hooks/`. Matches `useAdminInviteCodes` shape (same SWR conventions via `useQuery`, same `admin:feedback` cache key) with a `loadMore` callback for the cursor-paginated endpoint. No `useAdminList<T>` abstraction invented — three call sites is below the threshold per Andrea.
- `apps/web/src/lib/api.ts` extended with `api.admin.listFeedback` + `api.admin.markFeedbackRead`. The mark-read method invalidates **only** `admin:feedback` (narrower than the I-series `admin:` prefix; row state change can't orphan a code or change the user roster).
- `AdminScreen.tsx` extended with a `FeedbackSection` + `FeedbackRow` inserted between PENDING ACCESS REQUESTS and ALL USERS per F-D4. 4-column grid `'80px 1fr 180px 110px'` (when / identity-with-sigil / viewport / actions) — **not** the prior 5-column shape (dot collapsed into identity per §3.4 revision). `SectionHeader` extended with an optional `chip` prop for the `· N unread` indicator.
- Row click toggles an expanded message view; `[mark read]/[mark unread]` button uses `e.stopPropagation()` (and a matching keyDown guard) so clicking the action never doubles as a row-expansion toggle. Andrea's F1.4 reminder caught a specific class of bug that would have been a confusing UX.
- 6 web tests in `AdminScreen.feedback.test.tsx`: with-chip / without-chip / mark-read API call / stopPropagation guard / empty state / pagination. All green.
- `AdminScreen.test.tsx` api-mock extended with `listFeedback` + `markFeedbackRead` (default empty list) so the existing 39 I-series tests stay isolated from feedback-specific behaviour. 39/39 still green.
- Total component test posture after F1.4: 51 web tests across the 3 files (39 AdminScreen + 6 AdminScreen.feedback + 6 FeedbackForm), all passing. Typecheck clean.
- Known v1 wart documented in the hook: cache invalidation (fired by `markFeedbackRead`) resets the accumulated extra-pages to empty. At cohort size we'll rarely cross page 1; if/when feedback volume grows, the alternative (cursor-aware optimistic reconciliation) becomes worth the complexity.

**F1.3 close-out notes (2026-05-13):**
- New `apps/web/src/components/feedback/FeedbackForm.tsx` — 5-state machine exactly per §3.3 + Andrea's scope edges (no `confirming` state, no dirty-warning-on-blur, cancel discards draft). The 3000ms `sent → idle` timer is wrapped in a `useEffect` with a `clearTimeout` cleanup, covering both unmount and state-change-away-from-`sent`.
- `api.feedback.submit()` added to `apps/web/src/lib/api.ts`. Invalidates **only** `admin:feedback` per Andrea — narrower than the I-series `admin:` prefix because a new feedback row can't orphan an InviteCode or change the user roster.
- `SettingsNav` extended with `About` entry between `Data export` and `Danger zone` (icon: `info`); `SettingsDesktop` gets a new `AboutSection` rendering the FeedbackForm; `SettingsMobile` gets a matching mobile section in the `if (section === 'about')` branch using the existing `backHeader` helper for the chrome.
- 6 web tests covering all 5 states (idle render, idle→expanded autofocus, cancel-discards-draft, send-disabled-when-empty, happy-path with 3000ms timer, error-path with `[try again]` preserving message). All 6 green.
- Targeted regression on adjacent files (WelcomeScreen 24, AdminScreen 39, RemapGameModal 5, ConfirmModal/layout/RequireActive) — exit code 0; no regressions.
- Full-suite vitest hang reproduced (pre-existing infra issue logged in CLAUDE.md operational gotchas — targeted single-file runs work fine).

**F1.2 close-out notes (2026-05-13):**
- New `apps/api/src/routes/feedback.ts` with `POST /api/feedback` + two-tier per-user rate limit (10/h + 20/d, prod-only via `skipInDev`). Stacks `requireUser → requireActive → feedbackHourlyLimiter → feedbackDailyLimiter` so pending users hit 403 before their budget burns.
- `apps/api/src/routes/admin.ts` extended with `GET /api/admin/feedback` (cursor-paginated, 50/page, `[createdAt desc, id desc]` ordering for cursor stability) + `PATCH /api/admin/feedback/:id` (toggles `read`). Both code comments specified in §3.2 landed in the route handler verbatim.
- 9 new API tests across 2 files: `feedback.test.ts` (4) + `admin.feedback.test.ts` (5). All green. Total API tests post-F1.2: 298 passing + 2 pre-existing OAuth failures = 300 collected.
- **Real bug surfaced and fixed during F1.2:** `admin.ts` had `router.use(requireUser, requireActive, requireAdmin)` (no path prefix), meaning the admin gating ran on EVERY request that fell through to `adminRouter`, including non-admin routes like POST /api/feedback. Fix: scope the gating to `/admin` paths only — `router.use('/admin', requireUser, requireActive, requireAdmin)`. Existing admin gating tests still green; the fix is a strict subset of the prior behaviour (no admin route loses its gate).

---

## 7. Next action

Wait for Andrea's go-ahead on the plan, then start with F1.1 (schema + migration). F1 is single-PR — commits land sequentially, the PR opens with F1.1, gets pushed up through F1.4, F1.5 lands the doc closeouts, then a single PR review.

Per the slip-fallback rule (D8 in `USER_RESEARCH.md`): if F1 hits an unexpected snag at any commit boundary, pause F1 and execute R2 (PSN mobile guided-flow fix, ~5-line SearchModalProvider lift) first. R2 is independently shippable and closes an active onboarding block.
