# Hoard — Admin Polish (A-series)

> **Workstream:** tighten the `/admin` page after a few sessions of real closed-beta operation. Row density, account deletion with cascade, FK behaviour for orphan codes, sort + filter + search on the user list, and a layout pass beyond the `f45c6db` polish.
>
> **Status:** Plan locked 2026-05-10 (A-D1 … A-D12 inline below). Awaiting Andrea's green-light to start commit 1. Track 1 (single-track admin polish), separate from the E-series E2E restoration work happening in parallel.
>
> **Source materials in the conversation that fed this draft:**
> - `docs/INVITE_CODES_PLAN.md` (closed-beta context — I-D8 explicitly says demoting an active user back to pending is out of scope; *deletion* of either pending or active users is a stronger but cleanly-different ask).
> - `AGENT.md` decisions #34 (closed-beta in DB columns), #35 (sidebar affordance vs. security boundary), #36 (atomic redemption via `$transaction` with predicate), #37 (two-tier rate limit), #38 (URL-channel deep-link preservation) — admin polish doesn't change any of these; the new endpoint just plugs into the same auth chain.
> - `f45c6db` — the most recent polish commit (button labels use compact `noteLabel` + drop maxWidth cap). This plan is the next layer of polish on top of that.
>
> **Naming:** A1 is the first PR in this workstream. A2, A3 etc. follow if other admin scope surfaces.
>
> **Premise corrections worth keeping for future readers** — the original framing of this workstream included "the FK on `InviteCode.usedById` would block user deletion." Verifying against the actual SQL (`migration.sql` line 60) found `ON DELETE SET NULL` already in force; the Prisma schema relied on the implicit default for optional relations. Option C is already the SQL-layer behaviour. A-D3 below makes it *explicit* in the schema for futureproofing; no migration needed. Cascade chain on `User.delete()` already handles `Platform` / `UserGame` / `WishlistRelease` / `PlatformLog` (via Platform) cleanly — no transaction wrapper needed.

---

## 1. Locked decisions

These are closed and apply across A1. Don't re-open without explicit sign-off.

**A-D1 — Account deletion is hard-delete with FK cascade. No soft-delete window.**
`DELETE /api/admin/users/:id` calls `prisma.user.delete({ where: { id } })`. The existing FK cascade on `Platform.userId` / `UserGame.userId` / `WishlistRelease.userId` (all `onDelete: Cascade`) plus `PlatformLog.platformId` (cascade-chained via the deleted Platform rows) handles every owned table. `InviteCode.usedById` is the lone non-cascading FK and resolves via A-D3. No transaction wrapper needed — the single `delete()` is atomic at the DB layer.

**A-D2 — Self-deletion is rejected at *both* layers (defense in depth).**
Frontend: the `[delete]` button doesn't render on the admin's own row (`user.id === currentUser.id`). Backend: the route checks `req.user.id !== params.id` and returns **400** `{ error: 'CANNOT_DELETE_SELF' }` if violated. Belt-and-suspenders mirrors the I-D15 / decision #35 pattern (sidebar affordance hides the surface, server middleware closes the URL-typing path).

**A-D3 — `InviteCode.usedById` FK uses `ON DELETE SET NULL` on the schema, no migration needed.**
The migration that originally created the FK (`20260508140000_invite_codes` line 60) **already** uses `ON DELETE SET NULL`. The Prisma schema relies on the default for optional relations (which is `SetNull` since Prisma 5+) and so produces the same SQL — but the schema declaration is *implicit*, which is brittle: if a future Prisma version changes the default, `prisma migrate diff` would generate a behaviour-flipping migration. Fix: make `onDelete: SetNull` **explicit** in the schema. Verification: `prisma migrate diff --from-schema-datamodel ... --to-url $DATABASE_URL --script` must produce zero SQL diff against the live DB — the change is doc-only at the SQL layer. **No new migration; just the schema annotation.** Result of a hard-delete on a user who redeemed a code: the `InviteCode` row stays with `usedAt` populated and `usedById = NULL` — admin UI renders "used by ? · {date}" (existing fallback in the codes section). The audit trail survives without a dangling FK.

**A-D4 — Sort + filter + search are client-side at v1 scale, server-side later if needed.**
The `/api/admin/users` endpoint already returns the full list (currently 3 users; closed beta will plateau at ~20). Adding query params + DB-level sort/filter would inflate the surface area without payoff at this scale. **Do all three transforms in `AdminScreen` against the cached `useAdminUsers()` data.** The existing server-side sort (pending-with-request first, then createdAt desc) becomes the *default* sort; client-side overrides it per the URL state. Re-evaluate when user count crosses ~200 or when a single payload exceeds ~200 KB — neither close in v1.

**A-D5 — URL state for sort + filter + search; defaults omitted (matches Library).**
`?sort=joined|status|platforms&filter=all|active|pending|admin&q=<text>` on `/admin`. Defaults (`sort=joined&filter=all` and empty `q`) are not written to the URL — clean shareable links, same convention as Library's `?sort=`/`?view=` (Phase 8 PR 5). Default sort is **joined date desc** (newest first — most useful at admin-scale). Search input + filter chips read from URL on mount, write back on change.

**A-D6 — Typed-confirmation token is `user.displayIdentity`.**
Single source of truth for the row label and the deletion-confirm token. For real-email users the typing cost is identical to "type the email" (typically 18-25 chars); the synthetic-Steam case (`Steam user — 76561198…`) becomes genuinely friction-bearing because the token is un-pasteable in normal workflow. The existing `ConfirmModal` already takes `confirmKeyword: string` as a prop — passing `user.displayIdentity` plugs in cleanly. Modal copy: `// type marco.rossi@gmail.com to confirm` (interpolated subject), matching the existing `HOARD` / `WIPE` typed-confirm aesthetic.

**A-D7 — Promote `ConfirmModal` to `apps/web/src/components/modals/ConfirmModal.tsx`.**
The existing inline-in-`SettingsDesktop.tsx` component already abstracts variants via a `variant: 'delete-account' | 'wipe-library'` prop. Adding `'delete-user'` and a shared file location is the cleanup pass we'd take eventually anyway; doing it now (when we have a third call site) is the cheapest moment. Inline-duplication in `AdminScreen` would be a drift target — the next time the modal needs an a11y or copy fix, two places to edit. Tests already cover the existing variants; the move is mechanical.

**A-D8 — No debounce on the search input at v1 scale.**
At closed-beta scale (3-20 users), filtering is sub-millisecond JS array work. Debounce exists to avoid thrashing a server or expensive computation — neither applies. Filter on every keystroke; instant feedback. Forward-pointer: when user count grows enough to move to server-side search (v2), the migration is "add 250ms in the same place" — not a redesign.

**A-D9 — Filter chip "active" is strict — admins are their own bucket.**
`[ all ] [ active ] [ pending ] [ admin ]` partition the user list cleanly: `active` means `status === 'ACTIVE' && !isAdmin`. The four buckets sum to the total — easy mental model, no sub-filter ambiguity. Andrea (the lone admin today) appears under `admin` only, not under both `active` and `admin`. Counts inline next to each chip: `[ active (5) ] [ pending (2) ]`.

**A-D10 — User-row layout is 4-col with merged identity (Bedkarma · email).**
Grid template `1fr 70px 80px 110px 56px` (identity / status / joined / platforms+games / actions). Identity cell renders `<name> · <email>` when both present, else whichever is set, else `displayIdentity` fallback (covers Steam-only). Tooltip via `title=` on the cell carries the full email when truncated. Header row above the data: `// IDENTITY · STATUS · JOINED · PLATFORMS · ACTIONS` (terminal aesthetic, 10px t-faint, mono — not a real `<th>`; preserves the grid pattern). Row height drops from ~36 px to ~28 px (3-4 visible rows above the fold gain). Dashed-bottom-border preserved.

**A-D11 — Pre-deletion modal copy is rich; payload extended with both counts; row gains a games count.**
Risk vector with admin-deletes-others is operator error, not malice — surfacing concrete state at decision points is the cheapest defense. Three coupled changes:

1. **Payload extension.** `GET /api/admin/users` payload gains `gamesCount` and `wishlistCount` (cheap `_count: { userGames: true, wishlists: true }` on the existing `findMany`). Both reach the frontend even though only one currently surfaces in modal copy — keeps the option open for future UX without a payload change.

2. **Modal copy.** "deletes <displayIdentity> · X games · Y platforms · keeps the invite code as orphan · cannot be undone." **Wishlists deliberately omitted** — games + platforms are the signal for "active user worth not deleting"; wishlists are quieter and add noise.

3. **Row scan extension.** The existing PLATFORMS column in `UserRow` extends to read `2 platforms · 488 games` (or similar — pick whichever reads cleanest in actual layout). Counts visible during scan, not just after click. **Treat as UX call during commit 4 implementation** — if the PLATFORMS column gets too crowded at narrow widths, fall back to "2 platforms" + count-only-in-modal. Don't redesign; adjust in place.

**A-D12 — Active sessions are invalidated naturally via the `requireUser` DB lookup; no separate cleanup step.**
Hoard's auth model is JWT-cookie-only — no `Session` table, no server-held session state. When a user's row is deleted, every subsequent request from a still-valid JWT (up to 7 days remaining) hits `requireUser` → `prisma.user.findUnique({ where: { id: req.userId } })` → returns `null` → middleware returns 401 → frontend `RequireAuth` redirects to `/login`. The deleted user can't re-auth (their User row is gone) and the cookie naturally expires. **No code in the delete path needs to touch JWT / cookies / sessions.** This is correct behaviour by construction — recording it explicitly so future readers don't wonder if session handling was missed.

**Sanity-check task** (lands as part of commit 2 implementation, NOT as silent assumption): grep `req.user` consumers across `apps/api/src/routes/*` and `apps/api/src/middleware/*`. Confirm every consumer reads `req.user` only after a middleware in the chain has done a DB lookup (today: `requireUser` populates `req.userId`; `requireActive` populates `req.user` after `prisma.user.findUnique`). If any route reads `req.user.*` from JWT decode WITHOUT a DB-lookup gate, the natural-401 property breaks for that route — a deleted user could keep using it for up to 7 days. **If found, flag in the commit message — do NOT fix in A1 scope** (it would be a separate auth-correctness PR). The expected outcome: nothing found; the property holds; A-D12 is now documented and verified.

---

## 2. PR sequence

A1 is a single PR. Per CLAUDE.md hard rule 10, agent stops after the PR lands, summarizes, holds for Andrea's go-ahead before any A2+ scope opens. Within A1, commits land sequentially on the feature branch — no per-commit Andrea touchpoint required (no out-of-band ops; nothing like the E1 test-DB provisioning need).

### A1 — Admin polish (single PR, 5 commits)

Commit grouping is load-bearing for review-time clarity. Each commit's tests must pass against the staged state of the prior. Order: schema → endpoint + payload (with sanity check) → ConfirmModal promotion → admin UI density + sort/filter/search + delete wiring → tests + doc closeouts.

**Pre-flight (no commit):**
- `prisma migrate diff --from-schema-datamodel packages/db/prisma/schema.prisma --to-url $DATABASE_URL --script` against a fresh check-out → expected output is empty (zero SQL). Confirms A-D3's "no migration needed" claim before commit 1 lands.

#### Commit 1 — `chore(schema): explicit onDelete: SetNull on InviteCode.usedById`

**Deliverables:**
- `packages/db/prisma/schema.prisma` — single-line annotation on the `InviteCode.usedBy` relation: `@relation(fields: [usedById], references: [id], onDelete: SetNull)`.
- `npx prisma generate` re-run (zero SQL diff per pre-flight; just the client regen so types pick up the explicit annotation).

**Tests:** none net-new; existing schema-mock fixtures don't read FK behaviour. Pre-flight check above is the proof.

**Success criteria:** `prisma migrate diff` produces empty SQL; `npm run typecheck` clean; existing test suite unchanged.

#### Commit 2 — `feat(api): DELETE /api/admin/users/:id endpoint with self-protection + cascade-aware list payload`

**Pre-coding sanity check (per A-D12):** grep `req.user` consumers across `apps/api/src/routes/*.ts` and `apps/api/src/middleware/*.ts`. Confirm every consumer is downstream of a DB-lookup gate (`requireUser` for `req.userId` or `requireActive` for `req.user`). Findings recorded in commit message:
- *Expected:* "Audit clean — every `req.user` consumer is downstream of `requireActive`'s DB lookup. A-D12 property holds."
- *If unexpected:* "Audit found N route(s) reading `req.user.*` without a DB-lookup gate: [list]. A-D12 property breaks for these — flagged separately, NOT fixed in A1 scope."

**Deliverables:**
- New route `DELETE /api/admin/users/:id` in [apps/api/src/routes/admin.ts](../apps/api/src/routes/admin.ts), stacked behind the existing `requireUser → requireActive → requireAdmin` chain.
  - Self-protection: `if (req.user.id === req.params.id) return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });` — keyed on the populated `req.user.id` (set by `requireActive`), not on JWT or path.
  - Existence check: `prisma.user.findUnique({ where: { id }, select: { id: true } })` → 404 with canonical body `{ error: 'Not found' }` if missing.
  - Delete: `prisma.user.delete({ where: { id } })` — single statement, FK cascades handle Platform / UserGame / WishlistRelease / PlatformLog; `InviteCode.usedById` becomes NULL via the SQL FK behaviour.
  - Returns `204 No Content` on success.
- `GET /api/admin/users` payload extended (per A-D11): `_count: { userGames: true, wishlists: true }` added to the `findMany` select. Maps to two new `AdminUser` fields: `gamesCount: number`, `wishlistCount: number`. Both populated; only `gamesCount` surfaces in modal copy at A1, but the wishlist count rides along for future UX flexibility.
- `@hoard/types`: `AdminUser` interface gains `gamesCount` + `wishlistCount`.
- Frontend `apps/web/src/lib/api.ts`: `admin.deleteUser(id)` method added; on success calls `cache.invalidate('admin:')` to flush both `admin:users` and `admin:invite-codes` (a deletion can orphan a code, which changes how the codes section renders).

**Tests:**
- `apps/api/src/routes/admin.test.ts` — extend with:
  - `DELETE /api/admin/users/:id` as admin → 204 + verify the cascade: mock-level assertions that `prisma.user.delete` is called with the right where-clause; integration-shape assertion that the underlying FKs would cascade (mock `_count` results, etc.).
  - Self-delete attempt (admin's own ID) → 400 `CANNOT_DELETE_SELF` + verify `prisma.user.delete` is NOT called.
  - Non-admin caller → 404 (existing `requireAdmin` guard test pattern).
  - Non-existent target ID → 404 with `{ error: 'Not found' }`.
  - User exists, no redeemed code → 204 cleanly (FK SET NULL is a no-op).
  - `GET /api/admin/users` payload now includes `gamesCount` + `wishlistCount` — single new assertion in the existing happy-path test.

**Success criteria:** ~6 new API tests pass; existing 274 stay green; lint + typecheck clean. `req.user` audit recorded in commit message.

#### Commit 3 — `refactor(modals): promote ConfirmModal to apps/web/src/components/modals/`

**Deliverables:**
- New file `apps/web/src/components/modals/ConfirmModal.tsx` — verbatim copy of the existing component from [SettingsDesktop.tsx](../apps/web/src/components/screens/SettingsDesktop.tsx) lines 590–700, with two changes:
  - Variant union widened: `'delete-account' | 'wipe-library' | 'delete-user'`.
  - New `delete-user` branch in the headline / description / labels switch. Description copy per A-D11: `deletes <subject> · X games · Y platforms · keeps the invite code as orphan · cannot be undone`. Counts come from a new optional `details: { games: number; platforms: number }` prop (wishlists deliberately not in modal copy per A-D11; if a future caller wants different counts, extend the prop). Description omits the count breakdown if `details` is absent so existing call sites keep working.
- [SettingsDesktop.tsx](../apps/web/src/components/screens/SettingsDesktop.tsx) — delete the inline `ConfirmModal` definition; add `import { ConfirmModal } from '../modals/ConfirmModal';` at the top. Existing call sites untouched.
- [SettingsMobile.tsx](../apps/web/src/components/screens/SettingsMobile.tsx) — same promotion + import swap if the mobile copy uses an inline definition (verify in the move). If mobile already imports from a shared location, no change.

**Tests:**
- New `apps/web/src/components/modals/__tests__/ConfirmModal.test.tsx` — 5 cases:
  - Variant `'delete-account'` renders the existing copy (regression guard for the move).
  - Variant `'wipe-library'` renders the existing copy.
  - Variant `'delete-user'` renders the new copy with `subject` interpolated and `details` rendered as `// X games · Y platforms` when provided. Wishlists count, even if accidentally passed, is NOT rendered (defensive — locks the A-D11 decision).
  - Variant `'delete-user'` without `details` falls back to terse copy (omits the count line).
  - Typed-confirm match unlocks the confirm button across all three variants.
- Existing SettingsDesktop tests (which exercise the modal indirectly) stay green — no behavioural change for the existing variants.

**Success criteria:** ~5 new modal tests pass; SettingsDesktop tests stay green; component file is the single source of truth for typed-confirm.

#### Commit 4 — `feat(admin): row density + sort/filter/search + delete UI`

**Deliverables:**
- [AdminScreen.tsx](../apps/web/src/components/screens/AdminScreen.tsx) — substantial rewrite of the ALL USERS section (PENDING REQUESTS + INVITE CODES sections untouched). Specifics:
  - **Header row** (terminal aesthetic, 10px `--paper-faint`, mono): `// IDENTITY · STATUS · JOINED · PLATFORMS · ACTIONS`. Not a real `<th>` — keeps the grid pattern.
  - **`UserRow`** layout per A-D10: `1fr 70px 80px 110px 56px`, padding `4px 0`, font-size `--text-xs`, dashed bottom border (existing). Identity cell renders `<name> · <email>` when both present (mono primary + paper-dim email), else whichever is set, else `displayIdentity` fallback (covers Steam-only). Tooltip via `title=` on the cell carries the full email when truncated.
  - **PLATFORMS column extension per A-D11(3):** instead of just `2 platforms · ST·PS`, render `2 platforms · 488 games` — the games count is the more useful scan signal. **Latitude during implementation:** if the column gets too crowded at narrow widths, fall back to platforms-only and let the modal carry the games count. UX call, not a strict spec.
  - **Filter chip strip** (above the header row): `[ all ] [ active ] [ pending ] [ admin ]` rendered as `Chip` primitives with `.on` for the selected one. Counts inline: `[ all (8) ] [ active (5) ]`. Reads from `?filter=` URL param; writes back on change. "active" semantics per A-D9 (strict — admins excluded).
  - **Search input** (right side of the chip strip): `<input>` styled like the Library-screen find input (existing pattern from Post-8 PR A — D2). Placeholder `find by email or name…`. Reads `?q=` URL param; writes on every keystroke (no debounce per A-D8). Filter applies AFTER status filter — q is matched case-insensitively against `email` AND `name` (substring) AND `displayIdentity`.
  - **Sort header** (small `[ joined ↓ ]` button to the right of the filter chips, terminal aesthetic): clicking cycles `joined desc → status → platforms desc → joined desc`. `?sort=` URL param. Default omitted from URL.
  - **Sort logic** (inline in `AdminScreenImpl`):
    - `joined`: `Date.parse(b.createdAt) - Date.parse(a.createdAt)` (desc).
    - `status`: bucket by `pending(0) → active(1) → admin(2)`, secondary by createdAt desc.
    - `platforms`: `b.platforms.count - a.platforms.count` (desc), secondary by createdAt desc.
  - **`[delete]` button** in the new ACTIONS column, rendered ONLY when `user.id !== currentUser.id` (per A-D2). Same `--red` mono micro-button styling as the existing `[revoke]` on `CodeRow`. Click opens `ConfirmModal` with `variant='delete-user'`, `subject={user.displayIdentity}`, `confirmKeyword={user.displayIdentity}` per A-D6, `details={ games: user.gamesCount, platforms: user.platforms.count }` per A-D11. Wishlists count NOT passed.
  - On `ConfirmModal` confirm: `await api.admin.deleteUser(user.id)` → `cache.invalidate('admin:')` (already inside `api.admin.deleteUser`) → modal closes → green inline `// deleted` toast for 1.5s near where the row used to be (similar pattern to GenerateCodeModal's `// copied` indicator).
- URL state: read on mount via `useSearchParams()`, write on change with `replace: true` so the back button doesn't accumulate intermediate states.

**Tests:**
- `AdminScreen.test.tsx` — extend with:
  - Filter chip "active" hides admins and pending users.
  - Filter chip "pending" shows only `status='PENDING_INVITE'` users.
  - Filter chip "admin" shows only `isAdmin=true` users.
  - Filter chip counts reflect the dataset.
  - Search filters by email substring (case-insensitive).
  - Search filters by name substring.
  - Search + filter compose (active filter + search "marco" returns active users matching "marco").
  - Sort cycles `joined → status → platforms → joined` on header click.
  - Sort by status puts pending first.
  - Sort by platforms puts the heaviest user first.
  - URL state persists: mount with `?filter=active&q=mar&sort=platforms` renders the right slice.
  - PLATFORMS column shows games count inline (or platforms-only if commit 4 fell back to that during the UX call — assertion adjusted to actual rendered output).
  - `[delete]` button absent on the current admin's own row (currentUser.id matches).
  - `[delete]` click → confirm modal opens with right subject + details (games + platforms; NO wishlists).
  - Confirm modal `displayIdentity` typed → unlock → confirm → `api.admin.deleteUser` called with the right ID.
  - Self-delete defence: even if currentUser somehow matches a row (shouldn't happen — guard above), clicking confirm doesn't fire deleteUser (paranoia test against a future regression).

**Success criteria:** ~14 new web tests pass; existing 265 stay green; lint clean; typecheck clean.

#### Commit 5 — `docs(admin): plan closeouts + AGENT.md decision mirror`

**Deliverables:**
- This file (`docs/ADMIN_POLISH_PLAN.md`) — phase status table at §5 marked Done with commit hashes; record the `req.user` audit outcome from commit 2.
- [CLAUDE.md](../CLAUDE.md) — Current Phase line updated; add an entry to "Recent fixes landed" describing the A1 outcome (test counts + commit hashes + brief summary).
- [docs/PLAN.md](PLAN.md) — Phase Status table gains a row for "Admin polish (A-series) A1" → Done.
- [AGENT.md](../AGENT.md) — new decision entry mirroring A-D1 + A-D2 + A-D3 + A-D12 (cascade behaviour + self-protection + orphan-code FK + JWT-natural-invalidation) as decision **#39** (or whichever next-number is free at land time). Single decision entry — these four are tightly coupled and read as one architectural call about "destructive admin actions on User rows."

**Tests:** N/A — doc-only commit.

**Success criteria:** every doc current; `git grep "Active workstream"` produces exactly one match in `CLAUDE.md` reflecting the post-A1 state.

---

## 3. Affected files (summary)

**New files:**

| Path | Purpose |
|---|---|
| `apps/web/src/components/modals/ConfirmModal.tsx` | Promoted shared typed-confirm modal (commit 3). |
| `apps/web/src/components/modals/__tests__/ConfirmModal.test.tsx` | Modal regression + new variant coverage. |

**Modified files:**

| Path | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Explicit `onDelete: SetNull` annotation on `InviteCode.usedBy` (commit 1). |
| `apps/api/src/routes/admin.ts` | New `DELETE /api/admin/users/:id` route + extended `GET /api/admin/users` payload with counts (commit 2). |
| `apps/api/src/routes/admin.test.ts` | ~6 new tests for the delete endpoint + counts. |
| `packages/types/src/index.ts` | `AdminUser` gains `gamesCount` + `wishlistCount`. |
| `apps/web/src/lib/api.ts` | New `api.admin.deleteUser(id)` method with `cache.invalidate('admin:')`. |
| `apps/web/src/components/screens/SettingsDesktop.tsx` | Drop inline `ConfirmModal` definition; import from new modal location (commit 3). |
| `apps/web/src/components/screens/SettingsMobile.tsx` | Same promotion if needed. |
| `apps/web/src/components/screens/AdminScreen.tsx` | Density redesign + filter/search/sort + delete wiring + PLATFORMS column extension (commit 4). |
| `apps/web/src/components/screens/__tests__/AdminScreen.test.tsx` | ~14 new tests. |
| `docs/ADMIN_POLISH_PLAN.md` | Phase status closeout (commit 5). |
| `docs/PLAN.md` | New row. |
| `CLAUDE.md` | Current Phase + Recent Fixes. |
| `AGENT.md` | Decision #39. |

**Deleted files:** none.

---

## 4. Out of scope

- **Audit log of admin actions.** Only one admin in v1; the codes list (`InviteCode.usedAt`, plus `usedBy` SET NULL on delete) gives Andrea enough trace. Revisit if multi-admin lands in v2.
- **Soft-delete / undo window.** Hard-delete with cascade is the call (A-D1). If a wrong-user delete happens, the recovery path is "ask the user to sign up again with the same email and re-redeem a fresh code" — same workflow as a brand-new beta tester.
- **Bulk operations** (delete N users at once, regenerate codes for everyone). Tiny user count, not worth the UI weight.
- **Demoting active users back to pending.** I-D8 from the I-series — manual Supabase row edit if ever needed. *Deletion* is the supported destructive admin action; demotion is not.
- **Active-session forced-invalidation step on delete.** Deliberate non-action per A-D12 — JWT lookup naturally returns 401 once the User row is gone, frontend bounces to `/login`, cookie expires within 7 days. Adding session-table tracking just to enable a manual "kick this user now" affordance is a feature, not a fix.
- **`User.deletedAt` tombstone column / soft-delete refactor.** Schema change for a feature that doesn't exist; pure YAGNI. The orphan `InviteCode.usedById = NULL` is the closest thing to a tombstone we keep.
- **Last-active / last-sign-in column.** Useful eventually but we don't track it today (no `User.lastSignInAt`). Adding the column needs design + auth-path wiring + a migration; out of scope for A1.
- **Mobile `/admin`.** Still desktop-only per I-D3. Below-1024px users still see the existing terminal-aesthetic fallback message.
- **Accessibility re-audit of `/admin`.** The existing axe-core a11y E2E suite is broken since I1 (per E-series); waiting on E1 to restore meaningful coverage. A1's commit 4 will keep the `/admin` `aria-current="page"` / `role="dialog"` / focus-trap patterns intact, but won't add new axe assertions.
- **Fixing routes that read `req.user` without a DB-lookup gate, if any.** A-D12's sanity check might surface such routes (none expected — historical convention). If found, the commit message flags them and a separate PR addresses the auth-correctness issue. A1 doesn't fix; A1 documents.
- **Diagnosing the web full-suite vitest hang.** Surfaced during A1 commit 1's verification: `npx vitest run` against the full `apps/web` suite hangs indefinitely on this environment — one worker pegs at ~96% CPU, no progress, no timeout. Reproduced on the unmodified baseline (with the schema change stashed), confirming it's pre-existing, not an A-series regression. **Workaround for future A-series commits:** verify against targeted subsets (e.g. `npx vitest run src/components/screens/__tests__/AdminScreen.test.tsx`) which run in ~5s cleanly. Single-file runs work fine; the hang is specific to multi-file parallel execution. **Hypothesis worth investigating** when picked up: the global `cache._resetForTests()` in `apps/web/src/test-setup.ts` (added 2026-05-10 in commit `858cb00`) operates on a singleton `cache` module imported from `./lib/cache`. If vitest's worker isolation creates separate module copies per worker but `beforeEach` somehow runs across workers, there's a possible deadlock window. **Worth investigating** but explicitly out of scope for the A-series — the symptom is environmental noise, not a correctness problem in the code under test. A separate workstream (or a follow-up to E-series, since they own test-infra) is the right home.
- **Three of the four `requireActive`-exempt routes return 500 instead of 404 on the deleted-user-with-valid-JWT edge case.** Surfaced by the per-route `req.userId` audit in A1 commit 4 (verifying A-D12 individually per-route after the route-listing audit in commit 2). **Clean-for-security but minor UX wart.** Affected routes: `DELETE /api/auth/me` ([auth.ts:195-199](../apps/api/src/routes/auth.ts#L195-L199)), `POST /api/auth/redeem-invite` ([auth.ts:478-536](../apps/api/src/routes/auth.ts#L478-L536) — the `tx.user.update` inside the `$transaction`), `POST /api/auth/request-access` ([auth.ts:543+](../apps/api/src/routes/auth.ts#L543) — the `prisma.user.update`). Each calls a write operation against `prisma.user` keyed on `req.userId`; if the user was deleted via the new `/admin` flow but their JWT cookie hasn't expired, Prisma throws `P2025 RecordNotFound` → propagates to the express error handler → 500. **No security implication** — no privilege escalation, no resource accessed by the request, the cookie's expiry is a sufficient floor. **`GET /api/auth/me` is the model fix:** it does the same `findUnique` lookup, then explicitly returns 404 with `{ error: 'User not found' }` (auth.ts:152-154) — handled gracefully. **Estimated fix:** ~15 lines per route — wrap the relevant Prisma call in `try/catch (e if e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')` and return 404 with the canonical body. Drop the cookie on `DELETE /auth/me`'s 404 path so the frontend clears state cleanly. **Out of A1 scope** because flag-don't-fix is the standing rule for things surfaced by audit; lands in a future auth-correctness pass workstream alongside any other JWT-cookie-edge-case cleanups.
- **Global typography audit — sweep all screens for `fontSize` magic numbers and `--paper-faint`-as-text-color violations against decision #12.** A1's commit-5 typography audit (run by Andrea before commit 5 closed the workstream) caught **4 pre-existing violations** on the admin/modal surface: V1 magic-number `fontSize: 26` in `ConfirmModal.tsx` from the May 2026 baseline (`de28577`); V2/V3/V4 inline `--paper-faint` text-color overrides + a sub-floor `--text-2xs` section-header label, all from I5's `6d7fc73`. **The same drift class likely exists across other screens** — Phase 8 PR 1 swept inline `fontSize` literals across the codebase in May 2026, but subsequent edits (Trophies, Releases, Wishlist, Steam Wishlist, Settings audit, I-series) have all added new code without going through the same kind of audit. Predictably some of that new code drifted: re-introduced magic numbers, used `--paper-faint` directly as text color when the `t-faint` class would have been correct, etc. **Scope when picked up:** grep across `apps/web/src/components/` for (a) `fontSize: \d+` pattern (any inline numeric literal — should all be `var(--text-*)`), (b) `color:.*paper-faint` (banned at any text size < 17 px per decision #12), (c) any `var(--text-2xs)` or `var(--text-3xs)` usage on interactive elements (sub-floor for buttons / inputs / links — except documented exceptions like receipt internals, .plat badges). Cross-reference each finding against the 11-step token scale and decision #12's exception list. **Standalone workstream when prioritized** — sized roughly equivalent to a 1-2 commit hygiene sweep, no behavior change, all fixes one-line edits. Not blocking any active work; the visual impact of each violation is small individually, but the cumulative drift erodes the floor. Worth catching before the next major UI workstream lands more new code on top.

---

## 5. Phase status

| PR | Status | Notes |
|---|---|---|
| **A1 commit 1** — `chore(schema): explicit onDelete: SetNull on InviteCode.usedById` | **Done** (2026-05-10, commit `141b781`) | Pure declarative schema annotation — zero SQL diff verified via `prisma migrate diff --script` (output: empty migration). Pre-existing migration `20260508140000_invite_codes` already ships `ON DELETE SET NULL` at the SQL layer; this just makes the schema explicit. Verifications: prisma generate clean, typecheck clean, lint clean (1 unrelated pre-existing warning), API tests 278/278 pass, AdminScreen.test.tsx 16/16 pass in isolation. Web full-suite vitest hung in this environment — reproduced on baseline, surfaced as forward-pointer in §4. Side effect: `prisma format` re-aligned column whitespace in HltbData + WishlistRelease (formatter idempotence; zero SQL impact) — captured in same commit. |
| **Plan-doc** — `docs(admin): open A-series workstream + plan doc` | **Done** (2026-05-10, commit `47b3dfe`) | Mirrors the `c0ffcb0` E-series pattern of opening a workstream with a dedicated plan-doc commit before the work. 12 locked decisions A-D1 → A-D12, single A1 PR with 5 commits planned. §4 forward-pointer for the web full-suite vitest hang surfaced during commit 1's verification (pre-existing, reproduced on baseline; targeted single-file runs work). |
| **A1 commit 2** — `feat(api): DELETE /api/admin/users/:id endpoint with self-protection + cascade-aware list payload` | **Done** (2026-05-10, commit `0df6bf3`) | Pre-coding `req.user` audit clean (4 consumers, all downstream of `requireActive`'s DB lookup); relation names `userGames` + `wishlists` confirmed at schema.prisma:87-88. New route stacked behind `requireUser → requireActive → requireAdmin`; self-protection 400 `CANNOT_DELETE_SELF`; existence check via `findUnique({ select: { id: true } })`; single `prisma.user.delete()` (FK cascades handle owned tables, `InviteCode.usedById` flips to NULL via SQL FK behavior). `GET /api/admin/users` payload extended with `_count: { userGames, wishlists }`; `AdminUser` interface gains `gamesCount` + `wishlistCount`. Frontend `api.admin.deleteUser(id)` invalidates `admin:` prefix. +6 API tests including self-delete guard, non-existent-target 404, cascade verification. **284 API + 196 web tests pass.** |
| **A1 commit 3** — `refactor(modals): promote ConfirmModal to shared file + delete-user variant` | **Done** (2026-05-10, commit `2f61787`) | Net delta is ~120 lines moved out of `SettingsDesktop.tsx` into new `apps/web/src/components/modals/ConfirmModal.tsx`. Variant union widened to add `'delete-user'`. New optional `details: { games: number; platforms: number }` prop renders an `// X games · Y platforms` line under the description (per A-D11). Wishlists count NOT in the prop type — locks A-D11's "modal copy ≠ payload shape" decision at the type system layer. SettingsMobile uses inline typed-confirm fields (different UI pattern), deliberately untouched. 12 new modal tests including legacy regression guards. |
| **A1 commit 4** — `feat(admin): row density + sort/filter/search + delete UI` | **Done** (2026-05-10, commit `36c5222`) | Substantive UI commit. Toolbar with 4-chip filter strip (strict A-D9), search input (no debounce per A-D8), single sort cycle button. URL state via `?filter=&sort=&q=`. UserRow rebuilt as 5-col grid (later widened in `01cf7c8`/`2fba14c` polish). `[delete]` button hidden on admin's own row per A-D2; opens `ConfirmModal` `'delete-user'` variant on click; `// deleted: <displayIdentity>` toast on success (viewport-stable). +23 web tests covering filter/search/sort/delete. **Per-route `req.user` audit confirmed** for the 4 `requireActive`-exempt routes — A-D12 natural-401 property holds for security; 3 of 4 routes return 500 instead of 404 on the deleted-user-with-valid-JWT edge case (clean-for-security but minor UX wart, captured as deferred entry in §4 in `ed689b6`). |
| **§4 deferred-work** — `docs(admin): track 500-on-deleted-user-edge-case as deferred work` | **Done** (2026-05-10, commit `ed689b6`) | Doc-only. Captures the audit finding from commit 4's per-route verification: `DELETE /auth/me`, `redeem-invite`, `request-access` return 500 on the edge case (P2025 propagating to express). `GET /auth/me` is the model fix. ~15-line catch-and-404 fix per route, future auth-correctness pass workstream. Out of A1 scope per flag-don't-fix rule. |
| **First-eyeball polish** — `fix(admin): live-page eyeball polish — 4 fixes` | **Done** (2026-05-10, commit `01cf7c8`) | Modal keyword display fix (drop `t-up`, hard-code static "// TYPE … TO CONFIRM", render keyword span in actual case — was uppercased by CSS while validation required literal-case → mismatch between displayed instruction and required input). PLATFORMS column 130 → 180 px + nowrap/ellipsis safety net. INVITE CODES used-by column 180 → 240 px (later superseded by proportional-flex in `2fba14c`). ACTIONS column breathing room: USER_ROW_GRID 56 → 80 px, CodeRow 90 → 110 px. |
| **Second-eyeball polish** — `fix(admin): codes grid — proportional flex so used-by gets 2/3 of slack` | **Done** (2026-05-10, commit `2fba14c`) | Second eyeball surfaced that 240 px fixed used-by was still truncating on wide windows (1fr note absorbed all slack). Fix: `'180px 1fr 240px 110px'` → `'180px minmax(120px, 1fr) minmax(240px, 2fr) 110px'`. Two flexible columns share slack 1:2. Min-width 686 px below the 724 px content area at the 1024 px desktop floor. User-row PLATFORMS column intentionally not changed (bounded content range). 39 AdminScreen tests stay green. Side note: Andrea onboarded Giuseppe Spizzico via the new admin flow — first real beta user beyond Luigi's earlier test; end-to-end flow worked. A-D6 stays locked. |
| **Typography hygiene** — `fix(admin/modal): typography hygiene — pre-existing token-scale + paper-faint violations` | **Done** (2026-05-10, commit `620e2f7`) | Hygiene cleanup of 4 pre-existing decision-#12 violations surfaced during the commit-5 typography audit. **None A1-introduced** — V1 (`fontSize: 26` → `var(--text-xl)` in ConfirmModal headline) from `de28577` May baseline; V2 (drop inline `color: var(--paper-faint)` on EmptyLine), V3 (statusColor PENDING `--paper-faint` → `--paper-dim`), V4 (SectionHeader label `--text-2xs` → `--text-xs`) all from I5's `6d7fc73`. A1 commit 4 copied the existing logic verbatim without changing it; the new code A1 added is clean (32/32 fontSize references token-anchored). 4-line diff total. |
| **A1 commit 5** — `docs(admin): A1 closeouts (CLAUDE.md / AGENT.md / PLAN.md / plan §5)` | **Done** (2026-05-10, this commit) | Doc-only closeout. AGENT.md gains decision #39 (mirrors A-D1 + A-D2 + A-D3 + A-D12). CLAUDE.md Current Phase rearranged: E-series stays Active (Track 2), A-series moved to Previous, I-series demoted to Earlier; Recent Fixes block prepended with 9 entries covering the workstream commit-by-commit. PLAN.md row added for A-series. This file's §5 marked Done with all 9 landed commit hashes. Plus new §4 deferred-work entry for the global typography audit (this audit only swept admin/modal surface; similar drift likely exists across other screens). **A1 closes here** — single-PR workstream with one substantive UI commit + four follow-up polish commits + two doc commits. **Final test counts: 284 API + 304 web tests pass; lint + typecheck clean.** |
| **A2** — `feat(admin): IA redesign — sub-routes + sidebar + delete-feedback` | **Done** (2026-05-29, this commit) | Closes the two Known-gap entries from A1 (structural fatigue + missing delete-feedback affordance). **Structural rework:** split `/admin` from a 1300-line monolithic `AdminScreen.tsx` into 5 sub-routes under a sidebar layout. New `apps/web/src/components/screens/admin/` directory: `AdminLayout.tsx` (sidebar w/ count badges per section + global `[refresh]`), `AdminPending.tsx` (pending access requests + per-row `[generate code for X]`), `AdminUsers.tsx` (filter/sort/search + delete-user modal, URL state `?filter=&sort=&q=`), `AdminCodes.tsx` (invite codes + `[+ generate code]` CTA relocated from global top-bar to the codes-section header), `AdminFeedback.tsx` (feedback w/ mark-read toggle + NEW `[delete]` affordance), `AdminEvents.tsx` (telemetry feed), `shared.tsx` (extracted primitives: `SectionHeader` / `EmptyLine` / `ErrorBlock` / `LoadingLine` / `MobileFallback` / `NotFoundView` / `noteLabel` / `relativeTime` / `USER_ROW_GRID` / filter+sort types). `AdminScreen.tsx` slimmed to ~40 lines of route gate. App.tsx wires the parent route + 5 nested children + index redirect (`/admin` → `/admin/users`). Sidebar.tsx unchanged — still points at `/admin` which redirects via the index route. Each section ships as a lazy-loaded chunk (no monolithic ~25 KB AdminScreen bundle). Mobile fallback preserved per I-D3 — admin stays desktop-only. **Delete-feedback affordance** (the other Known-gap closure): new `DELETE /api/admin/feedback/:id` admin-only route (204 on success, 404 if gone) in `apps/api/src/routes/admin.ts`; `api.admin.deleteFeedback(id)` client method with NARROWER cache invalidation than `deleteUser` (drops only `admin:feedback`, not the full `admin:` prefix — deleting a feedback row can't orphan an InviteCode or change the users list); `ConfirmModal` gains a `'delete-feedback'` variant (4th alongside `delete-account` / `wipe-library` / `delete-user`; `DELETE` keyword, feedback-specific copy); `[delete]` button on FeedbackRow uses `stopPropagation` so it doesn't toggle row-expand. **Tests:** AdminScreen.test.tsx (40 tests, +1 new sidebar-nav-counts test); AdminScreen.feedback.test.tsx (9 tests, +3 new delete-affordance coverage); AdminScreen.events.test.tsx (6 tests, unchanged shape); ConfirmModal.test.tsx (+3 for delete-feedback variant); api-invalidation.test.ts (+1 deleteFeedback narrow invalidation); admin.feedback.test.ts backend (+2 — DELETE happy 204 / 404 / non-admin-gating extended). **Final test count: 39 backend suites / 582 tests passing** (+4 from M3's 578); **83 web tests passing** across the touched files. Typecheck + lint + production build all clean (5 fast-refresh warnings on `admin/shared.tsx` matching the existing accepted pattern in `useSearchModal.tsx`). |

> Update this table as the PR lands. Use: `In progress`, `Done`, `Blocked (reason)`. Workstream name is "Admin polish (A-series)" in `docs/PLAN.md`.
