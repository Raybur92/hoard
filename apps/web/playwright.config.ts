import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load DATABASE_URL_TEST from apps/web/.env.test if not already set in env.
// CI sets it directly via the GH Actions secret block; this is a DX shim
// so local runs don't require an explicit `export DATABASE_URL_TEST=...`
// every shell. Single-key parser keeps us dotenv-free.
if (!process.env['DATABASE_URL_TEST']) {
  const envPath = path.join(__dirname, '.env.test');
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('DATABASE_URL_TEST='));
    if (line) {
      process.env['DATABASE_URL_TEST'] = line.replace(/^DATABASE_URL_TEST=/, '').trim();
    }
  }
}

if (!process.env['DATABASE_URL_TEST']) {
  throw new Error(
    'DATABASE_URL_TEST is required for E2E.\n' +
      'Set it in apps/web/.env.test (local) or as a GitHub Actions secret (CI).\n' +
      'See docs/E2E_RESTORATION_PLAN.md §4.6 step 5 for the connection-string shape.',
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  snapshotDir: './tests/snapshots',
  outputDir: './tests/results',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],

  // Start BOTH the API (port 3001) and the web Vite server (port 5173).
  // Without the API, every authenticated route 401s and <RequireAuth>
  // redirects to /login — which used to silently corrupt visual snapshots.
  //
  // The API webServer overrides DATABASE_URL with DATABASE_URL_TEST so the
  // API process boots against the dedicated hoard-test Supabase project,
  // not prod. dotenv in the API process does NOT override env vars set by
  // the parent (dotenv default behavior), so this Playwright-supplied URL
  // wins over apps/api/.env's DATABASE_URL.
  //
  // FOOT-GUN: `reuseExistingServer: !CI` is true locally. If you already
  // have `npm run dev:api` running against prod's DATABASE_URL in another
  // terminal, Playwright will reuse THAT process and E2E will hit prod
  // data. Kill the existing dev:api before running E2E locally. CI always
  // starts fresh (CI is truthy → reuseExistingServer is false).
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: '../..',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: process.env['DATABASE_URL_TEST']!,
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
