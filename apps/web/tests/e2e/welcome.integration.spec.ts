/**
 * Welcome flow integration tests — register → redeem → ACTIVE transitions.
 *
 * Plan: docs/E2E_RESTORATION_PLAN.md §E2 (decisions D1–D5 locked 2026-05-12).
 *
 * Tests in this file cover the I4 welcome flow (see docs/INVITE_CODES_PLAN.md
 * I4) end-to-end through real /api/auth/register, /api/auth/redeem-invite,
 * /api/auth/request-access, and /api/admin/invite-codes. The vitest suite at
 * apps/web/src/components/screens/__tests__/WelcomeScreen.test.tsx covers the
 * pure UI assertions (render correctness with mocked responses); this spec
 * proves the wire — that real backend returns the expected error code shape
 * AND the component maps it to the right copy.
 *
 * RATE_LIMITED is intentionally not covered here. Both rate limiters in
 * apps/api/src/routes/auth.ts carry `skip: skipInDev` and only fire when
 * NODE_ENV === 'production'. Forcing prod NODE_ENV for the test API would
 * also flip `secure: true` on session cookies → HTTPS-only → Playwright
 * cookies silently rejected → fixture's beforeAll precheck fails → entire
 * suite dies. The vitest mock coverage (WelcomeScreen.test.tsx) proves the
 * UI render correctly handles a 429; the rate-limit response shape is
 * well-defined and stable; integration coverage adds disproportionate
 * setup cost for marginal signal.
 *
 * Fresh-user emails follow `e2e-welcome-{testSlug}-{Date.now()}@hoard.test`
 * — the `e2e-welcome-` prefix is LOAD-BEARING for the global-setup.ts
 * ghost-purge query. Do not change without updating that query in lockstep.
 */

import { test as base, expect } from '@playwright/test';

type ExpectedUrl = string | RegExp;

const E2E_PASSWORD = 'e2e-test-only-do-not-use';
const ADMIN_EMAIL = 'e2e-admin@hoard.test';

type WelcomeFixtures = {
  expectedUrl: ExpectedUrl;
  registerFreshUser: () => Promise<{ email: string }>;
};

const test = base.extend<WelcomeFixtures>({
  expectedUrl: ['', { option: true }],
  registerFreshUser: async ({ page }, use, testInfo) => {
    let trackedEmail: string | null = null;
    await use(async () => {
      const slug = testInfo.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const email = `e2e-welcome-${slug}-${Date.now()}@hoard.test`;
      const res = await page.request.post('/api/auth/register', {
        data: { email, password: E2E_PASSWORD },
      });
      if (!res.ok()) {
        throw new Error(`Fresh-user register failed: ${res.status()} ${await res.text()}`);
      }
      trackedEmail = email;
      return { email };
    });
    // PRIMARY cleanup contract layer per global-setup.ts. DELETE /api/auth/
    // me deletes the currently-authenticated user. If the test's auth state
    // has drifted (e.g. switched to admin via page.request.post), re-login
    // as the tracked user first, then delete.
    if (trackedEmail) {
      let res = await page.request.delete('/api/auth/me');
      if (res.status() === 401) {
        const loginRes = await page.request.post('/api/auth/login', {
          data: { email: trackedEmail, password: E2E_PASSWORD },
        });
        if (loginRes.ok()) {
          res = await page.request.delete('/api/auth/me');
        }
      }
      // If both attempts fail, globalSetup's >1h ghost-purge will eventually
      // catch it. Not throwing here so the test's own assertion failure
      // (if any) stays the surfaced root cause.
    }
  },
});

// Suite-level precheck: prove the admin user can authenticate before any
// test runs. Test 5 (request-access → admin generates → user redeems)
// depends on this. Mirrors fixtures.ts's beforeAll shape from E1 — same
// named-paths error so a future debugger doesn't have to hunt down the
// contract.
test.beforeAll(async ({ request }) => {
  const password = process.env['E2E_TEST_PASSWORD'] ?? '';
  const res = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password },
  });
  if (!res.ok()) {
    throw new Error(
      `E2 welcome-suite precheck failed (status ${res.status()}). Verify the admin\n` +
        `user e2e-admin@hoard.test exists in the test DB (via reseed) and that\n` +
        `E2E_TEST_PASSWORD in apps/web/.env.test matches the bcrypt hash in\n` +
        `packages/db/prisma/seed-e2e.ts.`,
    );
  }
});

test.beforeEach(async ({ page, expectedUrl }, testInfo) => {
  // Welcome tests are viewport-invariant — they exercise URL transitions
  // and form submits, neither of which behaves differently between
  // desktop and mobile breakpoints. Skipping the mobile project keeps
  // the suite count honest (6 new tests / 38 → 44 total per plan §E2.5)
  // without spending ~1m on dup mobile runs that add zero signal.
  // Visual responsive behavior of the welcome screen IS covered by the
  // vitest tests in apps/web/src/components/screens/__tests__/
  // WelcomeScreen.test.tsx.
  testInfo.skip(
    testInfo.project.name === 'mobile',
    'Welcome flow tests are viewport-invariant — mobile adds no unique signal',
  );

  if (!expectedUrl) {
    throw new Error(
      `[${testInfo.titlePath.join(' > ')}] expectedUrl is required.\n` +
        `Add test.use({ expectedUrl: '/your-route' }) at the top of the spec or describe block.`,
    );
  }
  // Welcome tests start each test with a clean session — no carry-over
  // from previous tests. The active user (e2e-user-active) auth used by
  // screens.integration.spec.ts is NOT pre-established here; tests do
  // their own register/login via registerFreshUser() or page.request.
  await page.context().clearCookies();
});

test.afterEach(async ({ page, expectedUrl }) => {
  if (expectedUrl) await expect(page).toHaveURL(expectedUrl);
});

// ============================================================================
// Test 1 — fresh signup with no next param lands on /welcome
// Proves: register → cookie set → RequireAuth approves → /welcome renders
//         for PENDING_INVITE users without bouncing back through
//         RequireActive's next-param injection (since /welcome itself
//         is the destination, no other route is involved).
// ============================================================================
test.describe('fresh signup', () => {
  test.use({ expectedUrl: '/welcome' });

  test('with no next param lands on /welcome', async ({ page, registerFreshUser }) => {
    await registerFreshUser();
    await page.goto('/welcome');
    await expect(page).toHaveURL('/welcome');
  });
});

// ============================================================================
// Test 2 — fresh signup with ?next=/library lands on /welcome?next=%2Flibrary
// Proves: PENDING user tries to access a deep-linked authed route → RequireActive
//         redirects to /welcome with the original path preserved in ?next=.
//         This is the I4 deep-link preservation property that bug `9051b36`
//         shipped — same channel (URL query) used for both /login and
//         /welcome redirects.
// ============================================================================
test.describe('fresh signup with ?next', () => {
  test.use({ expectedUrl: '/welcome?next=%2Flibrary' });

  test('with ?next=/library lands on /welcome?next=%2Flibrary', async ({
    page,
    registerFreshUser,
  }) => {
    await registerFreshUser();
    // PENDING user navigating to an authed route → RequireActive bounces
    // them to /welcome with the original path encoded as ?next=.
    await page.goto('/library');
    await expect(page).toHaveURL('/welcome?next=%2Flibrary');
  });
});

// ============================================================================
// Test 3 — successful redemption navigates to ?next destination
// Consumes: e2e-invite-code-1 (HOARD-E2EA-AAAA)
// Proves: PENDING user lands on /welcome?next=%2Flibrary → submits valid
//         code via UI → server flips status to ACTIVE → frontend reads
//         ?next from URL → safeNext('/library') passes the allowlist →
//         navigate('/library'). End-to-end deep-link preservation through
//         the redemption flow.
// ============================================================================
test.describe('successful redemption preserves ?next', () => {
  test.use({ expectedUrl: '/library' });

  test('navigates to ?next destination after redeeming a valid code', async ({
    page,
    registerFreshUser,
  }) => {
    await registerFreshUser();
    await page.goto('/welcome?next=%2Flibrary');

    await page.getByRole('button', { name: /\$ I have a code/ }).click();
    await page.getByPlaceholder('HOARD-XXXX-XXXX').fill('HOARD-E2EA-AAAA');
    await page.getByRole('button', { name: /\$ redeem/ }).click();

    await expect(page).toHaveURL('/library');
  });
});

// ============================================================================
// Test 4 — open-redirect defense: ?next=//evil.com defaults to /
// Consumes: e2e-invite-code-2 (HOARD-E2EB-BBBB)
// Proves: PENDING user lands on /welcome?next=//evil.com (attacker-crafted
//         URL) → submits valid code → server consumes code AND flips user
//         to ACTIVE (the redemption IS allowed; only the navigate is
//         filtered) → frontend reads ?next from URL → safeNext('//evil.com')
//         REJECTS per the three-rule allowlist (must start with /, NOT
//         with //, no : before any /) → defaults to '/'. Code IS consumed;
//         which code is incidental. The open-redirect filter fires
//         post-redeem, not pre-redeem.
// ============================================================================
test.describe('open-redirect defense', () => {
  test.use({ expectedUrl: '/' });

  test('redemption with ?next=//evil.com defaults to /', async ({ page, registerFreshUser }) => {
    await registerFreshUser();
    // %2F%2Fevil.com is the URL-encoded form of //evil.com — the shape an
    // attacker would deliver via a crafted link.
    await page.goto('/welcome?next=%2F%2Fevil.com');

    await page.getByRole('button', { name: /\$ I have a code/ }).click();
    await page.getByPlaceholder('HOARD-XXXX-XXXX').fill('HOARD-E2EB-BBBB');
    await page.getByRole('button', { name: /\$ redeem/ }).click();

    await expect(page).toHaveURL('/');
  });
});

// ============================================================================
// Test 5 — friction-free flow: request-access → admin generates → user redeems
// Consumes: a code generated mid-test by the admin (NOT from the seeded pool).
// Proves: full I4 friction-free path end-to-end. PENDING user without a code
//         submits the request-access form → server sets hasRequestedAccess
//         and accessRequestedAt → admin (separate auth context) generates a
//         fresh invite code → user (back on their session) submits the code
//         → redemption succeeds → status flips to ACTIVE.
//
// The multi-context-switch exercises THREE distinct auth contexts:
//   1. Fresh PENDING user — cookie A (from registerFreshUser)
//   2. Admin — cookie B (replaces A via page.request login)
//   3. Fresh user again — cookie A re-established via page.request login
//      before the UI redeem step (so the form submit uses the right user).
// ============================================================================
test.describe('friction-free flow (request-access → admin generates → redeem)', () => {
  test.use({ expectedUrl: '/' });

  test('request-access then admin generates code, user redeems, lands on /', async ({
    page,
    registerFreshUser,
  }) => {
    const { email: freshEmail } = await registerFreshUser();

    // Step 1 — PENDING user submits the access-request form via UI.
    await page.goto('/welcome');
    await page.getByRole('button', { name: /^request access$/ }).click();
    await page
      .locator('#welcome-message')
      .fill('Testing the friction-free flow per E2 spec test 5.');
    await page.getByRole('button', { name: /\$ send request/ }).click();
    await expect(page.getByText(/> request sent/)).toBeVisible();

    // Step 2 — switch to admin via page.request, generate a code.
    //
    // Admin auth is inline here per the E2.2 deferred-extraction rule:
    // keep inline UNTIL a second test needs admin actions, then promote to
    // fixtures.ts. Future test author copying this pattern: this is a
    // deferred decision, not the convention.
    const adminLogin = await page.request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: E2E_PASSWORD },
    });
    expect(adminLogin.ok()).toBeTruthy();

    const codeRes = await page.request.post('/api/admin/invite-codes', {
      data: { note: `E2 test 5 — generated for ${freshEmail}` },
    });
    expect(codeRes.ok()).toBeTruthy();
    const codeJson = (await codeRes.json()) as { code: { code: string } };
    const generatedCode = codeJson.code.code;

    // Step 3 — switch back to fresh user, navigate to /welcome with the
    // server-side state already in "hasRequestedAccess: true" land. UI
    // shows the "> request sent" header AND the code input is always
    // visible (per WelcomeScreen.tsx line 163: requestSent || inlinePanel
    // === 'code' makes the code form render unconditionally once requested).
    const freshLogin = await page.request.post('/api/auth/login', {
      data: { email: freshEmail, password: E2E_PASSWORD },
    });
    expect(freshLogin.ok()).toBeTruthy();
    await page.goto('/welcome');

    await page.getByPlaceholder('HOARD-XXXX-XXXX').fill(generatedCode);
    await page.getByRole('button', { name: /\$ redeem/ }).click();

    // Step 4 — assert ACTIVE landed at / (no ?next= was set, so safeNext
    // returns the default '/').
    await expect(page).toHaveURL('/');
  });
});

// ============================================================================
// Test 6 — API error-mapping smoke (3 of 4 RedeemInviteError codes)
// Consumes: e2e-invite-code-3 (HOARD-E2EC-CCCC, pre-redeemed by
//           e2e-user-active) for CODE_ALREADY_REDEEMED.
// Proves: the wire from real backend → RedeemInviteError code → ERROR_COPY
//         mapping → rendered error text works for INVALID_FORMAT (caught
//         client-side, no API call), CODE_NOT_FOUND (well-formed but unknown
//         → server 409), and CODE_ALREADY_REDEEMED (a code consumed by
//         SOMEONE ELSE → server 409). RATE_LIMITED is intentionally not
//         covered here (see file-level docstring + spec §E2 scope notes).
//
// Single test with three sequential assertions — same auth context, same
// welcome screen, three different code inputs against the same form. Avoids
// triple-register cost while still exercising all three error paths.
// ============================================================================
test.describe('API error-mapping smoke', () => {
  test.use({ expectedUrl: '/welcome' });

  test('renders correct error copy for INVALID_FORMAT, CODE_NOT_FOUND, CODE_ALREADY_REDEEMED', async ({
    page,
    registerFreshUser,
  }) => {
    await registerFreshUser();
    await page.goto('/welcome');
    await page.getByRole('button', { name: /\$ I have a code/ }).click();

    const codeInput = page.getByPlaceholder('HOARD-XXXX-XXXX');
    const submit = page.getByRole('button', { name: /\$ redeem/ });
    const errorMessage = page.locator('#welcome-code-error');

    // INVALID_FORMAT — client-side regex catches BEFORE API call.
    // CODE_REGEX is /^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$/ — anything not
    // matching that shape never hits the backend.
    await codeInput.fill('not-a-hoard-code');
    await submit.click();
    await expect(errorMessage).toContainText(
      "That doesn't look like a Hoard code. They look like HOARD-XXXX-XXXX.",
    );

    // CODE_NOT_FOUND — well-formed shape but doesn't exist in the test DB's
    // 5-code seeded pool (HOARD-E2E[ABCDE]-XXXX) and not generated by any
    // prior test step. Server returns 409 CODE_NOT_FOUND.
    await codeInput.fill('HOARD-XXXX-YYYY');
    await submit.click();
    await expect(errorMessage).toContainText(
      'Code not recognized. Check for typos or ask Andrea for a new one.',
    );

    // CODE_ALREADY_REDEEMED — submits e2e-invite-code-3 (pre-redeemed in
    // seed by e2e-user-active, usedAt 30d ago). Server returns 409
    // CODE_ALREADY_REDEEMED because usedById is non-null.
    await codeInput.fill('HOARD-E2EC-CCCC');
    await submit.click();
    await expect(errorMessage).toContainText('This code has already been redeemed.');
  });
});
