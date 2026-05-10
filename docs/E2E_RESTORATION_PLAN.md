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

**Failure-mode behavior: open or comment on a single canonical issue.** On Action failure, find-or-create a canonical issue labeled `infra:test-db` with the exact title `[infra] test-db keepalive failing`. The find step is explicit: lookup must match BOTH the label AND the exact title (label-only matching could pick a stale historical issue with the same label; title-only matching could miss when label hygiene drifts). If a matching open issue exists → `gh issue comment` with the failure timestamp + run URL. If not → `gh issue create` with the canonical title + label. Closed issues with the same title are NOT re-opened automatically — once Andrea has closed an issue, that's a "this was handled" signal, and the next failure starts a fresh issue (so closure dates remain meaningful audit data).

The lookup invocation in the workflow:

```bash
# Find the open canonical issue, if any. Empty string if none.
existing=$(gh issue list \
  --label 'infra:test-db' \
  --state open \
  --json number,title \
  --jq '.[] | select(.title == "[infra] test-db keepalive failing") | .number' \
  | head -n 1)
```

`--state open` plus the exact-title filter means: at most one match, by construction. `head -n 1` is belt-and-suspenders against the impossible "two issues with identical label + title both open" case — which would itself be a label-discipline bug worth surfacing rather than silently appending to one of them.

Contrast with rejected alternatives: paging someone (overkill for a single-user hobby tool, no on-call rotation), logging silently (the original problem we're trying to avoid), failing the workflow without surfacing (would only get noticed on next E2E run, by which point the DB might have paused).

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
          CANONICAL_TITLE: '[infra] test-db keepalive failing'
        run: |
          set -euo pipefail
          # Lookup by BOTH label AND exact title — see §3.7 for why.
          # Label-only could pick a stale historical issue with the same
          # label; title-only could miss when label hygiene drifts.
          existing=$(gh issue list \
            --label 'infra:test-db' \
            --state open \
            --json number,title \
            --jq ".[] | select(.title == \"$CANONICAL_TITLE\") | .number" \
            | head -n 1)
          if [ -n "$existing" ]; then
            gh issue comment "$existing" \
              --body "Keepalive failed at $(date -u +%Y-%m-%dT%H:%M:%SZ). Run: ${{ github.run_url }}"
          else
            gh issue create \
              --title "$CANONICAL_TITLE" \
              --label 'infra:test-db' \
              --body $'Test DB keepalive Action failed.\n\nCheck Supabase dashboard; manual unpause may be needed.\nLatest run: ${{ github.run_url }}'
          fi
```

---

## 4. PR sequence

§3 is locked; PR specifics below are scoped against Option F with the §3 refinements. Scope-locking only — actual PR drafts wait for Andrea's review of this revision before E1's deliverables get written up in detail.

### E1 — Restoration foundation

Single PR; the five commits below are load-bearing for each other but each lands a coherent unit so a partial revert (e.g. baselines need re-baking) doesn't take the rest down.

#### 4.1 — Commit grouping (5 commits, with 3 Andrea-touchpoints)

Order matters — each commit's tests must pass against the staged state of the prior. Operations that require Andrea are interleaved with the commits per the option (a) ordering decision in §4.6: Phase A + B (provision + secret) happen BEFORE commit 1, the seed run happens BETWEEN commits 2 and 3, Phase C (verification) happens AFTER commit 5. Each commit lands separately on `main`; per hard rule 10, the agent stops and summarizes after each, holding for Andrea's green-light to proceed. See §4.6 for the full per-commit handoff sequence.

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
| `.env.test.example` (committed; the real `.env.test` is gitignored — see §4.6 step 7) | Template documenting which env vars E2E expects. **Placeholder values only — NO real connection strings, NO real secrets.** Format: `DATABASE_URL_TEST=postgresql://<user>:<password>@<host>:<port>/<db>?pgbouncer=true&connection_limit=5` with literal angle-bracket placeholders. Plus a comment block pointing the developer at where to find the real value (Supabase dashboard → Settings → Database). The example file is what a fresh clone reads to know "this env var is required for E2E"; the rule is that anyone running `git diff` on a commit touching this file should never see a real credential. |

**Renamed files:**

| Old | New |
|---|---|
| `apps/web/tests/e2e/screens.spec.ts` | `apps/web/tests/e2e/screens.integration.spec.ts` |
| `apps/web/tests/e2e/a11y.spec.ts` | `apps/web/tests/e2e/a11y.integration.spec.ts` |

**Modified files:**

| Path | Change |
|---|---|
| `apps/web/playwright.config.ts` | `webServer[0]` (the `dev:api` config) gains an `env: { DATABASE_URL: process.env['DATABASE_URL_TEST'] }` block so the API boots against the test DB. `dev:web` unchanged. Local dev reads `DATABASE_URL` from `apps/api/.env` as before. |
| `apps/web/tests/e2e/screens.integration.spec.ts` (post-rename) | Imports swap from `@playwright/test` to `./fixtures`. Per-describe `test.use({ expectedUrl })` declarations. Content assertions retargeted from `Hollow Knight: Silksong` etc. to seeded titles (`elden ring`-class). Reclassification verdicts applied (§4.3). Seven `test.describe` blocks / specs deleted, with covering vitest tests added in the same commit. |
| `apps/web/tests/e2e/a11y.integration.spec.ts` (post-rename) | Same import + `test.use` updates. Each route's axe scan now runs against a real authed render (was: false-positive scan against `/login`). |
| `apps/web/src/__tests__/shell-persistence.test.tsx` | Extended with sidebar + tab-bar active-state assertions, picking up the deletions from §4.3. |
| `apps/web/src/__tests__/legacy-redirects.test.tsx` (NEW) | Single MemoryRouter test for `/upcoming` → `/releases`. Picks up the deletion from §4.3. |
| `apps/web/src/components/screens/__tests__/LibraryDesktop.test.tsx` (NEW or extended if exists) | 6-shelf-headers assertion against mocked shelves data. Picks up the deletion from §4.3. |
| `apps/web/src/components/screens/releases/__tests__/primitives.test.tsx` | Verified to drift-guard "no [mark all owned]"; one-line addition if missing. Picks up the deletion from §4.3. |
| `tests/snapshots/dashboard*.png` / `library*.png` / `releases*.png` / `releases-recent*.png` / `game-detail*.png` (and mobile variants) | Regenerated against seeded data in commit 4. The current baselines were captured against a populated dashboard pre-I-series and have been broken since. |
| `.gitignore` | Adds `apps/web/.env.test` if not already covered (verified during E1 — see §4.6 step 5). The existing `.env.*.local` glob does NOT catch `.env.test`. |

**Deleted files:**

| Path | Reason |
|---|---|
| `apps/web/playwright.offline.config.ts` | Per Andrea's instruction (2026-05-10): offline coverage is OUT of E1's scope. Deleting outright rather than updating-or-deprecating means the file's "yes, we used to have offline E2E" footprint is removed from the tree. If offline coverage is later wanted, it lands in a follow-up workstream with proper scoping. The `test:e2e:offline` script in `apps/web/package.json` is removed in the same commit. |

#### 4.3 — Existing test reclassification verdicts

Each existing test gets a verdict — **integration**, **component**, or **delete** — by asking "if we deleted this, would we lose unique signal that the layer below couldn't recover?" (per §3.1). Stricter pass after Andrea's review reminder: be willing to delete rather than reclassify when a test really proves "this component renders without crashing" or "this prop wires through correctly" — that's vitest territory regardless of where the test lives today. Landing in commit 3.

**Decision rule:** if a visual snapshot already covers the same property (page mounted, headers rendered) AND vitest can prove the structural concern with mocked data, the structural assertion is redundant — delete. Visual snapshots aren't perfect (brittle on CSS changes) but they catch the "did this render at all" property, and vitest catches the wiring-through property; the integration test in the middle doesn't add unique signal.

| Test | Verdict | Reasoning |
|---|---|---|
| `Dashboard / shows game count` | **INTEGRATION** | `.bignum` shows a real number from a real DB query through real rendering. Vitest could prove `<Dashboard stats={{totalGames: 42}} />` shows 42, but couldn't prove the real `/api/dashboard` returns the right shape AND the count is non-zero. Integration. |
| `Dashboard / shows now-playing section` | **INTEGRATION** | Content assertion targeting a specific seeded game title. Vitest with mocked `nowPlaying` proves rendering; integration proves the API actually returns the seeded game. Integration. |
| `Dashboard / visual snapshot` | **INTEGRATION** | Pixel match against full stack. Integration. |
| `Library /library shows all 6 shelves` | **DELETE → vitest** | Iterates 6 hardcoded text labels and checks each is visible. Labels are hardcoded in `LibraryDesktop.tsx`; backend can't influence them. Visual snapshot already proves the shelves view mounted with headers. Vitest with `<LibraryDesktop shelves={...} />` and mocked data can prove the 6 labels render. **Redundant with snapshot AND covered by vitest** — delete. New vitest in `apps/web/src/components/screens/__tests__/LibraryDesktop.test.tsx` if not already covered. |
| `Library /library shows HLTB hint on backlog item` | **INTEGRATION** | The `~12h`-style regex assertion is the giveaway: this proves real HLTB data was fetched, persisted, returned by the API, and rendered by the frontend. Vitest with mocked HLTB data proves rendering only; integration proves the data path. Keep. |
| `Library /library visual snapshot` | **INTEGRATION** | Pixel match against full stack. Integration. |
| `Releases /releases renders the page chrome` | **DELETE → vitest** | Asserts mode-toggle tabs exist on desktop / `.m-view-header` on mobile. Pure structural "page mounted" check. Visual snapshot already covers it. Vitest with mocked feed proves the chrome renders. **Redundant** — delete. |
| `Releases /releases renders either content or an empty-state CTA` | **INTEGRATION** | Asserts the page mounts SOMETHING valid given **live IGDB feed + seed wishlist** behavior. Vitest cannot prove "with a real (fluctuating) IGDB response, the page renders content OR empty state" — that's a flake-resistance property specifically for the integration layer. Keep. |
| `Releases /releases visual snapshot` | **INTEGRATION** | Pixel match. Integration. |
| `Releases recent /releases/recent renders the page chrome` | **INTEGRATION (kept)** | Borderline case — same shape as `Releases /releases renders chrome` (which gets deleted) — BUT `/releases/recent` has no visual snapshot fallback. Deleting this test would leave the page with E2E coverage of zero. Keeping as the page's only integration smoke. If a `/releases/recent` snapshot is later added, this can be deleted then. |
| `Releases recent /releases/recent drift-guard: no [mark all owned]` | **DELETE → vitest** | Asserts a UI element is _not_ rendered. Pure component property; doesn't need real backend. Assertion is already implicitly covered by `releases/__tests__/primitives.test.tsx` drift-guard tests (per CLAUDE.md mentions of removed-mock-button assertions); E1 confirms coverage exists or adds a one-liner there. |
| `Legacy redirects /upcoming redirects to /releases` | **DELETE → vitest** | Pure client-side router behavior. Zero integration value. `MemoryRouter` test in vitest can prove it exhaustively without booting the API. Add a new test in `apps/web/src/__tests__/legacy-redirects.test.tsx` (or extend `auth-deeplink.test.tsx`) — single `expect(getPath()).toBe('/releases')` assertion. |
| `Game Detail /game/:id shows game title` | **INTEGRATION** | Content from seeded game retrieved via real `/api/games/:id` query. Integration. |
| `Game Detail /game/:id shows receipt` | **INTEGRATION** | Asserts `.receipt` mounts AND "thank u for hoarding" text is present. Real-render structural plus content assertion. Vitest with mocked `UserGameDetail` proves rendering; integration proves the real game data flows through the receipt block. Keep — the receipt is design-system-heavy enough that pixel-stable rendering through a real data path adds signal. |
| `Game Detail /game/:id visual snapshot` | **INTEGRATION** | Pixel match. Integration. |
| `Navigation sidebar active state follows route (desktop)` | **DELETE → vitest** | Asserts `.sidebar .item.active` contains "Library" after `goto('/library')`. Pure route-to-DOM wiring. Vitest with `MemoryRouter initialEntries={['/library']}` can prove this exhaustively; `shell-persistence.test.tsx` already does similar route-driven assertions. Add a sibling test there (one extra `expect`). **Redundant.** |
| `Navigation tab bar active state follows route (mobile)` | **DELETE → vitest** | Same shape as sidebar, mobile variant. Vitest with `useBreakpoint()` mocked to mobile + MemoryRouter covers it. Delete; extend shell-persistence.test.tsx. |
| `Navigation navigating from dashboard to library works` | **INTEGRATION** | Click → real navigation → real fetch (`/api/games/shelves` or similar fires) → real content render. Three integration concerns at once that vitest can't prove together: vitest-with-mocks can do click-to-navigate, but the `/api/games/shelves` fetch is the integration property — it triggers when the route mounts. Keep. |
| `a11y.integration.spec.ts` (12 tests across 6 routes × 2 viewports) | **INTEGRATION** | Currently false-positive (scans `/login` for every authed route). After E1's fixture lands, axe-core scans the actual authed routes. Integration. |

**Net change:**
- **Before:** 18 unique screens.spec.ts tests (×2 viewports for visual snapshots + most others where viewport-aware = ~38 test instances) + 12 a11y tests.
- **After E1:**
  - `screens.integration.spec.ts`: 11 unique tests kept (×2 viewports where applicable) — Dashboard 3, Library 2 (HLTB + visual), Releases 2 (content-or-empty + visual), Releases recent 1 (chrome only), Game Detail 3, Navigation 1 (click-to-navigate). **7 deletions** moved to vitest or covered by visual snapshots.
  - `a11y.integration.spec.ts`: 12 tests (unchanged count; becomes meaningful instead of false-positive).
  - **New vitest entries** (in commit 3 or as small follow-ups in E1's same PR): `LibraryDesktop.test.tsx` for the 6-shelf assertion; `legacy-redirects.test.tsx` for `/upcoming` → `/releases`; extension to `shell-persistence.test.tsx` for sidebar + tab-bar active-state assertions; verify primitives.test.tsx drift-guard for "no [mark all owned]" already exists or add it. ~5 new vitest tests covering the 7 deletions.

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

- 11 tests pass in `screens.integration.spec.ts` against the test DB (after §4.3 reclassification — was 18 before deletions).
- 12 tests pass in `a11y.integration.spec.ts` — with a manual sanity-spot-check that they're actually scanning the right route (per the misroute test in §4.4).
- Visual snapshots stable across two consecutive runs.
- `test-db-keepalive` Action runs daily, opens the canonical issue exactly when it should, comments on the existing canonical issue when one is already open.
- CI's `migrate status` gate fails when migrations drift between prod and test.
- Local dev (`npm run dev`, `npm run dev:web`, etc.) is unchanged — `DATABASE_URL` still points at prod, no impact on Andrea's normal workflow.
- New `apps/web/tests/e2e/README.md` is concise enough to read in <2 minutes; contains examples of integration spec + component spec + when to choose each.
- ~5 new vitest tests cover the 7 E2E deletions (drift-guard, legacy redirect, sidebar active state, tab-bar active state, library 6-shelf headers).
- `playwright.offline.config.ts` and the `test:e2e:offline` script are removed cleanly; no dangling references remain.

#### 4.6 — Out-of-band setup checklist (Andrea performs) + interleaved ordering

**Ordering decision (locked 2026-05-10): option (a) interleaved.** Andrea raised the ordering ambiguity — Phase A4 (run the seed) can't happen before commit 2 lands because the seed script doesn't exist yet. Option (b) decoupled (Andrea does all ops up front, agent ships all 5 commits) was rejected because it'd require the migration-status CI gate and the renamed-spec CI to tolerate missing secrets across multiple commits, which weakens the gate's protective intent.

Interleave keeps every commit's CI green when it lands, at the cost of three Andrea-touchpoints across the workstream (one before commit 1, one between commits 2 and 3, one after commit 5).

The `🟢` markers below indicate where Andrea's green-light is required to proceed; per hard rule 10, the agent stops and summarizes after each commit lands.

**Phase A — Test-DB provisioning (BEFORE commit 1):**

1. **Provision the `hoard-test` Supabase project.** Free tier; `EU West (eu-west-1)` region to match prod (consistent connection latency from the API process during CI). Note the project ref + the connection string with the transaction pooler port (6543).

2. **Apply prod migration history to the test project.** Use the documented pgbouncer workaround per `CLAUDE.md` operational gotchas:

    ```bash
    DATABASE_URL=<test-db-url-without-pgbouncer-params> \
    npx prisma db execute \
      --file packages/db/prisma/migrations/<each-migration>/migration.sql \
      --schema packages/db/prisma/schema.prisma
    ```

    Then `npx prisma migrate resolve --applied <name>` for each. Do this in chronological order. Verify end-state by checking `_prisma_migrations` row count matches prod.

3. **Enable RLS on the new project's public tables** (per AGENT.md key decision #10). Re-run the SQL from `20260504100000_enable_rls_on_public_tables/migration.sql` against the test DB.

**Phase B — Secret distribution (BEFORE commit 1):**

4. **Add `DATABASE_URL_TEST` to GitHub repo Actions secrets.** Settings → Secrets and variables → Actions → New repository secret. Value is the test project's full pooled connection string with `?pgbouncer=true&connection_limit=5` query-string params (matching prod's gotchas). Without this, commit 1's migration-status CI gate fails to read the secret and the gate becomes a no-op.

5. **Create local `apps/web/.env.test`** (will be gitignored once commit 1 lands; safe to create now since the file doesn't exist before commit 1) with the same `DATABASE_URL_TEST=...` value. This is what Playwright reads when running E2E locally. **`.env.test.example`** committed alongside in commit 1 as a placeholder template — angle-bracket dummies only, NO real connection strings.

🟢 **Andrea ack required: Phase A + B done.** Agent waits for the signal "test DB provisioned, secret added, local env set" before starting commit 1.

---

**Commit 1 — `infra(e2e): provision test DB + keepalive Action + Prisma migration discipline`** lands.

Includes: `.github/workflows/test-db-keepalive.yml`, migrate-status CI gate, `apps/web/.env.test.example`, and the `apps/web/.env.test` gitignore line.

Agent stops + summarizes per hard rule 10.

🟢 **Andrea green-lights commit 2.** Optional verification: run `git check-ignore -v apps/web/.env.test` locally to confirm the new gitignore rule matches.

---

**Commit 2 — `feat(e2e): seed-e2e.ts + Playwright config wires DATABASE_URL_TEST`** lands.

Includes: `packages/db/prisma/seed-e2e.ts`, `apps/web/playwright.config.ts` updates.

Agent stops + summarizes — **and inlines the seed contents in the summary message** (3 users with id/email/status/isAdmin/hasRequestedAccess fields, 12 games with id/title/igdbId/genres, platforms with codes + syncStatus). Surfaces shape for Andrea's eyeball BEFORE running the seed.

6. **Andrea reviews the seed contents** (in the agent's summary). Watching for: accidental data-shape collisions with future migrations, IGDB ID dups across games, a closed-beta-realistic spread of statuses (1 admin + 1 ACTIVE + 1 PENDING_INVITE-with-request matches the spec at §4.3).

7. **Andrea runs `seed-e2e.ts` once locally** against the test DB:

    ```bash
    DATABASE_URL=<test-db-url-as-above> \
    npx tsx packages/db/prisma/seed-e2e.ts
    ```

    Verify via Prisma Studio or `SELECT count(*) FROM "User"` (expect 3) and `SELECT count(*) FROM "Game"` (expect 12). Wipe-and-reseed should be idempotent — running twice produces the same state.

🟢 **Andrea green-lights commit 3.** Hold here longest; the seed shape determines what every integration test in commit 3 asserts against.

---

**Commit 3 — `feat(e2e): global auth fixture + per-test expectedUrl declaration`** lands.

Includes: `apps/web/tests/e2e/fixtures.ts`, spec rename + import swap + `test.use({ expectedUrl })` declarations + reclassification verdicts (§4.3) applied. Plus the ~5 new vitest tests covering the 7 deletions.

Agent stops + summarizes.

🟢 **Andrea green-lights commit 4.**

---

**Commit 4 — `feat(e2e): regenerate visual snapshot baselines against deterministic seed`** lands.

Includes: regenerated `tests/snapshots/*.png`. Andrea eyeballs the PNGs in Preview before merging — the byte-size signature trick (login-redirect captures cluster around ~25 KB) is a useful sanity check.

Agent stops + summarizes.

🟢 **Andrea green-lights commit 5.**

---

**Commit 5 — `docs(e2e): contributor guide for the integration vs component naming convention`** lands.

Includes: `apps/web/tests/e2e/README.md`.

Agent stops + summarizes. **Last commit of E1.**

---

**Phase C — Verification (AFTER commit 5):**

8. **Manually trigger `test-db-keepalive`** once via the Actions UI. Verify it completes successfully and the canonical `infra:test-db` issue does NOT open.

9. **Sad-path verification.** Temporarily revoke `DATABASE_URL_TEST` (or replace with a typo). Manually trigger keepalive → verify the canonical issue opens with the expected title + label + comment linking the run. Restore the secret.

10. **Migration drift verification.** Locally export `DATABASE_URL_TEST`; delete a row from `_prisma_migrations` artificially; push a CI-trigger commit (or open a draft PR); verify CI fails with a clear "X migration(s) pending" message. Restore.

11. **Confirm the keepalive runs unattended at 04:00 UTC on the next day.** Check the Actions tab the morning after merge to confirm a green run exists. If not, the cron didn't fire — investigate via GH Actions docs (cron schedule on the default branch, free-account quotas, etc.).

12. **Fixture's missing-`expectedUrl` error verification** (§4.4 item — restated for completeness). Temporarily remove `test.use({ expectedUrl })` from one spec; verify the test fails with the helpful "expectedUrl is required" error. Revert.

13. **Fixture-catches-misroute verification** (§4.4 item — restated). Temporarily corrupt `RequireAuth` to redirect everywhere to `/login`; verify a11y suite fails with `expected URL '/library', got '/login'` rather than reporting login as accessible. Revert.

14. **Watch for the canonical issue** in the days following merge. It should NOT auto-open under healthy operation. If it appears in the first week, that's the failure path doing its job — investigate per the §3.7 recovery flow.

**Sanity check on cost:**
- **Phase A + B (before commit 1):** ~20 minutes (provisioning + migration replay + RLS + secret + local .env.test).
- **Between commits 2 and 3:** ~10 minutes (review seed contents in summary, run seed locally, verify counts).
- **Phase C (after commit 5):** ~30 minutes (workflow trigger + sad-path + migration drift + corrupted-RequireAuth + revert), spread across the day after merge for the cron-runs check.

Total Andrea time: ~60 minutes split across three sittings.

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
| 3 — E1 PR plan drafts (concrete deliverables) | **Locked (2026-05-10)** — Andrea confirmed all 4 scrutiny items + 3 review adjustments | §3.6 (auth fixture: per-test expected-URL declaration, Option β, recommendation locked) + §3.7 (keepalive Action: daily 04:00 UTC cron, canonical-issue with explicit label-AND-exact-title dedup, two-layer recovery). §4 expanded into PR-shaped specifics: 5-commit grouping (§4.1), file-by-file changes (§4.2, includes outright deletion of `playwright.offline.config.ts`), 18 existing-test reclassification verdicts incl. **7 deletions** moved to vitest (§4.3 — stricter pass after Andrea's review), 8-item manual verification checklist (§4.4), success criteria (§4.5), 10-step out-of-band setup checklist with Phase A/B/C annotations (§4.6). |
| 4 — E1 implementation | **Awaiting Andrea Phase A + B** | Plan locked at step 3. Ordering picked: option (a) interleaved with three Andrea-touchpoints (§4.6). Agent waits for "test DB provisioned, secret added, local env set" signal before commit 1. ~20 min Andrea work for Phase A + B; ~4–6 hours of agent work spread across 5 commits (with ~10 min Andrea checkpoint between commits 2 and 3 to review + run seed). |
| 5 — E2 (welcome.integration.spec.ts + welcome-error-states.component.spec.ts) | Pending | After E1 lands. |
