import { defineConfig, devices } from '@playwright/test';

// Offline E2E config — builds the web app and serves it via vite preview
// (the dev server has the PWA service worker disabled). The API is started
// separately via npm run dev:api so /api/* requests succeed during the
// initial load before the test goes offline.
export default defineConfig({
  testDir: './tests/e2e-offline',
  outputDir: './tests/results-offline',

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  use: {
    baseURL: 'http://localhost:4173',
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
  ],

  webServer: [
    {
      command: 'npm run dev:api',
      cwd: '../..',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
