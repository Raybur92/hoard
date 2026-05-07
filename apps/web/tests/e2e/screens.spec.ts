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

test.describe('Releases /releases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/releases');
    await waitForRender(page);
  });

  // Wishlist mode is the default. The hero only renders when there's a
  // future starred release globally (D5). The page header is stable
  // regardless of feed contents.
  test('renders the page chrome', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 1024) {
      // Desktop: mode toggle + breadcrumb.
      await expect(page.getByRole('tab', { name: /^WISHLIST$/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /^ALL RELEASES$/i })).toBeVisible();
    } else {
      // Mobile: tappable view label opens the sheet (caret glyph present).
      await expect(page.locator('.m-view-header')).toBeVisible();
    }
  });

  // Don't pin to specific live IGDB titles — those drift weekly. Assert
  // structural shape: either a card / row exists, or the empty-state CTA
  // is rendered. Either is a healthy outcome for the current feed.
  test('renders either content or an empty-state CTA', async ({ page }) => {
    // Wait briefly for client fetch to settle — useUpcoming + useQuery hydrate.
    await page.waitForTimeout(800);
    const hasContent = await page.locator('[role="status"], [role="note"]').count() > 0
      || await page.getByText(/T-\d+|TBA|dropped \d+d ago/).count() > 0;
    const hasEmptyState = await page.getByText(/nothing on the horizon|0 starred|0 releases/i).count() > 0;
    if (!hasContent && !hasEmptyState) {
      throw new Error('Releases page rendered neither content nor an empty-state CTA');
    }
  });

  test('visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('releases.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Releases recent /releases/recent', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/releases/recent');
    await waitForRender(page);
  });

  test('renders the page chrome', async ({ page }) => {
    await expect(page.getByText(/RECENT|last 14 day/i).first()).toBeVisible();
    // back-to-releases CTA should always be reachable.
    await expect(page.getByRole('button', { name: /back to releases/i }).first()).toBeVisible();
  });

  test('drift-guard: no [mark all owned] anywhere on the page', async ({ page }) => {
    await expect(page.getByRole('button', { name: /mark all owned/i })).toHaveCount(0);
  });
});

test.describe('Legacy redirects', () => {
  test('/upcoming redirects to /releases', async ({ page }) => {
    await page.goto('/upcoming');
    await waitForRender(page);
    await expect(page).toHaveURL(/\/releases(\?.*)?$/);
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
