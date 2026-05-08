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

## 3. Recommendation

**Option F (hybrid) — starting with Option E for `welcome.spec.ts` and Option B for `screens.spec.ts`.**

Rationale:
1. Welcome flow tests are the most-asked-for missing coverage right now (deferred at I4); they're the most amenable to Option E mocks (predictable error responses, deterministic state transitions).
2. `screens.spec.ts` is the largest existing investment; it specifically asserts on rendered content that requires real data.
3. The 50/50 split lets Option E land first as a small PR, while Option B's infrastructure work happens on its own track.
4. Option B alone is also defensible if you want the simpler one-pattern story; it just delays welcome E2E by however long Supabase provisioning + seed takes.

**This is the decision point. Pick a strategy before the implementation PRs (E1+) start.** The strategy locks the seed-data model, the secret-management story, and the test-file naming convention.

---

## 4. PR sequence (sketched, NOT to be drafted until §3 lands)

The following is contingent on the §3 decision; specifics get rewritten once a strategy is picked.

### E1 — Restoration foundation
- If Option B/F: provision the test DB, write the seed script (3 users matching closed-beta state + a dozen games, all ACTIVE), wire `DATABASE_URL_TEST` into Playwright config.
- If Option E only: scaffold `page.route(...)` helper utilities and the canned-response fixtures.
- Either way: fix the existing `screens.spec.ts` assertions that depend on Andrea's evolving real data ("Hollow Knight: Silksong" → seeded equivalent or platform-only assertions).
- Update `tests/snapshots/*.png` baselines against the new deterministic data.
- Document the strategy in `CONTRIBUTING.md` (or wherever appropriate) so future tests use the right pattern.

### E2 — Reinstate `welcome.spec.ts`
- Cover the four cases drafted in `INVITE_CODES_PLAN.md` I4 §Tests:
  - fresh signup → `/welcome` (no `next` and with `next=/library`)
  - successful redemption navigates to `next`
  - redemption with `next=//evil.com` → `/` (open-redirect defense)
  - request-access → received-code-immediately → redeem flow (friction-free)
- Implementation flavor depends on strategy:
  - Option E: `page.route(...)` to mock `/api/auth/me`, `/api/auth/redeem-invite`, `/api/auth/request-access` per scenario.
  - Option B: register fresh user (against test DB), exercise welcome screen, assert URL transitions, clean up via `DELETE /api/auth/me` in `afterEach`.

### E3 (optional) — fix the a11y false-positive
- The current `a11y.spec.ts` "passes" by scanning login. Add an assertion before each axe scan that the rendered route actually matches what's expected (e.g. `expect(page.url()).toContain('/library')` before scanning `/library`).
- Or restructure so the auth setup guarantees an authenticated session and the assertions catch unintended redirects loudly.

---

## 5. Out of scope (don't reopen)

- **Pointing `DEV_USER_ID` at Andrea's real row** (Option A) — fragile + prod-coupled, disqualified above.
- **Letting tests pollute the prod `User` table** (Option D) — Andrea's standing rejection from the I4 deferral note.
- **Fully replacing `screens.spec.ts` with mocks** (Option E alone) — defeats the point of E2E for content rendering.
- **Migrating to a different test framework** (Cypress, etc.) — Playwright is fine; this is a data/auth strategy problem, not a tooling problem.

---

## 6. Status

| Step | State | Notes |
|---|---|---|
| 1 — Diagnose | Done | Captured above. |
| 2 — Strategy decision | **Open — awaits Andrea** | Recommendation: Option F. |
| 3 — Restore screens.spec.ts | Pending | Drafts after §2 lands. |
| 4 — Reinstate welcome.spec.ts | Pending | Drafts after §2 lands. |
| 5 — Fix a11y false-positive | Pending (optional) | Could fold into E1 or be a small follow-up. |
