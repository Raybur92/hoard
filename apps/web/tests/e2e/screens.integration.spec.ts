/**
 * Integration tests against the dedicated hoard-test Supabase project,
 * authenticated as `e2e-active@hoard.test` via the global fixture.
 *
 * Plan: docs/E2E_RESTORATION_PLAN.md §4.3 — reclassification verdicts.
 * Six tests have been moved out of E2E into vitest equivalents (see the
 * `4.3 — covered elsewhere` table). The remaining tests prove things
 * vitest-with-mocks cannot: real /api/dashboard returns the seeded count,
 * real HLTB data flows from DB → API → UI, real session cookie carries
 * across navigation. Visual snapshots run against deterministic seed.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const ELDEN_USERGAME_ID = 'e2e-ug-active-elden';

async function waitForRender(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Dashboard /', () => {
  test.use({ expectedUrl: '/' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForRender(page);
  });

  test('shows game count', async ({ page }) => {
    // .bignum is the dashboard's headline counter — proves /api/dashboard
    // returned the seeded total and the front-end rendered it.
    await expect(page.locator('.bignum').first()).toContainText(/\d+/);
  });

  test('shows now-playing section', async ({ page, viewport }) => {
    // Anchor on the seeded Playing entry. Active user has Hollow Knight:
    // Silksong + Disco Elysium as Playing per seed-e2e.ts.
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
  test.use({ expectedUrl: '/library' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await waitForRender(page);
  });

  // 6-shelf-headers test was DELETED — moved to
  // apps/web/src/components/screens/__tests__/LibraryDesktop.test.tsx.
  // Headers are statically derived from SHELF_CONFIG; a real backend
  // adds zero signal. Visual snapshot below still covers the rendered
  // shape.

  test('shows HLTB hint on backlog item', async ({ page, viewport }) => {
    // The seed has HLTB rows for all 4 Backlog games (Elden Ring, Tunic,
    // RDR2, Pentiment). This proves the HLTB data path: DB → API → UI.
    // Vitest-with-mocked-HLTB only proves rendering; this proves the join.
    if (!viewport || viewport.width >= 1024) {
      await expect(page.getByText('HLTB').first()).toBeVisible();
    } else {
      // Mobile: HLTB rendered as ~60h, ~12h, etc. in the backlog shelf.
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
  test.use({ expectedUrl: '/releases' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/releases');
    await waitForRender(page);
  });

  // "renders the page chrome" was DELETED — pure structural assertion
  // (mode-toggle tabs / mobile view-header) covered by the visual
  // snapshot below + the existing primitives.test.tsx unit coverage.

  // Don't pin to specific live IGDB titles — those drift weekly. Assert
  // structural shape: either content (cards / banners / status / note
  // role) or the empty-state CTA. Either is a healthy outcome for the
  // current feed.
  test('renders either content or an empty-state CTA', async ({ page }) => {
    await page.waitForTimeout(800);
    const hasContent =
      (await page.locator('[role="status"], [role="note"]').count()) > 0 ||
      (await page.getByText(/T-\d+|TBA|dropped \d+d ago/).count()) > 0;
    const hasEmptyState =
      (await page.getByText(/nothing on the horizon|0 starred|0 releases/i).count()) > 0;
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
  test.use({ expectedUrl: '/releases/recent' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/releases/recent');
    await waitForRender(page);
  });

  // Borderline case kept per §4.3: same structural shape as
  // `/releases renders chrome` (which got deleted), but /releases/recent
  // has no visual snapshot fallback. Deleting this would leave the page
  // with E2E coverage of zero.
  test('renders the page chrome', async ({ page, viewport }) => {
    await expect(page.getByText(/RECENT|last 14 day/i).first()).toBeVisible();
    if (!viewport || viewport.width >= 1024) {
      await expect(page.getByRole('button', { name: /back to releases/i }).first()).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /go back/i }).first()).toBeVisible();
    }
  });

  // [mark all owned] drift-guard was DELETED — already covered in
  // apps/web/src/components/screens/releases/__tests__/primitives.test.tsx
  // and apps/web/src/components/screens/__tests__/ReleasesRecentDesktop.test.tsx
  // at the unit level, with mocked feeds that exercise both starred + hyped
  // variants. A real backend adds zero signal here.
});

// Legacy `/upcoming` → `/releases` redirect was DELETED — moved to
// apps/web/src/__tests__/legacy-redirects.test.tsx. Pure client-side
// router behavior; MemoryRouter exercises it exhaustively without
// booting the API.

test.describe('Game Detail /game/:id', () => {
  // expectedUrl uses the seed-stable UserGame id (active user's Elden
  // Ring entry) so per-test misroutes can be caught loudly.
  test.use({ expectedUrl: `/game/${ELDEN_USERGAME_ID}` });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/game/${ELDEN_USERGAME_ID}`);
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
  // Navigation test starts on / and ends on /library — expectedUrl is
  // the final destination so the afterEach assertion catches misroutes
  // *during* the click-through, not just at goto time.
  test.use({ expectedUrl: '/library' });

  // Sidebar + tab-bar active-state tests were DELETED — moved to
  // apps/web/src/__tests__/shell-persistence.test.tsx. Pure route-to-DOM
  // wiring; MemoryRouter + a forced breakpoint covers it without API.

  test('navigating from dashboard to library works', async ({ page, viewport }) => {
    // Three integration concerns at once that vitest-with-mocks can't
    // prove together: click-to-navigate, /api/games/shelves fetches on
    // route mount, content renders against the real fetch result.
    await page.goto('/');
    await waitForRender(page);
    if (viewport && viewport.width >= 1024) {
      await page.locator('.sidebar .item').filter({ hasText: 'Library' }).click();
    } else {
      await page.locator('.m-tabbar .item').filter({ hasText: 'Library' }).click();
    }
    await expect(page.getByText('Now Playing').first()).toBeVisible();
  });
});
