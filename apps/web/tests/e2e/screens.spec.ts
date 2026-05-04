import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function waitForRender(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Dashboard /', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
  });

  test('shows game count', async ({ page }) => {
    await expect(page.locator('.bignum').first()).toContainText(/\d+/);
  });

  test('shows now-playing section', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 1024) {
      await expect(page.getByText('Hollow Knight: Silksong').first()).toBeVisible();
    } else {
      await expect(page.getByText('now playing')).toBeVisible();
    }
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Library /library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await waitForRender(page);
  });

  test('shows all 6 shelves', async ({ page }) => {
    for (const name of ['Now Playing', 'Backlog', 'Completed', 'On Hold', 'Dropped', 'Wishlist']) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
  });

  test('shows HLTB hint on backlog item', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 1024) {
      await expect(page.getByText('HLTB').first()).toBeVisible();
    } else {
      // Mobile: HLTB rendered as ~60h, ~12h, etc. in the backlog shelf
      await expect(page.getByText(/~\d+h/).first()).toBeVisible();
    }
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('library.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Upcoming /upcoming', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/upcoming');
    await waitForRender(page);
  });

  test('shows featured countdown', async ({ page }) => {
    await expect(page.getByText(/^T-\d+$/).first()).toBeVisible();
  });

  test('shows agenda list', async ({ page }) => {
    await expect(page.getByText('Pragmata').first()).toBeVisible();
    await expect(page.getByText('Death Stranding 2').first()).toBeVisible();
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('upcoming.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Game Detail /game/:id', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/game/seed-elden-ring');
    await waitForRender(page);
  });

  test('shows game title', async ({ page }) => {
    await expect(page.getByText('ELDEN RING').first()).toBeVisible();
  });

  test('shows receipt', async ({ page }) => {
    await expect(page.locator('.receipt').first()).toBeVisible();
    await expect(page.getByText('thank u for hoarding').first()).toBeVisible();
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('game-detail.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Navigation', () => {
  test('sidebar active state follows route (desktop)', async ({ page, viewport }) => {
    if (!viewport || viewport.width < 1024) test.skip();
    await page.goto('/library');
    await waitForRender(page);
    // sidebar item for Library should be active
    await expect(page.locator('.sidebar .item.active')).toContainText('Library');
  });

  test('tab bar active state follows route (mobile)', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 1024) test.skip();
    await page.goto('/library');
    await waitForRender(page);
    await expect(page.locator('.m-tabbar .item.active')).toContainText('Library');
  });

  test('navigating from dashboard to library works', async ({ page, viewport }) => {
    await page.goto('/');
    await waitForRender(page);
    if (viewport && viewport.width >= 1024) {
      await page.locator('.sidebar .item').filter({ hasText: 'Library' }).click();
    } else {
      await page.locator('.m-tabbar .item').filter({ hasText: 'Library' }).click();
    }
    await expect(page).toHaveURL('/library');
    await expect(page.getByText('Now Playing').first()).toBeVisible();
  });
});
