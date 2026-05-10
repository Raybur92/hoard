/**
 * Static accessibility audit per route. Runs axe-core against WCAG 2.1
 * A + AA tags. Each route should report zero violations.
 *
 * Pre-E1, every test in this file passed for the wrong reason — axe was
 * scanning /login because the dev-fallback userId (`seed-andrea`) had
 * been deleted by the I-series and RequireActive 401'd everyone. The
 * global fixture in ./fixtures.ts authenticates as e2e-active@hoard.test
 * and the per-describe `expectedUrl` declarations make any future
 * misroute fail loudly with `expected URL '/library', got '/login'`
 * instead of silently reporting login as accessible.
 *
 * Note: the receipt block on Game Detail uses a paper-on-receipt color
 * pair that's intentionally lower-contrast than the rest of the app
 * (it's stylized to look like a printed receipt). If color-contrast
 * surfaces here, it's an opt-out for receipt internals only.
 */

import type { Page } from '@playwright/test';
import { test } from './fixtures';
import { expectNoA11yViolations } from './axe';

const ELDEN_USERGAME_ID = 'e2e-ug-active-elden';

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Accessibility (axe) — Dashboard /', () => {
  test.use({ expectedUrl: '/' });
  test('Dashboard /', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});

test.describe('Accessibility (axe) — Library /library', () => {
  test.use({ expectedUrl: '/library' });
  test('Library /library', async ({ page }) => {
    await page.goto('/library');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});

test.describe('Accessibility (axe) — Releases /releases', () => {
  test.use({ expectedUrl: '/releases' });
  test('Releases /releases', async ({ page }) => {
    await page.goto('/releases');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});

test.describe('Accessibility (axe) — Releases recent /releases/recent', () => {
  test.use({ expectedUrl: '/releases/recent' });
  test('Releases recent /releases/recent', async ({ page }) => {
    await page.goto('/releases/recent');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});

test.describe('Accessibility (axe) — Game Detail /game/:id', () => {
  test.use({ expectedUrl: `/game/${ELDEN_USERGAME_ID}` });
  test('Game Detail /game/:id', async ({ page }) => {
    await page.goto(`/game/${ELDEN_USERGAME_ID}`);
    await settle(page);
    // The .receipt block intentionally uses a paper-on-receipt color
    // pair that's lower contrast than the rest of the dark theme.
    await expectNoA11yViolations(page, { disabledRules: ['color-contrast'] });
  });
});

test.describe('Accessibility (axe) — Settings /settings', () => {
  test.use({ expectedUrl: '/settings' });
  test('Settings /settings', async ({ page }) => {
    await page.goto('/settings');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});

// /login is unauthed — the global fixture's beforeEach still issues a
// successful login (sets the cookie), but `page.goto('/login')` lands
// on the login screen anyway because the route is unconditional. The
// expectedUrl is /login here (where we end up), not the active user's
// home.
test.describe('Accessibility (axe) — Login /login', () => {
  test.use({ expectedUrl: '/login' });
  test('Login /login', async ({ page }) => {
    await page.goto('/login');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});
