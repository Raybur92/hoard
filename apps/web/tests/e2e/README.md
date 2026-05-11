# E2E tests

Playwright suite. Unit tests live in `apps/web/src/**/*.test.tsx`. Workstream history in `docs/E2E_RESTORATION_PLAN.md`.

## Naming convention

| Filename                | Runs against                              | When                                                                                            |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `*.integration.spec.ts` | Real test backend + `hoard-test` Supabase | **Default.** Proves the real auth/session/data pipeline.                                        |
| `*.component.spec.ts`   | Mocked API via `page.route(...)`, no DB   | Pure UI-reaction assertions only. Most live in vitest; reach here only when jsdom isn't enough. |

Default to integration. Locked in plan §3.5.

## Authentication

Every integration spec imports the global fixture in `./fixtures.ts`:

```ts
import { test, expect } from './fixtures';

test.describe('Library /library', () => {
  test.use({ expectedUrl: '/library' });
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
  });
  test('shows N shelves', async ({ page }) => {
    /* ... */
  });
});
```

- `expectedUrl` is **required per describe**. Fixture's `beforeEach` throws if missing.
- Auths as `e2e-active@hoard.test` via real `POST /api/auth/login`.
- `afterEach` asserts `page.toHaveURL(expectedUrl)` — catches midstream misroutes loudly (`expected '/library', got '/login'`) instead of silently scanning the redirect target.
- `beforeAll` precheck (one POST per worker) fails loudly with an error naming both `apps/web/.env.test` AND `packages/db/prisma/seed-e2e.ts` by path if the seed's bcrypt hash and the fixture's plaintext have drifted.

## Local setup

`apps/web/.env.test` (gitignored) needs:

```bash
DATABASE_URL_TEST=postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
E2E_TEST_PASSWORD=e2e-test-only-do-not-use
```

Template at `apps/web/.env.test.example`. CI reads both as repo secrets. The plaintext above matches the bcrypt(12) hash hardcoded in `seed-e2e.ts` — change one, change both.

## Running

```bash
npm run test:e2e -w apps/web                # full suite (~2 min, serial)
npm run test:e2e:update -w apps/web         # regenerate snapshot baselines
npx playwright test --workspace=apps/web screens.integration.spec.ts
```

**Foot-gun**: if `npm run dev` is already running, Playwright reuses that dev:api — and if it's bound to prod's `DATABASE_URL`, E2E hits prod. Kill any running dev:api before E2E. Documented in `playwright.config.ts`.

## Reseeding the test DB

```bash
DATABASE_URL=<test-db-url> I_KNOW_THIS_IS_THE_TEST_DB=1 \
  npm run db:seed:e2e -w @hoard/db
```

The ack env var is required — script refuses to wipe without it. Verify counts (`User`/`Game`/`UserGame`/`Platform` = `3`/`12`/`24`/`4`) via psql against the test URL.

## Snapshot triage

**Byte-size sanity check after every regen.** Run `ls -la apps/web/tests/snapshots/screens.integration.spec.ts-snapshots/`. Pairs of identical byte sizes are almost certainly login-redirect captures, not real content. Observed clusters: ~25 KB (mobile login), ~36 KB (desktop login). Real content captures span 40 KB → 270 KB. Spot-check PNGs in Preview before committing if any duplicate sizes appear.

**`releases-*` flake runbook.** The two `releases-{desktop,mobile}` baselines embed the live IGDB "hot this month" feed (top-3 hype-sorted upcoming releases). When IGDB updates that list — every few months — those baselines mismatch:

- **Only `releases-*` failed** → IGDB drift. Re-bake all baselines via `npm run test:e2e:update`, eyeball, commit.
- **Other baselines also failed** → real UI regression. Investigate before updating.

Stubbing the IGDB feed is a deferred post-E1 follow-up if this becomes annoying.

## CI runbooks

**`infra:test-db` issue auto-opens.** Daily 04:00 UTC keepalive Action failed 3 attempts. Almost always Supabase free-tier auto-pause after >7d inactivity. Unpause via dashboard, close the issue.

**`test-db-migrate-check` fails on a PR.** Test DB is missing migrations from the file tree. Apply via the pgbouncer-workaround recipe in `CLAUDE.md` (`prisma db execute` + `prisma migrate resolve --applied`). This gate only catches `_prisma_migrations` ledger drift; a deeper "schema doesn't match `schema.prisma`" drift gate is flagged for post-E1 in `docs/PLAN.md`.

## Forward pointer: screens own their scroll container

Authed screens mounted inside `<AppShell>` must provide their own scroll container — `AppShell` doesn't. Without this, content longer than the viewport clips:

```tsx
<div style={{ flex: 1, overflow: 'auto' }}>{/* screen content */}</div>
```

Canonical example: commit `4fa703b` (admin screen scroll bug, 2026-05-10). If a new authed screen's visual snapshot looks cut off, this is the cause.
