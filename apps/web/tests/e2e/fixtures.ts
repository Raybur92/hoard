/**
 * Global Playwright auth fixture for E2E integration specs.
 *
 * Plan: docs/E2E_RESTORATION_PLAN.md §3.6.
 *
 * Each spec authenticates against the test backend by issuing a real POST
 * /api/auth/login — the resulting `session` cookie lands on `page.context()`
 * and is carried by subsequent `page.goto(...)` calls. RequireAuth +
 * RequireActive on the frontend approve the request and the actual route
 * renders. No DEV_USER_ID dev-fallback path involved.
 *
 * Why per-test `expectedUrl`: pre-E1, the a11y suite reported every authed
 * route as accessible (true) — but the suite was actually scanning /login
 * because the dev-fallback userId (`seed-andrea`) had been deleted by the
 * I-series. Twelve tests passed for the wrong reason. The fixture now
 * forces every spec to declare the URL it expects to land on; afterEach
 * asserts the assertion. A misroute fails the test loudly with
 * `expected URL '/library', got '/login'` instead of silently passing.
 */

import { test as base, expect } from '@playwright/test';

type ExpectedUrl = string | RegExp;

const E2E_EMAIL = 'e2e-active@hoard.test';

export const test = base.extend<{ expectedUrl: ExpectedUrl }>({
  // Default empty — beforeEach throws if a spec didn't declare its own.
  expectedUrl: ['', { option: true }],
});

/**
 * Suite-level precheck: prove login works ONCE before any test runs.
 *
 * Folded in per Andrea's call (mitigation #2 from the seed→fixture drift
 * discussion). One POST per worker, fails loudly with both file paths
 * inline so future-debugger doesn't need to dig through a runbook to
 * find the contract that broke.
 */
test.beforeAll(async ({ request }) => {
  const password = process.env['E2E_TEST_PASSWORD'] ?? '';
  const res = await request.post('/api/auth/login', {
    data: { email: E2E_EMAIL, password },
  });
  if (!res.ok()) {
    throw new Error(
      `E2E auth precheck failed (status ${res.status()}). Verify E2E_TEST_PASSWORD in\n` +
        `apps/web/.env.test matches the plaintext that\n` +
        `packages/db/prisma/seed-e2e.ts hashed. See seed-e2e.ts comment block\n` +
        `for the contract.`,
    );
  }
});

/**
 * Per-test login: lands the session cookie on `page.context()` so the
 * spec's own `page.goto(...)` calls authenticate normally. Also enforces
 * the expectedUrl declaration — missing-fixture-option fails loudly
 * instead of silently no-op'ing.
 */
test.beforeEach(async ({ page, expectedUrl }, testInfo) => {
  if (!expectedUrl) {
    throw new Error(
      `[${testInfo.titlePath.join(' > ')}] expectedUrl is required.\n` +
        `Add test.use({ expectedUrl: '/your-route' }) at the top of the spec or describe block.`,
    );
  }
  const password = process.env['E2E_TEST_PASSWORD'] ?? '';
  const res = await page.request.post('/api/auth/login', {
    data: { email: E2E_EMAIL, password },
  });
  if (!res.ok()) {
    throw new Error(`E2E per-test auth failed (status ${res.status()}) — see beforeAll precheck.`);
  }
});

/**
 * Confirms the page landed where the spec said it would. Catches mid-test
 * misroutes (session expiry, stray RequireAuth redirect, query-param
 * misuse) loudly. Defines the property: "this test ran against the route
 * it declared, not against /login or some other unexpected destination."
 */
test.afterEach(async ({ page, expectedUrl }) => {
  if (expectedUrl) await expect(page).toHaveURL(expectedUrl);
});

export { expect };
