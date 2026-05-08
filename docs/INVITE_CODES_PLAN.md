# Hoard — Invite Codes & Admin Panel

> **Workstream:** gate the closed beta behind single-use invite codes, and add an in-app admin surface so Andrea can generate codes, see who has signed up, and respond to access requests.
>
> **Status:** Scoped 2026-05-08, decisions I-D1 … I-D15 locked inline below (Andrea confirmed all questions in one round before this draft).
>
> **Source spec:** [docs/Hoard_invite_codes.md](Hoard_invite_codes.md) — read first; this plan implements that spec.
>
> **Pre-step (NOT a PR):** delete the seed user (`seed-andrea`) and the unintended signup (`daniel.guernieri@gmail.com`) via [scripts/delete-users.ts](../scripts/delete-users.ts) **before** running the I1 migration. After deletion, the user table contains exactly three accounts (Andrea, Luigi, secondary test) — all of which the migration will promote to `ACTIVE`.
>
> **Pre-step has three sub-steps in this order — do not skip any:**
>
> 1. **Snapshot the User table.** In Supabase SQL Editor, run `SELECT * FROM "User" ORDER BY "createdAt" ASC;` and save the result locally (paste into a timestamped text file under `docs/runbooks/` or wherever convenient). This is the rollback reference if anything goes sideways during deletion or migration.
> 2. Append `seed-andrea` + `cmotx9dgl00b0o101lp8zkerb` (Daniel) to the history block of [scripts/delete-users.ts](../scripts/delete-users.ts), run it.
> 3. Verify with `npx tsx scripts/list-users.ts` that exactly three rows remain (Andrea + Luigi + secondary test).

---

## 1. Locked decisions

These are closed and apply across every PR in this workstream. Do not re-open without explicit Andrea sign-off.

**I-D1 — Welcome route preserves the original destination, with same-origin allowlist.**
Pending users hitting a protected route are redirected to `/welcome?next=<original-path>` (URL-encoded). On successful redemption, the frontend navigates to `next` if and only if it passes a `safeNext(value)` allowlist check; otherwise falls back to `/`. **Allowlist rule:** `next` must (a) be a non-empty string, (b) start with exactly one `/`, (c) NOT start with `//` (which would be a protocol-relative URL to another host), (d) NOT contain a colon before the first `/` (which would be an absolute URL with a scheme). Implementation lives in `apps/web/src/lib/safeNext.ts` and has dedicated unit tests including the open-redirect attack vectors `//evil.com`, `https://evil.com`, `javascript:alert(1)`, and `\\evil.com`. The Steam OpenID callback redirects pending users to `/welcome` *with no `next` param* — the callback has no prior-intent context, so dashboard is the right fallback.

**I-D2 — Admin link visible in the sidebar via `isAdmin` on `/api/auth/me`.**
`GET /api/auth/me` includes `isAdmin: boolean`. Sidebar shows an `ADMIN` entry only when `isAdmin === true`. The sidebar entry is a UI affordance; security still lives in `requireAdmin` middleware on every `/api/admin/*` route.

**I-D3 — Admin page is desktop-only for v1.**
Below the 1024 px breakpoint, `/admin` shows a centered terminal-aesthetic message: `// admin panel is desktop-only · open hoard on a laptop or widen your browser`. No mobile shell, no parity port. Document this explicitly as deliberate.

**I-D4 — Admin identification via `User.isAdmin Boolean @default(false)`, not env var.**
The migration that adds the field also flips Andrea's row to `true`. `requireAdmin` middleware is a one-line `req.user.isAdmin === true` check. Survives DB rebuilds; no Railway env-var dependency. Matches how the rest of the user state is modeled.

**I-D5 — Migration backfill rule: `UPDATE "User" SET status = 'ACTIVE' WHERE "createdAt" < NOW()`.**
Run *after* the pre-step user deletions, so the rule promotes exactly Andrea + Luigi + the secondary test account. New signups post-migration default to `PENDING_INVITE`.

**I-D6 — Rate-limit on `/api/auth/redeem-invite`: per-IP 10/hour + per-user 5/hour, keyed on stable identifiers.**
Two separate `express-rate-limit` instances chained on the route. **Per-IP limiter `keyGenerator` returns `req.ip`** (Express respects `trust proxy`, so this is the real client IP behind Railway's proxy). **Per-user limiter `keyGenerator` returns `req.user.id`**, never the JWT token — keying on the token would let a malicious user reset their budget by logging out and back in, since each login mints a fresh token. The user ID is stable across sessions. Production-only (existing `skip: () => NODE_ENV !== 'production'` pattern from Phase 8 PR 3). Tighter than the global limiter because brute-forcing a code keyspace is the specific attack we're defending against.

**I-D7 — Welcome screen is responsive (single component).**
No separate mobile mockup. Same React component renders at every width using design-system tokens, matching the `/login` pattern. Spec §5 ASCII art is desktop-anchored; mobile collapses sensibly.

**I-D8 — Demoting an active user back to pending is out of scope for v1.**
If a user misuses the beta, manual Supabase row edit. No UI. Mirrors spec §9 deferral list.

**I-D9 — `accessRequestMessage` capped at 500 chars server-side via Zod.**
Long enough for context ("Hi I'm Marco, Luigi told me about Hoard, I play mostly PC and Switch…"), tight enough to prevent abuse. Frontend textarea uses `maxLength={500}` with a live counter for honesty.

**I-D10 — Code redemption uses `prisma.$transaction` with a `WHERE usedById IS NULL` predicate.**
The transaction performs an atomic update on `InviteCode` keyed on `(id, usedById = NULL)`; if the update affects zero rows, the code is already redeemed and we return 409. Same transaction sets `User.status = 'ACTIVE'`. Race-safe even though closed-beta concurrency is hypothetical.

**I-D11 — Steam OpenID callback handles pending status server-side.**
The callback creates the `User` (with `PENDING_INVITE` for new signups) and redirects to `/welcome` if pending, or to the existing destination if active. Frontend hydration via `/api/auth/me` reflects status either way.

**I-D12 — `request-access` is idempotent.**
Subsequent calls overwrite `accessRequestMessage` and refresh `accessRequestedAt`. UI stays in the request-sent state once the flag is set, regardless of how many times the user resubmits. The admin page shows the *latest* message + the *latest* `accessRequestedAt`.

**I-D12a — `hasRequestedAccess` stays `true` after a redemption.**
If a user requests access at T+0, gets a code at T+10min, and redeems at T+15min, their `hasRequestedAccess` flag stays `true` post-redemption — it's historically accurate (they did request access) and gives the admin panel useful context (`AdminUser.hasRequestedAccess + status === 'ACTIVE'` reads as "redeemed after request"). The welcome screen is gated by `RequireActive` reading `status`, NOT by `hasRequestedAccess`, so an active user with the flag set never sees the welcome screen anyway. No reset logic needed; the flag is append-only for the lifetime of the account.

**I-D13 — Pre-migration cleanup: delete `seed-andrea` + `daniel.guernieri@gmail.com`.**
Run `scripts/delete-users.ts` (with the two ids appended to its history block) **before** I1 ships. Side cleanup — updating the seed script to set sensible `status` / `isAdmin` defaults for fresh seeds — is deferred to a follow-up PR after this workstream merges.

**I-D14 — Code format `HOARD-XXXX-XXXX` with 32-char alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.**
Server-side generator only; rejected by frontend regex `^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$` before submission. Generation retries up to 5 times on Prisma `P2002` (unique-constraint) collision; after 5 failures the endpoint returns 500 (the keyspace makes 5 collisions a near-impossibility — would indicate a real bug worth investigating).

**I-D15 — Admin endpoints return 404 (not 403) when `isAdmin === false`, with the existing 404 JSON shape.**
No leakage that the admin surface exists. Frontend already hides the sidebar entry for non-admins; the 404 closes the URL-typing path. `requireAdmin` returns the canonical project 404 body — `res.status(404).json({ error: 'Not found' })` — matching the shape used by [games.ts:183](../apps/api/src/routes/games.ts#L183), [games.ts:209](../apps/api/src/routes/games.ts#L209), and other route 404s, so the response is byte-indistinguishable from a real "this route does not exist." `/admin` page on the frontend checks `currentUser.isAdmin` and renders a 404 view for non-admins (instead of fetching and getting 404 from the API).

---

## 2. PR sequence

Six PRs (I1 → I6). Per CLAUDE.md hard rule 10, agent stops after each PR, lands changes, updates docs, summarizes in one message, and waits for Andrea's go-ahead before starting the next.

### I1 — Schema, migration, pre-cleanup

**Goal:** ship the data model. No user-visible behavior change yet (existing users stay ACTIVE; no new endpoints; no new UI).

**Pre-step (manual, before opening the PR):**
- Add `seed-andrea` + `cmotx9dgl00b0o101lp8zkerb` (Daniel) to the history block of [scripts/delete-users.ts](../scripts/delete-users.ts), run it against production, verify with `scripts/list-users.ts` that the user table contains exactly three rows.

**Deliverables:**
- New Prisma model `InviteCode` (per spec §3.1) in [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma).
- New `User` fields: `status: UserStatus @default(PENDING_INVITE)`, `isAdmin: Boolean @default(false)`, `hasRequestedAccess: Boolean @default(false)`, `accessRequestMessage: String?`, `accessRequestedAt: DateTime?`, plus the `redeemedInviteCode` relation.
- New enum `UserStatus { PENDING_INVITE, ACTIVE }`.
- Hand-written migration `20260508_invite_codes` per the documented pgbouncer workaround (`db execute` + `migrate resolve`):
  - `CREATE TYPE "UserStatus" AS ENUM ('PENDING_INVITE', 'ACTIVE');`
  - `CREATE TABLE "InviteCode" (...);`
  - `ALTER TABLE "User" ADD COLUMN ...;` (all five new columns)
  - `CREATE UNIQUE INDEX ON "InviteCode" ("usedById");`
  - **Backfill:** `UPDATE "User" SET status = 'ACTIVE' WHERE "createdAt" < NOW();`
  - **Admin promotion:** `UPDATE "User" SET "isAdmin" = true WHERE id = 'cmooks9ey0000ho06z65remze';`
- `@hoard/types` updates: extend `User` interface with the five new fields, export new `InviteCode` interface + `UserStatus` type.
- *(Originally planned: a `mapUser()` helper update in [apps/api/src/lib/mappers.ts](../apps/api/src/lib/mappers.ts). Skipped on contact with the codebase — there is no `mapUser` today; the auth surface uses an inline `toAuthUser()` in [apps/api/src/routes/auth.ts](../apps/api/src/routes/auth.ts), and admin endpoints don't exist yet. Adding a helper now is YAGNI; deferred until I3 surfaces actually consume it.)*

**Tests:**
- Schema-mock fixture extended with the new fields; existing tests stay green (no behavior change).
- *(Originally planned: a mapper unit test. Dropped — see scope note above; the helper doesn't exist yet, so there's nothing to round-trip.)*

**Success criteria:**
- Migration applied to production without locking out existing users (verified: Andrea + Luigi + secondary test all sign in successfully and land on dashboard).
- `npx tsx scripts/list-users.ts` shows three rows; `andreacama92@gmail.com` has `isAdmin = true` (verifiable in Prisma Studio).
- `npm run typecheck` + `npm run lint` + `npm run test` all green.
- No new behavior; all existing routes work unchanged.

---

### I2 — Auth flow + `requireActive` + redeem/request endpoints

**Goal:** new signups land in `PENDING_INVITE`. Pending users get 403 with a recognizable error code on protected routes. Two new user-side endpoints exist and work.

**Deliverables:**
- New middleware [apps/api/src/middleware/requireActive.ts](../apps/api/src/middleware/requireActive.ts): if `req.user.status !== 'ACTIVE'`, returns 403 with `{ error: 'PENDING_INVITE', hasRequestedAccess: boolean }`.

- **Exhaustive route audit (performed 2026-05-08 before implementation):** every `requireUser` consumer in `apps/api/src/routes/*` and every `'/api/...'` reference in `apps/web/src` mapped to a category. The full table is in §4 "Exhaustive route audit" of this plan.

- **Pre-auth endpoints (no JWT issued yet, so `requireActive` doesn't apply anyway — listed for completeness so the audit is bottom-up complete):** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/steam`, `GET /api/auth/steam/callback`, `GET /health`. Verified against [apps/api/src/index.ts](../apps/api/src/index.ts) and [apps/api/src/routes/auth.ts](../apps/api/src/routes/auth.ts) — no CSRF token endpoint exists (auth is JWT-cookie + CORS + SameSite, no token-fetch route to worry about).

- **Authenticated but exempt from `requireActive`:**
  - `GET /api/auth/me` (so the frontend can hydrate the welcome screen with current status)
  - `POST /api/auth/logout` (always allowed; doesn't even use `requireUser` today)
  - `POST /api/auth/redeem-invite` and `POST /api/auth/request-access` (the unblocking endpoints themselves)
  - **`DELETE /api/auth/me`** — pending users get a "leave the queue" escape hatch. They have no library data (no platforms, no UserGames); the only state to nuke is the User row + accessRequestMessage. Without this, anyone stuck pending who decides Hoard isn't for them has to email Andrea to manually delete. The destructive scope is small and bounded.

- **`requireActive` applied to every other route** that uses `requireUser` (verified via the §4 audit table). Includes `PATCH /api/auth/me` (preferences edit) and `POST /api/auth/me/wipe-library` (no library to wipe for pending users anyway, but blocked for principle).
- All three account-creation paths (`POST /api/auth/register`, Google OAuth callback, Steam OpenID callback) set `status: 'PENDING_INVITE'` on new User rows. Existing users remain ACTIVE per I1's backfill.
- Steam OpenID callback (per I-D11): on first-sign-in for a new user, redirect to `<frontend>/welcome` instead of `<frontend>/`. Active users keep the existing redirect.
- New route `POST /api/auth/redeem-invite`:
  - Body: `{ code: string }`, validated with Zod against `^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$`.
  - `prisma.$transaction`: update `InviteCode` `WHERE id = ? AND usedById IS NULL` setting `usedById` + `usedAt`; if update affects 0 rows, return 409 `{ error: 'CODE_ALREADY_REDEEMED' \| 'CODE_NOT_FOUND' }`. Otherwise update `User.status = 'ACTIVE'`. Return the fresh user object.
  - Per-IP limiter (10/hour) + per-user limiter (5/hour), production-only.
- New route `POST /api/auth/request-access`:
  - Body: `{ message?: string }`, `message` capped at 500 chars (Zod `.max(500)`).
  - Idempotent: sets `hasRequestedAccess = true`, overwrites `accessRequestMessage`, refreshes `accessRequestedAt`. Returns 200.
- `GET /api/auth/me` response gains `status`, `isAdmin`, `hasRequestedAccess` fields.
- Frontend [apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts) gets `redeemInvite(code)` + `requestAccess(message?)` methods. `me()` response type updated. `redeemInvite` invalidates user-context cache.

**Tests:**
- `redeem-invite.test.ts`: valid code → 200 + status flips to ACTIVE; already-redeemed code → 409 `CODE_ALREADY_REDEEMED`; nonexistent code → 409 `CODE_NOT_FOUND`; malformed code → 400 (Zod); double-redeem race-condition test (two parallel calls — one succeeds, one returns 409).
- `request-access.test.ts`: first call sets all three fields; second call overwrites message + refreshes `accessRequestedAt`; 500-char message accepted; 501-char rejected.
- `requireActive.test.ts`: pending user hitting `/api/games` returns 403 with the right shape; active user passes through; pending user hitting any of the four exempt routes is allowed.
- Existing route tests stay green (active users aren't affected).

**Success criteria:**
- 219 + ~12 new API tests pass.
- Manual smoke test: register a fresh test account in dev → confirm pending state → call `/api/auth/me` and see `status: 'PENDING_INVITE'` → call `/api/games` and see 403 `PENDING_INVITE` → call `/api/auth/request-access` and see the User row update in Prisma Studio.

---

### I3 — Admin endpoints

**Goal:** four admin-only API routes for user listing, code listing, code generation, and code revocation.

**Deliverables:**
- New middleware [apps/api/src/middleware/requireAdmin.ts](../apps/api/src/middleware/requireAdmin.ts): if `req.user.isAdmin !== true`, returns 404 (not 403) per I-D15.
- New router [apps/api/src/routes/admin.ts](../apps/api/src/routes/admin.ts), mounted at `/api/admin`, with the existing JWT auth middleware + `requireAdmin` applied to all routes.
- Code generator helper [apps/api/src/lib/inviteCodes.ts](../apps/api/src/lib/inviteCodes.ts): `generateCode()` produces `HOARD-XXXX-XXXX` from the 32-char alphabet via `crypto.randomInt`. Caller wraps in try/catch on `P2002`, retries up to 5 times.
- **Shared helper [apps/api/src/lib/displayIdentity.ts](../apps/api/src/lib/displayIdentity.ts)**: single source of truth for the user-facing identity string. Exports `displayIdentity(user: { email: string, steamId?: string \| null }) → string` — returns `"Steam user — {steamId}"` for synthetic-email Steam users (heuristic: `steam-*@hoard.local` pattern OR `steamId` field set with synthetic email), otherwise returns `email`. Both `GET /api/admin/users` and `GET /api/admin/invite-codes` (for the `usedBy` field) consume this helper — never duplicated. If the format ever changes, one edit updates both surfaces.
- `GET /api/admin/users`: returns all users with `id`, `email`, `name`, `status`, `isAdmin`, `createdAt`, `hasRequestedAccess`, `accessRequestMessage`, `accessRequestedAt`, redeemed code (if any), `displayIdentity` (via shared helper), and platform summary (`{ count: number, codes: PlatformCode[] }` derived from `User.platforms[]`). Sorted: pending requests first (by `accessRequestedAt` desc), then by `createdAt` desc.
- `GET /api/admin/invite-codes`: returns all codes with `code`, `note`, `createdAt`, `usedAt`, `usedBy` (`{ id, email, displayIdentity }` via shared helper if redeemed, else null). Sorted: unused first, then most-recently-used.
- `POST /api/admin/invite-codes`: body `{ note?: string }` (Zod, optional, max 100 chars). Generates + persists a new code; returns the full `InviteCode` shape.
- `DELETE /api/admin/invite-codes/:id`: deletes only when `usedById IS NULL`. Returns 409 `{ error: 'CODE_ALREADY_USED' }` otherwise.
- New types in `@hoard/types`: `AdminUser`, `AdminInviteCode`.
- `api.ts` client methods: `admin.listUsers()`, `admin.listInviteCodes()`, `admin.createInviteCode(note?)`, `admin.deleteInviteCode(id)`. Cache invalidation: create + delete invalidate `admin:invite-codes` key; nothing invalidates `admin:users` from this PR (added in I5 when "generate code for user" wiring lands).

**Tests:**
- `admin-routes.test.ts`: non-admin user hitting any `/api/admin/*` route gets 404 with **exact body `{ error: 'Not found' }`** (asserts shape match per I-D15); admin user gets the right payload shape across all four endpoints; `POST /api/admin/invite-codes` with valid note → 201 + matches regex; `DELETE` on used code → 409; `DELETE` on unused code → 204.
- `inviteCodes.test.ts`: `generateCode()` produces a string matching the regex; alphabet excludes `0`, `O`, `1`, `I`; deterministic mock of `crypto.randomInt` lets us assert exact output.
- `displayIdentity.test.ts`: synthetic-email Steam user → `"Steam user — {steamId}"`; regular email → email returned; covers null/edge cases.
- `requireAdmin.test.ts`: non-admin → 404 + canonical body; admin → next() called; missing user → 401 (auth middleware handles this before requireAdmin runs).

**Success criteria:**
- ~15 new API tests pass; existing tests stay green.
- Manual smoke test: in Prisma Studio, hit `/api/admin/users` as Andrea → returns the three users; hit it as Luigi (set `isAdmin = false` is the default) → returns 404.

---

### I4 — Welcome screen + `RequireActive` wrapper

**Goal:** pending users hitting any protected route land on `/welcome`, with the original destination preserved in `?next=`. Welcome screen has both states (default + request-sent) and works at every viewport.

**Deliverables:**
- New screen [apps/web/src/components/screens/WelcomeScreen.tsx](../apps/web/src/components/screens/WelcomeScreen.tsx) — single responsive component, design-system styled, matches `/login` aesthetic (no separate mobile file).
  - Default state: two CTAs (`[ I have a code ]`, `[ Request access ]`); inline reveal of the input or textarea on click; submit handlers; sign-out button always visible; honors `prefers-reduced-motion`.
  - Request-sent state: shown when `userContext.hasRequestedAccess === true`; copy per spec §5.2; code input always present so a late-arriving code can still be redeemed.
  - Error states: invalid format → "Code not recognized. Check for typos or ask Andrea for a new one." (with `aria-live="polite"`); 409 already-redeemed → "This code has already been redeemed."; rate-limit 429 → "Too many attempts. Try again in an hour."
  - Document title via `useDocumentTitle('hoard · welcome')`.
- New wrapper [apps/web/src/components/auth/RequireActive.tsx](../apps/web/src/components/auth/RequireActive.tsx) — sits inside `RequireAuth`, checks `userContext.status`. If pending, redirects to `/welcome?next=<encodeURIComponent(location.pathname + location.search)>`.
- New helper [apps/web/src/lib/safeNext.ts](../apps/web/src/lib/safeNext.ts) per I-D1: `safeNext(value: string | null) → string` returns the value if it passes the same-origin allowlist (must start with one `/`, must NOT start with `//`, must NOT contain `:` before the first `/`), otherwise returns `'/'`. Used by both the redemption-success navigation in `WelcomeScreen` and any other place that consumes the `next` param.
- `App.tsx` route map: `/welcome` is public-but-authenticated (`RequireAuth` wraps but `RequireActive` does not); every other authenticated route gains the `RequireActive` wrapper.
- `UserProvider`: `redeemInvite()` action that calls the API, updates context with the returned active user, then `navigate(next ?? '/')`. Cache invalidation per existing pattern.
- Steam OpenID callback redirect honesty: nothing extra on the frontend — backend already redirects pending users to `/welcome` (I2).

**Tests:**
- `WelcomeScreen.test.tsx`: default state renders both CTAs; clicking "I have a code" reveals input + Submit; clicking "Request access" reveals textarea + Send; valid code → calls `api.redeemInvite()`; invalid format → shows error without API call; 409 → shows "already redeemed"; 429 → shows rate-limit message; request-sent state shown when `hasRequestedAccess: true`.
- `safeNext.test.ts`: legitimate paths (`'/library'`, `'/library/Backlog?sort=playtime'`, `'/welcome'`) returned as-is; **open-redirect attack vectors all fall back to `'/'`**: `'//evil.com'`, `'https://evil.com'`, `'http://evil.com/path'`, `'javascript:alert(1)'`, `'\\\\evil.com'`, empty string, `null`, `undefined`, paths missing leading `/`.
- `RequireActive.test.tsx`: pending user on `/library` → redirected to `/welcome?next=%2Flibrary`; active user on `/library` → renders children; pending user on `/welcome` → renders children (no redirect loop).
- E2E: `welcome.spec.ts` — fresh signup → lands on `/welcome` with no `next` (Steam path) and with `next=/library` (deep-link path); successful redemption navigates to `next`; redemption with `next=//evil.com` navigates to `/` (open-redirect defense end-to-end check).

**Success criteria:**
- 196 + ~8 new web tests pass.
- axe-core passes on `/welcome` at desktop + mobile breakpoints (added to `a11y.spec.ts`).
- Manual smoke test: fresh test account in dev → lands on `/welcome` after sign-in → request-access flow works → second sign-in shows request-sent state → redeem a valid code (generated via Prisma Studio for now, or via I3 endpoints) → lands on `/library` (next preserved).

---

### I5 — Admin page + sidebar entry

**Goal:** `/admin` is a real, usable page for Andrea — generate codes, see who's signed up, copy a code to clipboard. Desktop-only with a mobile fallback message.

**Deliverables:**
- New screen [apps/web/src/components/screens/AdminScreen.tsx](../apps/web/src/components/screens/AdminScreen.tsx) — desktop layout per spec §7.1.
  - Top bar: `> HOARD ADMIN` title + `[refresh]` button (refetches both `users` + `invite-codes` queries).
  - `[ + GENERATE CODE ]` button: opens an inline prompt for an optional note, on confirm calls `api.admin.createInviteCode(note)`, shows a copyable callout with the new code + `[copy]` button (clipboard API + green `// copied` toast on success).
  - `// PENDING ACCESS REQUESTS (N)` section: rows of pending users with `accessRequestMessage` + relative time, and a `[ generate code for <identity> ]` button that prefills the note with the user's email/identity.
  - `// ALL USERS (N)` section: terminal-style aligned table with email, status, joined date, platform count.
  - `// INVITE CODES` section: terminal-style table; unused codes get a `[revoke]` button that calls `api.admin.deleteInviteCode(id)` after a confirm prompt.
  - `useQuery` hooks for both data sets via the shared SWR cache; `refresh` button invalidates both keys.
  - Document title via `useDocumentTitle('hoard · admin')`.
- Mobile fallback: when `useBreakpoint() === 'mobile'`, render a centered terminal-aesthetic block with the I-D3 message; no shell, no nav, link back to `/`.
- Sidebar update [apps/web/src/components/layout/Sidebar.tsx](../apps/web/src/components/layout/Sidebar.tsx): conditional `ADMIN` entry visible only when `userContext.isAdmin === true`.
- App.tsx routes: `/admin` wrapped in `RequireAuth + RequireActive`; component itself renders the 404 view for non-admin users (defensive — sidebar already hides the entry).
- New hooks: `useAdminUsers()`, `useAdminInviteCodes()` — thin wrappers over the SWR cache.
- `useDocumentTitle` and `useFocusTrap` reused for the generate-code modal.

**Tests:**
- `AdminScreen.test.tsx`: renders all three sections; `[generate code]` opens prompt, on confirm calls API and shows callout with `[copy]`; pending-request row's prefilled-note button calls API with the right note; `[revoke]` on unused code calls delete after confirm; `[refresh]` invalidates both caches.
- E2E: `admin.spec.ts` — admin user navigates to `/admin`, generates a code, copies it; non-admin user navigating to `/admin` sees the 404 view; mobile viewport at `/admin` shows the desktop-only message.
- axe-core passes on `/admin` at desktop (mobile is intentional opt-out).

**Success criteria:**
- ~10 new web tests pass; full suite green.
- Manual smoke test: as Andrea on dev → sidebar shows `ADMIN` entry → click → see the three test users → generate a code with note "test code" → see it appear in the codes list → copy to clipboard → revoke it → list updates.
- Manual smoke test: as Luigi (or any non-admin) → sidebar has no `ADMIN` entry → typing `/admin` in the URL bar shows the 404 view.

---

### I6 — Rollout, verification, doc closeouts

**Goal:** flip the closed beta on. Generate the first batch of real codes. Verify nothing regresses for existing users. Update docs.

**Deliverables (no code, all operational):**
- Confirm I1 migration applied to production via `db execute` + `migrate resolve` recipe.
- Verify on production:
  - Andrea, Luigi, secondary test all sign in cleanly and land on dashboard (not welcome).
  - `andreacama92@gmail.com` sees the `ADMIN` sidebar entry; Luigi does not.
  - Andrea generates first batch of real codes via `/admin` (one for each friend on the onboarding shortlist).
  - One end-to-end test redemption with a real friend (Marco, per spec §8) before sending the rest.
- **24-hour log monitoring window** after the first real redemption: tail Railway API logs and watch for any `403 PENDING_INVITE` response served to a user whose `status` should be `ACTIVE`. Any such hit indicates a bug in how `requireActive` reads `req.user.status` (e.g., stale JWT payload, cache miss after redemption, race between the redemption transaction commit and the next request) and warrants an immediate hot-fix. Five minutes of attention per check; check at the 1h / 6h / 24h marks. Document any incidents in the rollout entry of `docs/PLAN.md`.
- Doc closeouts:
  - [docs/PLAN.md](PLAN.md) Phase Status table — add a row for this workstream marked Done.
  - [CLAUDE.md](../CLAUDE.md) Current Phase — flip to "no active workstream" or whatever is next.
  - [AGENT.md](../AGENT.md) Key Decisions — mirror I-D2 (sidebar `isAdmin` exposure), I-D4 (column not env var), I-D10 (transaction-with-predicate redemption), I-D15 (admin 404 not 403) as decisions #34–#37 (or whichever next-numbers are free at land time).
  - [docs/ENV.md](ENV.md) — no new env vars required (we deliberately skipped `ADMIN_USER_ID` per I-D4); note absence under "deferred / not added" if convenient.
  - This file (`INVITE_CODES_PLAN.md`) — Phase Status table at bottom updated with all rows Done.
  - Followup task: rework the seed script to set sane defaults for `status` + `isAdmin` (per I-D13 side cleanup) — open a small follow-up PR after I6 lands.

**Tests:**
- N/A — verification is operational.

**Success criteria:**
- Production: existing users unaffected; new signups land in pending; admin panel works end-to-end; one real friend has redeemed a real code and is using Hoard.
- All docs current.

---

## 4. Exhaustive route audit (2026-05-08, before I2 implementation)

Every authenticated route in the API mapped against the I2 gating decision. Audit method: grep `requireUser` consumers in `apps/api/src/routes/*.ts` (every authenticated route is wrapped in this middleware) cross-referenced against every `'/api/...'` path string in `apps/web/src` (every endpoint the frontend calls).

| Route | File | I2 disposition | Reason |
|---|---|---|---|
| `GET  /health` | index.ts | pre-auth | health probe; no JWT |
| `POST /api/auth/register` | auth.ts | pre-auth | creates the JWT |
| `POST /api/auth/login` | auth.ts | pre-auth | creates the JWT |
| `POST /api/auth/logout` | auth.ts | exempt (no `requireUser` today) | always allowed |
| `GET  /api/auth/google` | auth.ts | pre-auth | OAuth init redirect |
| `GET  /api/auth/google/callback` | auth.ts | pre-auth | OAuth callback creates JWT |
| `GET  /api/auth/steam` | auth.ts | pre-auth | OpenID init redirect (also reachable from logged-in PlatformDetail; no behavioral change either way) |
| `GET  /api/auth/steam/callback` | auth.ts | pre-auth | OpenID callback creates JWT |
| `GET  /api/auth/me` | auth.ts | **exempt** | hydrates welcome screen with current status |
| `PATCH /api/auth/me` | auth.ts | gated | preferences edit; no UI for pending users |
| `DELETE /api/auth/me` | auth.ts | **exempt** | escape hatch for pending users |
| `POST /api/auth/me/wipe-library` | auth.ts | gated | no library to wipe for pending; blocked for principle |
| `POST /api/auth/redeem-invite` | auth.ts (NEW) | exempt | the unblocking endpoint itself |
| `POST /api/auth/request-access` | auth.ts (NEW) | exempt | the unblocking endpoint itself |
| `GET  /api/dashboard` | dashboard.ts | gated | core app surface |
| `GET  /api/games` | games.ts | gated | library list |
| `GET  /api/games/counts` | games.ts | gated | sidebar counts |
| `GET  /api/games/shelves` | games.ts | gated | per-shelf endpoint |
| `GET  /api/games/:id` | games.ts | gated | game detail |
| `PATCH /api/games/:id` | games.ts | gated | edit notes/status |
| `POST /api/games/:id/remap` | games.ts | gated | remap UI |
| `POST /api/games/manual` | platforms.ts | gated | manual add |
| `GET  /api/upcoming` | upcoming.ts | gated | wishlist DB feed |
| `POST /api/upcoming/:igdbId/wishlist` | upcoming.ts | gated | wishlist toggle |
| `GET  /api/releases/recent` | releases.ts | gated | recent releases page |
| `GET  /api/stats` | stats.ts | gated | stats page |
| `GET  /api/igdb/search` | igdb.ts | gated | search overlay |
| `GET  /api/igdb/upcoming` | igdb.ts | gated | upcoming feed |
| `GET  /api/platforms/status` | platforms.ts | gated | sidebar platform status |
| `GET  /api/platforms/:code/credentials` | platforms.ts | gated | reveal NPSSO etc. |
| `GET  /api/platforms/:code/log` | platforms.ts | gated | platform log tab |
| `PATCH /api/platforms/:code` | platforms.ts | gated | sync frequency picker |
| `POST /api/platforms/:code/sync` | platforms.ts | gated | manual sync |
| `DELETE /api/platforms/:code` | platforms.ts | gated | disconnect |
| `POST /api/platforms/psn/connect` | platforms.ts | gated | PSN connect |
| `POST /api/platforms/xbox/connect` | platforms.ts | gated | Xbox connect |
| `GET  /api/admin/*` | admin.ts (I3) | gated + `requireAdmin` | not part of I2; reserved here for completeness |

Frontend-only (no API call): `/api/auth/steam` is *also* hardcoded as a hyperlink target in [LoginScreen.tsx](../apps/web/src/components/screens/LoginScreen.tsx) and `PlatformDetailDesktop/Mobile.tsx` — same backend route as above; no extra gating concerns since the user navigates away to Steam OpenID before the JWT (if any) matters.

---

## 3. Out of scope (mirror of spec §9 + new additions)

- Email notifications on access requests (v2: Resend integration).
- Code expiry (`expiresAt` field — easy to add later).
- Bulk code generation (the "generate N codes" button — wait until beta exceeds ~20 testers).
- Explicit rejection of access requests (silent rejection is functionally identical for v1).
- Audit log of admin actions (only one admin; `InviteCode.createdAt` is sufficient).
- Demoting an active user back to pending (manual Supabase row edit if ever needed — I-D8).
- Multi-admin support (still v2; the column is in place but only one row will ever have it `true` for v1).
- Mobile parity for `/admin` (I-D3 — desktop-only).

---

## 4. Phase status

| PR | Status | Notes |
|---|---|---|
| Pre-step — delete seed-andrea + daniel.guernieri | Pending | Run [scripts/delete-users.ts](../scripts/delete-users.ts) with both ids appended to its history block; verify with `scripts/list-users.ts`. |
| I1 — Schema + migration | Pending | Hand-written migration via `db execute` + `migrate resolve`. Backfills three users to ACTIVE; flips Andrea's `isAdmin` to true. |
| I2 — Auth + middleware + redeem/request endpoints | Pending | New users → PENDING_INVITE; pending users → 403 PENDING_INVITE on protected routes; redeem + request-access endpoints; rate limits per I-D6. |
| I3 — Admin endpoints | Pending | Four routes under `/api/admin`, `requireAdmin` returns 404 on miss (I-D15). Code generator with retry-on-collision. |
| I4 — Welcome screen + RequireActive | Pending | `/welcome?next=…` route + responsive single-component screen; default + request-sent states; axe-core extended. |
| I5 — Admin page + sidebar entry | Pending | Desktop-only `/admin`; sidebar entry conditional on `isAdmin`; mobile fallback message. |
| I6 — Rollout + verification + doc closeouts | Pending | Generate first batch of real codes, verify with one friend, update PLAN/CLAUDE/AGENT/this file. |

> Update this table as PRs land. Use: `In progress`, `Done`, `Blocked (reason)`.
