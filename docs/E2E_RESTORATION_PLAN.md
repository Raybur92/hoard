# Hoard — E2E Suite Restoration

> **Workstream:** restore the Playwright E2E suite to a meaningful, deterministic, prod-isolated state.
>
> **Status:** Scoped 2026-05-08, opened in parallel with the closed-beta invite-codes I-series. **Held at step 2 — strategy decision awaits Andrea's input. No test code written yet.**
>
> **Trigger:** I1's pre-step deletion of the seed-andrea row broke the dev-fallback auth path that the existing E2E suite leans on. Symptom surfaced when I4 declined to write `welcome.spec.ts` — that decision was right at the I4 boundary, but living without E2E is not an acceptable steady state.
>
> **Naming:** E1 is the first PR in this workstream. E2, E3 etc. follow if needed once the strategy lands.

---

## 1. Diagnosis (step 1, complete)

**What's broken.** Running `npm run test:e2e` on `main` at commit `e8ca975` produces:

| Suite | Result | Root cause |
|---|---|---|
| `tests/e2e/a11y.spec.ts` (12 tests, 6 routes × 2 viewports) | **All 12 PASS** — but for the wrong reason. `axe-core` scans whatever DOM is rendered; with the auth chain redirecting to `/login`, the "Dashboard / Library / Releases / Game Detail / Settings" tests are all running axe against the login screen. False positives. |
| `tests/e2e/screens.spec.ts` (38 tests across 19 specs × 2 viewports) | **All 38 FAIL** with timeouts (`element(s) not found` after 5–6.5 s). Specific assertions: `.bignum`, `Hollow Knight: Silksong`, "all 6 shelves", HLTB hint, etc. — all looking for content that doesn't render because the route redirected to `/login`. |

**Failure-mode trace.** The chain is:

1. Playwright hits `http://localhost:5173/` (or any other authed route).
2. Browser sends request without a session cookie.
3. Vite proxies API calls to `localhost:3001`. `requireUser` middleware sees no cookie. In dev (`NODE_ENV !== 'production'`), it falls back to `req.userId = process.env.DEV_USER_ID ?? 'seed-andrea'`.
4. **`seed-andrea` was deleted in I1's pre-step** (commit `38098e2`, 2026-05-08).
5. `requireActive` middleware (added in I2, commit `702f493`) does `prisma.user.findUnique({ where: { id: req.userId } })`, gets `null`, returns `401 Unauthenticated`.
6. Frontend `RequireAuth` sees `/api/auth/me` 401 → `<Navigate to="/login">`.
7. Browser is now on `/login`. axe-core scans it and finds it accessible (true). Content assertions for the dashboard fail (also true).

**Why it didn't surface before I-series.** Pre-I2 there was no `requireActive`. The dev fallback's nonexistent `seed-andrea` userId still caused `requireUser` to set `req.userId`, but downstream routes just queried for that user's data, got empty results, and returned `[]`/`{}`. Tests that asserted on specific seeded games (`Hollow Knight: Silksong`) were already failing — but `a11y.spec.ts` didn't notice because empty-state pages are also accessible. The I2 `requireActive` 401 escalated the failure from "empty content" to "wrong screen entirely."

**Other E2E artifacts also broken in adjacent ways.**
- Visual snapshot baselines (`tests/snapshots/*.png`) were captured against a populated dashboard — they'll never match a `/login` capture.
- `playwright.offline.config.ts` (the offline-mode E2E) likely has the same auth path and is similarly broken; not verified in this diagnostic but presumed.

---

## 2. Strategy decision (step 2, OPEN — awaiting Andrea)

The core question: **what data does E2E run against?** The answer cascades to CI complexity, secrets, and per-test fixture patterns.

Five candidate options, scored across the four dimensions Andrea called out (cost / CI complexity / schema parity / secrets management) plus one I'd add (developer ergonomics for local runs).

### Option A — Point `DEV_USER_ID` at Andrea's real `User` row.

The minimum-viable fix: set `DEV_USER_ID=cmooks9ey0000ho06z65remze` in `apps/api/.env`. E2E runs against Andrea's actual closed-beta data.

| Dimension | Score |
|---|---|
| Cost | $0 |
| CI complexity | None — env var only |
| Schema parity | Perfect (same DB) |
| Secrets management | None new; same `DATABASE_URL` |
| Local ergonomics | Dev runs hit prod data — already true today |
| **Risk** | **High.** Tests assert on Andrea's evolving real data ("Hollow Knight: Silksong"). They'll break when she stops playing it. A destructive test (or a refactor that introduces one) could mutate her data. CI runs hit prod DB on every PR. |

**Verdict:** Worst of both worlds — fragile *and* prod-coupled. Disqualified.

### Option B — Provision a dedicated `hoard-test` Supabase project.

The "originally planned but proven unnecessary" project mentioned in CLAUDE.md hard rule 7. Un-prove it for E2E specifically: keep unit tests mocking Prisma, but route E2E DATABASE_URL at a separate Supabase project with seeded fixtures.

| Dimension | Score |
|---|---|
| Cost | $0 (Supabase free tier) up to 500 MB / 50k rows. Closed-beta E2E far below. Risk: free tier inactivity-pause, kicking in mid-CI run — needs a periodic ping or paid plan. |
| CI complexity | Moderate — `DATABASE_URL_TEST` secret in GitHub Actions; new env loaded for E2E only; migrations need to apply to both projects on every schema change. |
| Schema parity | Strong if migrations are applied to both. Drift hazard if test project lags (e.g. someone forgets to run migrations against test). |
| Secrets management | New: `DATABASE_URL_TEST` in `.env.test` (gitignored), GitHub Actions secret, possibly Vercel preview env. |
| Local ergonomics | Developer runs E2E against test DB by default. Reset-on-run via `prisma migrate reset --force` with seed re-application. Snapshots stable. |
| **Risk** | Medium. Migration drift is the main one. Solvable via a CI job that fails if `prisma migrate status` against `DATABASE_URL_TEST` shows pending migrations. |

**Verdict:** Most robust long-term. Real upfront work (~half-day to provision + seed + wire CI). Pays back forever.

### Option C — Single Supabase project, separate schema (`test` schema in same DB).

Hoard's existing Supabase project already has the prod data in the `public` schema. Add a `test` schema, target it for E2E via Prisma's `schema` URL param (`?schema=test`).

| Dimension | Score |
|---|---|
| Cost | $0 — same project, same connection pool. |
| CI complexity | Low — same `DATABASE_URL` with a `?schema=test` suffix variant. |
| Schema parity | Strong — same physical DB, schema cloned via migration replay. |
| Secrets management | None new. |
| Local ergonomics | Developer runs E2E with a different connection string. Reset is `DROP SCHEMA test CASCADE; CREATE SCHEMA test;` + migrate. |
| **Risk** | Real. (1) Pgbouncer transaction-mode (already a known gotcha) interacts with multi-schema sessions in ways that may or may not be reliable. (2) A test that forgets the `?schema=test` config writes to `public`, contaminating prod. (3) Both schemas share the same connection pool — a test bug could DOS Andrea's normal usage. |

**Verdict:** Cheaper than B but the "wrong default schema" failure mode is severe. Blast radius hits prod.

### Option D — Playwright `globalSetup`/`globalTeardown` minting + reaping rows in prod DB.

Use the prod DB but namespace test rows (`e2e-{timestamp}@hoard.test`, `cuid` prefixed `e2e-...`). Setup creates fixtures; teardown deletes them.

| Dimension | Score |
|---|---|
| Cost | $0 |
| CI complexity | Low |
| Schema parity | Perfect (same DB) |
| Secrets management | None new |
| Local ergonomics | Reasonable when working; brittle when not. |
| **Risk** | **Andrea explicitly rejected this in the I4 deferral note.** Pollution of prod `User` table on every CI run. If teardown crashes (test panics, CI cancels mid-run, network hiccup), test rows leak. The closed-beta admin panel would show e2e ghosts. |

**Verdict:** Disqualified per Andrea's standing call.

### Option E — Playwright `page.route(...)` API mocks.

Each test intercepts API calls and serves canned JSON. Zero DB involvement.

| Dimension | Score |
|---|---|
| Cost | $0 |
| CI complexity | Low |
| Schema parity | N/A (no DB) |
| Secrets management | N/A |
| Local ergonomics | Excellent — fully deterministic |
| **Risk** | E2E becomes "frontend integration tests." Doesn't exercise the actual API code path that production users hit. Maintenance burden: every API endpoint a test touches needs a mock. Defeats much of the point of E2E vs the existing vitest suite. |

**Verdict:** Right tool for some tests (`welcome.spec.ts`'s flow-only assertions), wrong tool for `screens.spec.ts`'s content-rendering assertions.

### Option F — Hybrid (recommended starting point).

Split the suite by what each test actually proves:
- **Content-asserting tests** (`screens.spec.ts`'s "shows game count," "Hollow Knight: Silksong," visual snapshots) → **Option B** dedicated test DB with deterministic seed (3 fixed users + a dozen fixed games).
- **Flow / state-machine tests** (`welcome.spec.ts`, navigation tests, redirect tests, open-redirect defense) → **Option E** API mocks via `page.route(...)`.

| Dimension | Score |
|---|---|
| Cost | $0 — Option B's free tier. |
| CI complexity | Moderate — Option B's migration discipline applies; mocks in Option E are per-test config. |
| Schema parity | Strong (B for content) / N/A (E for flows). |
| Secrets management | One new secret (`DATABASE_URL_TEST`) for the B portion. |
| Local ergonomics | Good — devs run `test:e2e` and get both flavors transparently. |
| **Risk** | Two patterns to maintain. New contributors need to know which to use. Mitigation: test-file naming convention (`*.flow.spec.ts` for mocked, plain `*.spec.ts` for DB-backed) + a one-screen guide in CONTRIBUTING. |

**Verdict:** Most flexible. Splits the upfront cost (mocked welcome.spec.ts can ship before B is provisioned) and defers as much DB work as possible to where it's actually needed.

---

## 3. Recommendation (LOCKED 2026-05-09 — Andrea confirmed Option F with refinements below)

### 3.1 — The right framing: what does each test uniquely prove?

The "content vs flow" split that originally framed Option F was a reasonable first cut but the wrong axis. The sharper question is what each test *uniquely proves* relative to the layers below it.

- **Mocked tests (Option E flavor)** prove: a React component reacts correctly to API responses. Error rendering, state transitions, form validation. Most of this is essentially component-test territory — vitest + Testing Library can cover it without Playwright at all, and `WelcomeScreen.test.tsx` + `LoginScreen.test.tsx` already do.
- **Real-test-DB tests (Option B flavor)** prove: the actual end-to-end integration pipeline works. Real backend issues a real JWT, real cookie lands, real `RequireAuth` reads the real session, real `RequireActive` checks real status, real frontend renders against real data. **This is where integration bugs hide** — exactly like the deep-link `?next=` bug shipped in `5024234`, "fixed," and then actually fixed in `9051b36`. Unit tests passed throughout because they injected `?next=` directly into MemoryRouter URLs; the integration gap (RequireAuth's redirect target not actually carrying the param) was invisible until smoke #3 in production.

By that criterion, mocking should be the *exception* in E2E, not the default. Mocking `/api/auth/redeem-invite` and `/api/auth/me` for welcome-flow tests erases the surface where bugs hide. Mocking the pure state-machine logic of "default panel → request-sent panel" is fine; mocking "register → cookie lands → context updates → RequireActive redirects → welcome renders" defeats the purpose of having E2E at all.

### 3.2 — Refined split: ~30% mocked / ~70% real-DB

Rebalanced from the original implicit 50/50:

- **Real test DB (~70%)**: every test that exercises an actual auth/session/redirect path, every test that asserts on rendered content from a real query, every visual snapshot. This includes most of `welcome.spec.ts` (the integration-pipeline cases Andrea specifically called out at I4) and all of `screens.spec.ts`.
- **Mocked (~30%)**: targeted at pure UI state-machine assertions where a real backend adds setup cost without proving anything new. Example: "rate-limit error message renders correctly when API returns 429" — the API call shape is well-defined, what's being verified is the UI's reaction. Anything that could equivalently be a vitest component test is a candidate.

The split isn't a quota — it's a guideline for the question "should this be an integration spec or a component spec?" Default to integration; reach for mocks only when the integration adds setup without adding signal.

### 3.3 — Data parity is NOT schema parity (limitation worth acknowledging)

Option B's deterministic seed (3 users + a dozen games) gives perfect schema parity but only synthetic data parity. A real prod bug only manifesting when the user has 745 games (Andrea), or a particular IGDB metadata edge case, or a sync history with specific dates — none of those are exercised by a clean seed. **vitest remains the primary regression-prevention layer**; E2E is integration-pipeline verification, not comprehensive coverage. The seed should be small and stable (~12 games is right), with edge-case scenarios (large libraries, tricky metadata, malformed sync data) captured as targeted unit tests against fixtures or as one-off integration tests when an actual bug surfaces. Don't grow the seed reactively — it becomes a maintenance tax on every migration.

### 3.4 — Locked secondary decisions

- **Free tier with keepalive.** Supabase free tier is fine for the test DB. Auto-pause after 7 days of inactivity is mitigated by a tiny GitHub Action that runs nightly against the test DB (`SELECT 1` is enough). Cheaper than $25/mo and more honest — if the test DB is so unused it's pausing, that itself is signal worth seeing.
- **`DATABASE_URL_TEST` lives in two places only.** GitHub Actions secret + local `.env.test` (gitignored). NOT in Vercel preview env — E2E doesn't run there, no reason to widen the secret's blast radius.
- **A11y false-positive fix lands in E1, not E3.** Twelve tests passing for the wrong reason is actively misleading; "restoring the suite" must include un-breaking the parts that were already broken, not deferring them. See §4 below.

### 3.5 — Naming convention: signal isolation level, not test subject

Test files signal *what isolation level they run at*, not *what feature they cover*. Renaming files later is annoying; getting it right at the start is the cheap move.

- `*.integration.spec.ts` — DB-backed; runs against the test Supabase project; exercises the real auth/session/data pipeline. **Default for new E2E tests.** Existing `screens.spec.ts` becomes `screens.integration.spec.ts` in E1.
- `*.component.spec.ts` — Mocked via `page.route(...)`; no DB; pure UI-reaction assertions. Reach for this only when a real backend adds setup without adding signal.

Per-file pattern goes alongside a one-screen guide in `CONTRIBUTING.md` (or wherever appropriate) so future contributors pick the right pattern by default.

---

## 4. PR sequence

§3 is locked; PR specifics below are scoped against Option F with the §3 refinements. Scope-locking only — actual PR drafts wait for Andrea's review of this revision before E1's deliverables get written up in detail.

### E1 — Restoration foundation (sole PR; everything below ships together because they're load-bearing for each other)

**Infrastructure**
- Provision the dormant `hoard-test` Supabase project. Free tier; same EU West region as prod for consistent latency.
- Add `DATABASE_URL_TEST` to two places only: GitHub Actions secrets + `.env.test` (gitignored, locally). NOT in Vercel preview env.
- New nightly keepalive: `.github/workflows/test-db-keepalive.yml` runs `SELECT 1` against the test DB once a day so Supabase's free-tier 7-day inactivity-pause never bites mid-CI.
- Apply the prod migration history to the test project via the documented `db execute` + `migrate resolve` recipe. New CI step: `prisma migrate status --schema packages/db/prisma/schema.prisma` against `DATABASE_URL_TEST` fails the build if a migration is pending — catches drift between prod and test.
- Wire `DATABASE_URL_TEST` into `playwright.config.ts`'s `webServer` for the API process (E2E `dev:api` reads test DB; local dev still reads prod DB via `DATABASE_URL`).

**Seed**
- New `packages/db/prisma/seed-e2e.ts` — small, stable, deterministic. Three users matching closed-beta shape (1 admin, 1 active, 1 pending-with-request), a dozen games, a handful of platforms with known-state. Run on every E2E suite invocation via `prisma migrate reset --force && prisma db seed -- --e2e` (or equivalent).
- Seed deliberately stays minimal per §3.3 — vitest carries comprehensive coverage; the seed exists only to back integration-pipeline assertions.

**Auth setup that fails loudly (folded-in a11y fix)**
- Replace per-test cookie-or-no-cookie assumptions with a global Playwright fixture that authenticates each test before its first navigation. The fixture reads which test user the spec wants (default = ACTIVE seed user; opt-in to PENDING_INVITE or new-signup via per-test override) and lands the session cookie via direct `POST /api/auth/login` against the test backend.
- **Each spec asserts the URL it ended up on matches the URL it expected to load before the test body runs.** Replaces the per-axe-scan URL check with one global assertion. Misroutes (auth chain redirected somewhere unexpected, mid-test navigation drifted) fail loudly at the navigation step instead of producing false-positive accessibility passes.
- This is the "a11y false-positive fix" that was previously E3 — folded into E1 because shipping a "restored" suite where 12 tests still pass for the wrong reason is misleading. Restoring means working correctly, not just running.

**Existing-spec migration**
- Rename `screens.spec.ts` → `screens.integration.spec.ts`. Same applies to `a11y.spec.ts` → `a11y.integration.spec.ts`. Naming signals isolation level per §3.5.
- Fix assertions that depended on Andrea's evolving real data. "Hollow Knight: Silksong" → a seeded title (or, where the assertion's intent is "any backlog game shows," loosen to a regex/structural check).
- Regenerate `tests/snapshots/*.png` baselines against the new deterministic seed. **Explicit deliverable** — without this E1 ships with red snapshot tests on day one and the suite gets "always rerun" status. Snapshot drift erodes the value of snapshots; we fix it now or never.

**Documentation**
- One-screen guide in `CONTRIBUTING.md` (or `apps/web/tests/e2e/README.md`): when to write `*.integration.spec.ts` (default), when to write `*.component.spec.ts` (UI-reaction assertions where the integration adds setup without adding signal), how the global auth fixture works, how to reset the seed during local iteration.

**Success criteria**
- All renamed `*.integration.spec.ts` files pass against the test DB.
- Visual snapshots are stable across reruns.
- a11y suite catches a deliberately-introduced misroute (e.g. a temporarily-broken `RequireAuth`) and fails — not silently passes.
- CI runtime stays under whatever the current E2E budget is (probably worth profiling before adding the keepalive overhead, but this is a Day 2 problem).

### E2 — Reinstate `welcome.spec.ts`

Mostly an integration spec under the new convention; one targeted component spec for the pure UI states.

- **`welcome.integration.spec.ts`** — backed by the test DB, four cases per `INVITE_CODES_PLAN.md` I4:
  - fresh signup → `/welcome` (no `next` and with `next=/library`)
  - successful redemption navigates to `next`
  - redemption with `next=//evil.com` → `/` (open-redirect defense end-to-end against the real `safeNext` + real `RequireActive`)
  - request-access → received-code-immediately → redeem flow (friction-free)
  - Each test registers a fresh user via `POST /api/auth/register` against the test API, exercises the real welcome flow, asserts URL transitions, cleans up via `DELETE /api/auth/me` in an `afterEach`. Cleanup runs against the test DB, never prod.
- **`welcome-error-states.component.spec.ts`** (smaller) — pure UI-reaction assertions where a real backend adds setup without adding signal: distinct error copy per `RedeemInviteError` code (INVALID_FORMAT vs CODE_NOT_FOUND vs CODE_ALREADY_REDEEMED vs RATE_LIMITED), the textarea's 500-char silent truncation, the request-sent state's persistence across reloads. `page.route(...)` mocks the API; the test verifies the UI's reaction. The unit-level coverage in `WelcomeScreen.test.tsx` already gets most of this; this spec is the integration-level companion that proves the same assertions hold when the UI is mounted in a real browser, not jsdom.

---

## 5. Out of scope (don't reopen)

- **Pointing `DEV_USER_ID` at Andrea's real row** (Option A) — fragile + prod-coupled, disqualified.
- **Letting tests pollute the prod `User` table** (Option D) — Andrea's standing rejection from the I4 deferral note.
- **Fully replacing `screens.integration.spec.ts` with mocks** (Option E alone) — defeats the point of E2E for content rendering.
- **Migrating to a different test framework** (Cypress, etc.) — Playwright is fine; this is a data/auth strategy problem, not a tooling problem.
- **Per-test URL assertions** as the a11y false-positive fix — band-aid; the real fix is a global auth fixture that asserts each spec lands on the URL it expected to load (in E1's auth-setup deliverable).
- **Growing the seed reactively** — bug surfaces, add it to the seed, repeat → seed bloats and becomes a maintenance tax on every migration. Targeted unit tests against fixtures + one-off integration tests for actual prod bugs are the right answers (per §3.3).
- **Free-tier paid upgrade** (yet) — keepalive Action makes inactivity-pause moot. If a real reason emerges (E2E run frequency outpaces free-tier quotas), revisit.

---

## 6. Status

| Step | State | Notes |
|---|---|---|
| 1 — Diagnose | Done | Captured in §1. |
| 2 — Strategy decision | **Done (2026-05-09, Andrea confirmed Option F + 5 refinements)** | See §3.1–§3.5 for the locked rationale and §3.4 for secondary decisions (free tier + keepalive, secret locations, a11y fix in E1). |
| 3 — E1 PR plan drafts (concrete deliverables) | **Open — awaits Andrea's review of this revision** | When confirmed, deliverables under each §4 E1 sub-bullet get expanded into PR-shaped specifics (commit-grouping, file-by-file changes, test counts, manual verification list). Hold per Andrea's "review before drafting" instruction. |
| 4 — E1 implementation | Pending | After step 3. |
| 5 — E2 (welcome.integration.spec.ts + welcome-error-states.component.spec.ts) | Pending | After E1 lands. |
