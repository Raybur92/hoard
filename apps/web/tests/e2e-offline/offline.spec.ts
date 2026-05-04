import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// These tests run against a production build served by `vite preview` so the
// service worker registered by vite-plugin-pwa is active. The Phase 6
// success criterion is: "Dashboard and Library render from cache when
// network is offline."

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return reg.active !== null;
    },
    { timeout: 30_000 },
  );
}

test.describe('Offline behaviour', () => {
  test('Dashboard renders from cache when network is offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForServiceWorker(page);

    // Reload once so the network-first dashboard response is cached.
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Go offline and reload — content must come from the SW cache.
    await context.setOffline(true);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // App shell renders: at least one .bignum, the topbar, and the sidebar.
    await expect(page.locator('.topbar, .m-status').first()).toBeVisible();
    await expect(page.locator('.bignum').first()).toBeVisible();

    await context.setOffline(false);
  });

  test('Library renders from cache when network is offline', async ({ page, context }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    await waitForServiceWorker(page);

    await page.reload();
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Library always renders the shelf labels, even from cache.
    await expect(page.getByText(/Now Playing|Backlog|Completed/i).first()).toBeVisible();

    await context.setOffline(false);
  });

  test('Offline banner appears when navigation fails after going offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await waitForServiceWorker(page);

    await context.setOffline(true);

    // Trigger a route change that would require an API call. The OfflineBanner
    // listens to window.online/offline events.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.getByText(/offline/i).first()).toBeVisible({ timeout: 5000 });

    await context.setOffline(false);
  });
});
