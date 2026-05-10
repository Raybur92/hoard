import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// apps/web/package.json is `"type": "module"`, so __dirname is undefined here.
// Resolve the config's own directory from import.meta.url instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load apps/web/.env.test into process.env if any of its keys aren't
// already set. CI sets the keys directly via GH Actions secret block;
// this is a DX shim so local runs don't require explicit `export X=...`
// every shell. Minimal KEY=VALUE parser keeps us dotenv-free; supports
// the keys E2E needs today (DATABASE_URL_TEST, E2E_TEST_PASSWORD) plus
// any future ones without per-key edits.
//
// Precedence: ALREADY-SET ENV WINS. If a key is already present in
// process.env, the value from .env.test does NOT override it. This is
// the right default — CI sets these via real secrets, and a developer
// might have a stale `DATABASE_URL` exported from a previous shell that
// should NOT silently get replaced by the test file's value. Reverse
// precedence (file wins) would be a footgun.
const envTestPath = path.join(__dirname, '.env.test');
if (fs.existsSync(envTestPath)) {
  const lines = fs.readFileSync(envTestPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    // Strip matching paired single or double quotes — some devs reflexively
    // quote .env values from shell-script muscle memory; we don't want a
    // login POST sending `"hunter2"` as the literal password.
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["'](.*)["']$/, '$1');
    if (!process.env[key]) process.env[key] = value;
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
