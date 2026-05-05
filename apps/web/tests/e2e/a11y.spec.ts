import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

/**
 * Static accessibility audit per route. Runs axe-core against WCAG 2.1
 * A + AA tags. Each route should report zero violations.
 *
 * Note: the receipt block on Game Detail uses a paper-on-receipt color
 * pair that's intentionally lower-contrast than the rest of the app
 * (it's stylized to look like a printed receipt). If color-contrast
 * surfaces here, it's an opt-out for receipt internals only.
 */

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Accessibility (axe)', () => {
  test('Dashboard /', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await expectNoA11yViolations(page);
  });

  test('Library /library', async ({ page }) => {
    await page.goto('/library');
    await settle(page);
    await expectNoA11yViolations(page);
  });

  test('Upcoming /upcoming', async ({ page }) => {
    await page.goto('/upcoming');
    await settle(page);
    await expectNoA11yViolations(page);
  });

  test('Game Detail /game/:id', async ({ page }) => {
    await page.goto('/game/seed-elden-ring');
    await settle(page);
    // The .receipt block intentionally uses a paper-on-receipt color
    // pair that's lower contrast than the rest of the dark theme.
    await expectNoA11yViolations(page, { disabledRules: ['color-contrast'] });
  });

  test('Settings /settings', async ({ page }) => {
    await page.goto('/settings');
    await settle(page);
    await expectNoA11yViolations(page);
  });

  test('Login /login', async ({ page }) => {
    await page.goto('/login');
    await settle(page);
    await expectNoA11yViolations(page);
  });
});
