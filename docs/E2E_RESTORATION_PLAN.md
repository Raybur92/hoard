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

### 3.6 — Auth fixture mechanism: per-test expected-URL declaration (recommended; pending Andrea's review)

Two candidate mechanisms for the global auth fixture that lands the a11y false-positive fix from §3.4:

**Option α — convention-based inference.** The fixture infers the expected URL from the spec file path (e.g. `tests/e2e/library.integration.spec.ts` → `/library`) or from the spec's first `page.goto()` call (intercept it, capture the URL, assert post-navigation matches).

| Pro | Con |
|---|---|
| Less repetition — declaration once, by convention | Inference rules are silent — when wrong, the fixture asserts the wrong thing without flagging it |
| Easier to scaffold a new spec | Couples test files to filesystem layout; rename or restructure breaks the implicit mapping |
| | Defeats the entire point of the a11y fix (failing loudly on misroute) — if the convention silently maps the wrong URL, the false positive returns under a new mask |

**Option β — per-test expected-URL declaration (recommended).** Each spec explicitly declares the URL it expects to land on via `test.use({ expectedUrl })`. The fixture authenticates the user, the spec calls `page.goto(...)` in its own `beforeEach`, and the fixture's `afterEach` (or an inline `expect(page).toHaveURL(...)`) confirms the post-auth URL matches the declaration. Mismatch → test fails immediately.

| Pro | Con |
|---|---|
| Explicit at every test site — contract is visible, hard to drift | Verbose — every spec file carries the declaration |
| Mismatches fail loudly (the whole point of the fix) | One extra line per spec |
| Survives file renames and restructures | |
| Decoupled from filesystem |  |

**Recommendation: Option β (per-test declaration).** The single-line cost per spec is trivial; the explicitness directly protects the property the fixture exists to enforce. Implicit inference is exactly the shape of the original bug ("RequireAuth used router state instead of URL query — silent mismatch between channel and consumer"); we already paid for the lesson, don't repeat it.

**Implementation sketch** (full code lands in E1):

```ts
// apps/web/tests/e2e/fixtures.ts
import { test as base, expect } from '@playwright/test';

type ExpectedUrl = string | RegExp;

export const test = base.extend<{ expectedUrl: ExpectedUrl }>({
  expectedUrl: ['', { option: true }],
});

test.beforeEach(async ({ page, expectedUrl }, testInfo) => {
  if (!expectedUrl) {
    throw new Error(
      `[${testInfo.title}] expectedUrl is required. Add ` +
      `test.use({ expectedUrl: '/your-route' }) at the top of the spec.`,
    );
  }
  // Authenticate against the test backend by issuing a real
  // POST /api/auth/login — sets the session cookie on `page.context()`.
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'e2e-active@hoard.test', password: process.env['E2E_TEST_PASSWORD'] ?? '' },
  });
  if (!res.ok()) throw new Error(`E2E auth failed: ${res.status()}`);
});

test.afterEach(async ({ page, expectedUrl }) => {
  // After the spec's own beforeEach has navigated, assert the URL
  // matches what the test expected — catches misroutes (auth chain
  // redirected somewhere unexpected, mid-test drift) loudly.
  if (expectedUrl) await expect(page).toHaveURL(expectedUrl);
});
```

```ts
// In a spec file:
import { test } from './fixtures';

test.use({ expectedUrl: /\/library/ });

test.describe('Library /library', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/library'); });
  test('shows all 6 shelves', async ({ page }) => { ... });
});
```

If the test fixture or the navigation drifts, the `afterEach` fails the test on the next run — surfaces as `expected URL '/library', got '/login'` rather than `axe-core scanned login screen and reported it accessible (true)`.

### 3.7 — Keepalive Action specifics (recommended; pending Andrea's review)

**Cron expression: `0 4 * * *` (daily at 04:00 UTC).** Reasoning: Supabase free-tier auto-pauses after 7 days of inactivity. Daily run keeps the connection-touched-recently signal at <24h with a 6-day buffer for when the Action itself fails. 04:00 UTC chosen for low-traffic — won't collide with Andrea's typical work hours, won't compete with deploy windows, and GitHub Actions queues are emptier overnight (faster cold-start).

**What the Action does.** Single `psql -c "SELECT 1"` against `DATABASE_URL_TEST` via the `postgres` client image. Total runtime ~3 seconds. Output captured for the failure-mode handler.

**Failure-mode behavior: open or comment on a single canonical issue.** On Action failure, `gh issue create` (or `gh issue comment` if the canonical issue exists) labeled `infra:test-db`. Single issue titled `[infra] test-db keepalive failing` gets re-opened or commented on across runs — keeps the noise level bounded (no daily issue spam) while making failures visible. Contrast with: paging someone (overkill for a single-user hobby tool, no on-call rotation), logging silently (the original problem we're trying to avoid), failing the workflow without surfacing (would only get noticed on next E2E run, by which point the DB might have paused).

**Recovery path if pause-on-inactivity bites despite the keepalive.** Two-layer:

1. **Action-level retry-with-backoff.** The keepalive Action itself runs the `SELECT 1` in a 3-attempt retry loop with 30-second sleeps between (a Supabase pause includes a brief warm-up window after first hit; second attempt usually succeeds). If all 3 fail, the canonical issue gets opened/commented.
2. **E2E-level connect retry.** Playwright's `webServer` config has `timeout: 120_000` (existing); when CI hits a paused test DB, the API process fails to boot, Playwright surfaces the timeout, CI fails the PR loudly. The PR queue blocks until `infra:test-db` is closed — manual recovery is "open Supabase dashboard, hit unpause, re-run CI." Documented in the PR-template's "if E2E fails on connect" section that E1 also writes.

Manual unpause is the only resort if both retry layers fail (the project is genuinely stuck) — no auto-retry-forever (that masks problems), no PR-queue bypass (can't merge against a half-broken DB).

**Concrete file at E1 implementation time:**

```yaml
# .github/workflows/test-db-keepalive.yml
name: test-db-keepalive
on:
  schedule:
    - cron: '0 4 * * *'  # daily 04:00 UTC; Supabase free tier pauses after 7d of inactivity
  workflow_dispatch:      # manual trigger for emergency unpause
permissions:
  issues: write           # to open/comment on the canonical issue on failure
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping test DB (3 attempts, 30s backoff)
        env:
          DATABASE_URL_TEST: ${{ secrets.DATABASE_URL_TEST }}
        run: |
          for attempt in 1 2 3; do
            if psql "$DATABASE_URL_TEST" -c "SELECT 1" > /dev/null 2>&1; then
              echo "✓ test DB is awake (attempt $attempt)"
              exit 0
            fi
            echo "× attempt $attempt failed, retrying in 30s..."
            sleep 30
          done
          echo "::error::test DB ping failed after 3 attempts"
          exit 1
      - name: Open or update canonical issue on failure
        if: failure()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          existing=$(gh issue list --label 'infra:test-db' --state open --json number --jq '.[0].number' || true)
          if [ -n "$existing" ]; then
            gh issue comment "$existing" --body "Keepalive failed at $(date -u +%Y-%m-%dT%H:%M:%SZ). Run: ${{ github.run_url }}"
          else
            gh issue create \
              --title '[infra] test-db keepalive failing' \
              --label 'infra:test-db' \
              --body 'Test DB keepalive Action failed. Check Supabase dashboard; manual unpause may be needed.'
          fi
```

---

## 4. PR sequence

§3 is locked; PR specifics below are scoped against Option F with the §3 refinements. Scope-locking only — actual PR drafts wait for Andrea's review of this revision before E1's deliverables get written up in detail.

### E1 — Restoration foundation

Single PR; the five commits below are load-bearing for each other but each lands a coherent unit so a partial revert (e.g. baselines need re-baking) doesn't take the rest down.

#### 4.1 — Commit grouping (5 commits, one PR)

Order matters — each commit's tests must pass against the staged state of the prior. Operations that require Andrea (provisioning the Supabase project, populating GH Actions secrets) happen out-of-band before commit 1; the commit content assumes those are already done.

1. **`infra(e2e): provision test DB + keepalive Action + Prisma migration discipline`** — purely operational + workflow. New `.github/workflows/test-db-keepalive.yml`. New CI gate that fails if `prisma migrate status` against `DATABASE_URL_TEST` shows pending migrations. Test specs untouched. CI green except for the existing E2E rot — which is the next four commits' problem.
2. **`feat(e2e): seed-e2e.ts + Playwright config wires DATABASE_URL_TEST`** — `packages/db/prisma/seed-e2e.ts` lands. `apps/web/playwright.config.ts` `webServer` for `dev:api` reads `DATABASE_URL_TEST`. Local dev unchanged (still `DATABASE_URL`). Existing specs still using the broken auth path; they stay broken until the next commit, but visibly differently — content is now empty-seeded instead of redirected-to-login.
3. **`feat(e2e): global auth fixture + per-test expectedUrl declaration`** — `apps/web/tests/e2e/fixtures.ts` lands. New auth helper. Existing spec files rewritten to import from `./fixtures` instead of `@playwright/test`, declare `test.use({ expectedUrl })` per describe-block. Specs renamed in this commit as well (`screens.spec.ts` → `screens.integration.spec.ts`, `a11y.spec.ts` → `a11y.integration.spec.ts`) — keeping rename + import-swap together avoids a transient state where a renamed file has the wrong imports. Reclassification verdicts (§4.3) applied in this commit: tests marked DELETE get removed; covered-elsewhere notes added inline.
4. **`feat(e2e): regenerate visual snapshot baselines against deterministic seed`** — `tests/snapshots/*.png` regenerated via `npm run test:e2e:update`. Pure baseline refresh — no spec file changes. Eyeball-checked PNGs (byte-size + brief Preview pass) before commit per the existing project pattern.
5. **`docs(e2e): contributor guide for the integration vs component naming convention`** — new `apps/web/tests/e2e/README.md` (≤1 screen). When to use `*.integration.spec.ts` vs `*.component.spec.ts` (per §3.5), how to authenticate via the fixture, how to reset the seed during local iteration, the canonical-issue label `infra:test-db` and what to do when it fires.

A single PR review covers all five; merge as a unit.

#### 4.2 — File-by-file changes

**New files:**

| Path | Purpose |
|---|---|
| `.github/workflows/test-db-keepalive.yml` | Daily 04:00 UTC `SELECT 1`; opens/comments on `infra:test-db` issue on failure (full content in §3.7). |
| `.github/workflows/test-db-migrate-check.yml` (or new step in existing `ci.yml`) | Runs `prisma migrate status --schema packages/db/prisma/schema.prisma` against `DATABASE_URL_TEST`. Fails the build if any migration in `packages/db/prisma/migrations/` is not yet applied to the test DB. Catches schema drift between prod and test before E2E even runs. |
| `packages/db/prisma/seed-e2e.ts` | Three users (1 admin matching Andrea's shape, 1 ACTIVE, 1 PENDING_INVITE with `hasRequestedAccess: true`) + 12 games seeded under each ACTIVE user + a handful of platforms with `syncStatus: 'ok'`. Stable IDs (e.g. `e2e-user-admin`, `e2e-game-elden-ring`) so spec assertions can target them by id. Idempotent — runs `prisma migrate reset --force` first via CLI flag; no logic to "skip if exists." |
| `apps/web/tests/e2e/fixtures.ts` | Global Playwright auth fixture per §3.6. Exports `test`, `expect`. `test.beforeEach` authenticates against the test backend; `test.afterEach` asserts post-nav URL matches `expectedUrl`. Throws helpful error if `expectedUrl` not declared. |
| `apps/web/tests/e2e/README.md` | Contributor guide (commit 5). Naming convention, fixture usage, seed reset workflow, `infra:test-db` issue runbook. |
| `.env.test.example` (committed; gitignored real version is `.env.test`) | Template documenting which env vars E2E expects. `DATABASE_URL_TEST=...` placeholder + comment about where to find the real value (1Password, Supabase dashboard, etc.). |

**Renamed files:**

| Old | New |
|---|---|
| `apps/web/tests/e2e/screens.spec.ts` | `apps/web/tests/e2e/screens.integration.spec.ts` |
| `apps/web/tests/e2e/a11y.spec.ts` | `apps/web/tests/e2e/a11y.integration.spec.ts` |

**Modified files:**

| Path | Change |
|---|---|
| `apps/web/playwright.config.ts` | `webServer[0]` (the `dev:api` config) gains an `env: { DATABASE_URL: process.env['DATABASE_URL_TEST'] }` block so the API boots against the test DB. `dev:web` unchanged. Local dev reads `DATABASE_URL` from `apps/api/.env` as before. |
| `apps/web/tests/e2e/screens.integration.spec.ts` (post-rename) | Imports swap from `@playwright/test` to `./fixtures`. Per-describe `test.use({ expectedUrl })` declarations. Content assertions retargeted from `Hollow Knight: Silksong` etc. to seeded titles (`elden ring`-class). Reclassification verdicts applied (§4.3). Two `test.describe` blocks deleted; one drift-guard moved to vitest. |
| `apps/web/tests/e2e/a11y.integration.spec.ts` (post-rename) | Same import + `test.use` updates. Each route's axe scan now runs against a real authed render (was: false-positive scan against `/login`). |
| `tests/snapshots/dashboard*.png` / `library*.png` / `releases*.png` / `releases-recent*.png` / `game-detail*.png` (and mobile variants) | Regenerated against seeded data in commit 4. The current baselines were captured against a populated dashboard pre-I-series and have been broken since. |
| `apps/web/playwright.offline.config.ts` | Investigated and either updated or marked deprecated. The offline E2E isn't part of E1's scope but if it shares the broken auth path, it gets the same fixture treatment or a clear "deprecated; offline coverage now lives in `*.component.spec.ts` mocks" note. **Open question — flagged for review.** |

**Out-of-band ops** (Andrea performs before commit 1 lands):

- Provision `hoard-test` Supabase project in EU West region.
- Apply prod migration history via the documented `db execute` + `migrate resolve` recipe (per `CLAUDE.md` operational gotchas).
- Add `DATABASE_URL_TEST` to GitHub repo Actions secrets.
- Save `DATABASE_URL_TEST` to local `apps/web/.env.test` (gitignored).
- Verify free-tier inactivity timer is reset (a manual `SELECT 1` from psql counts).

#### 4.3 — Existing test reclassification verdicts

Each existing test gets a verdict — **integration**, **component**, or **delete** — based on what it uniquely proves (per §3.1). Landing in commit 3.

| Test | Verdict | Reasoning |
|---|---|---|
| `Dashboard / shows game count` | **INTEGRATION** | Asserts `.bignum` shows a real number from a real DB query through real rendering. Exact integration shape — keep. |
| `Dashboard / shows now-playing section` | **INTEGRATION** | Content from seeded game (post-rename: `seed-elden-ring` → "Elden Ring", or whatever the seed picks). Integration. |
| `Dashboard / visual snapshot` | **INTEGRATION** | Pixel match against full stack render. Integration. |
| `Library /library shows all 6 shelves` | **INTEGRATION** | Could be vitest with mocked data, but the value here is "real backend returns the right shelf shape AND frontend renders it." Keep as integration. |
| `Library /library shows HLTB hint on backlog item` | **INTEGRATION** | Real HLTB data path → render. Integration. |
| `Library /library visual snapshot` | **INTEGRATION** | Same. |
| `Releases /releases renders the page chrome` | **INTEGRATION** | Mounts the page, asserts mode-toggle / view-header structure. Real render. Integration. |
| `Releases /releases renders either content or an empty-state CTA` | **INTEGRATION** | Validates the page mounts SOMETHING valid given live IGDB + seed data. Integration. |
| `Releases /releases visual snapshot` | **INTEGRATION** | Same. |
| `Releases recent /releases/recent renders the page chrome` | **INTEGRATION** | Validates the RECENT page mounts against the real `/api/releases/recent` feed. Integration. |
| `Releases recent /releases/recent drift-guard: no [mark all owned]` | **DELETE → vitest** | Asserts a UI element is _not_ rendered. Pure component property; doesn't need real backend. The assertion is already implicitly covered by `releases/__tests__/primitives.test.tsx` drift-guard tests (per CLAUDE.md mentions of removed-mock-button assertions); E1 confirms coverage exists or adds a one-liner there. |
| `Legacy redirects /upcoming redirects to /releases` | **DELETE → vitest** | Pure client-side router behavior. Zero integration value. `MemoryRouter` test in vitest can prove it exhaustively without booting the API. Add a new test in `apps/web/src/__tests__/legacy-redirects.test.tsx` (or extend `auth-deeplink.test.tsx`) — single `expect(getPath()).toBe('/releases')` assertion. |
| `Game Detail /game/:id shows game title` | **INTEGRATION** | Content from seeded game. Integration. |
| `Game Detail /game/:id shows receipt` | **INTEGRATION** | Real-render structural assertion against a real game's data. Integration. |
| `Game Detail /game/:id visual snapshot` | **INTEGRATION** | Same. |
| `Navigation sidebar active state follows route (desktop)` | **INTEGRATION** | Real route → real DOM `.active` class. Vitest could prove with MemoryRouter but adds little signal vs the integration test. Keep — the assertion is cheap and pins the routing-to-rendering pipeline. |
| `Navigation tab bar active state follows route (mobile)` | **INTEGRATION** | Same. |
| `Navigation navigating from dashboard to library works` | **INTEGRATION** | Click → real navigation → real fetch → real render. Pure integration value. |
| `a11y.integration.spec.ts` (12 tests across 6 routes × 2 viewports) | **INTEGRATION** | Currently false-positive. After E1's fixture lands, axe-core scans the actual authed routes. Integration. |

**Net change:** 38 → 36 tests in `screens.integration.spec.ts` (drop 2 to vitest); 12 tests in `a11y.integration.spec.ts` (unchanged count, becomes meaningful). Plus 2 new vitest entries.

#### 4.4 — Manual verification checklist

After commit 5 lands and CI is green, Andrea runs through the following before merging:

- [ ] **Action workflow runs** — manually trigger `test-db-keepalive` via the GH Actions UI. Verify it completes successfully against the live `hoard-test` project. Verify the canonical issue is _not_ opened on success.
- [ ] **Action failure path** — temporarily revoke / typo `DATABASE_URL_TEST` in secrets, manually trigger keepalive, verify the canonical `[infra] test-db keepalive failing` issue opens with a comment linking the run. Restore the secret.
- [ ] **Migration discipline** — run `prisma migrate status --schema packages/db/prisma/schema.prisma` locally against `DATABASE_URL_TEST` (with `DATABASE_URL_TEST` exported); verify "Database schema is up to date!" Then artificially mark the latest migration as not-applied (delete the row from `_prisma_migrations`); verify CI fails with a clear "X migration(s) pending" message. Restore.
- [ ] **Fixture's missing-`expectedUrl` error** — temporarily remove `test.use({ expectedUrl })` from one spec; verify the test fails with the helpful "expectedUrl is required" error, not a confusing assertion timeout.
- [ ] **Fixture catches misroute** — temporarily corrupt `RequireAuth` to redirect everywhere to `/login`; verify a11y suite fails with `expected URL '/library', got '/login'` rather than reporting login as accessible. Revert.
- [ ] **Snapshot stability** — run `npm run test:e2e -w apps/web` twice in a row; both runs produce zero snapshot diffs.
- [ ] **CI runtime** — confirm E2E job in CI completes within whatever the current budget is (note baseline pre-E1 vs post-E1 in the PR description).
- [ ] **Seed reset works** — run `npm run db:seed:e2e` (or whatever the script command is) locally; verify the test DB has exactly 3 users + 12 games + N platforms. Wipe via `prisma migrate reset --force`, re-seed, verify same shape.

#### 4.5 — Success criteria

- 36 tests pass in `screens.integration.spec.ts` against the test DB.
- 12 tests pass in `a11y.integration.spec.ts` — with a manual sanity-spot-check that they're actually scanning the right route (per the misroute test in §4.4).
- Visual snapshots stable across two consecutive runs.
- `test-db-keepalive` Action runs daily, opens the canonical issue exactly when it should.
- CI's `migrate status` gate fails when migrations drift between prod and test.
- Local dev (`npm run dev`, `npm run dev:web`, etc.) is unchanged — `DATABASE_URL` still points at prod, no impact on Andrea's normal workflow.
- New `apps/web/tests/e2e/README.md` is concise enough to read in <2 minutes; contains examples of integration spec + component spec + when to choose each.
- Two new vitest tests cover the deleted E2E checks (drift-guard, `/upcoming` redirect).

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
| 2 — Strategy decision | **Done (2026-05-09)** — Andrea confirmed Option F + 5 refinements | See §3.1–§3.5 for the locked rationale and §3.4 for secondary decisions (free tier + keepalive, secret locations, a11y fix in E1). |
| 3 — E1 PR plan drafts (concrete deliverables) | **Done (2026-05-10)** — pending Andrea's review of this draft | §3.6 (auth fixture mechanism, recommendation: per-test expected-URL declaration) + §3.7 (keepalive Action specifics: daily cron, canonical-issue failure-mode, two-layer retry/recovery) added. §4 expanded into PR-shaped specifics: 5-commit grouping (§4.1), file-by-file changes (§4.2), 18 existing-test reclassification verdicts incl. 2 deletions moved to vitest (§4.3), 8-item manual verification checklist (§4.4), success criteria (§4.5). |
| 4 — E1 implementation | Pending | After step 3 review lands. Estimated ~4–6 hours of work + ~30 min of operational ops (Supabase provisioning + secrets) for Andrea. |
| 5 — E2 (welcome.integration.spec.ts + welcome-error-states.component.spec.ts) | Pending | After E1 lands. |
