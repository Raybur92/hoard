import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a new build does NOT silently swap the
      // SW. Instead `PWAUpdatePrompt` (useRegisterSW → onNeedRefresh) shows a
      // "// new version available · reload" toast and only calls
      // updateServiceWorker(true) — which posts SKIP_WAITING + reloads — when
      // the user accepts. This replaces the old workbox `skipWaiting: true`
      // (removed): autoUpdate still left installed iOS standalone PWAs stale
      // for a launch or two because they don't reliably poll for a new SW.
      // The component pairs this with an explicit registration.update() on
      // foreground + interval so deploys actually reach the home-screen app
      // without the delete-and-re-add dance. (Supersedes the post-Luigi
      // skipWaiting decision — same goal, reliably delivered + user-visible.)
      registerType: 'prompt',
      manifest: false, // use existing public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Stale-while-revalidate for shell endpoints fired on every nav.
            // Lets the sidebar/header repaint instantly from cache while a
            // background refetch keeps data current.
            urlPattern: /\/api\/(auth\/me|games\/counts|platforms\/status)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-shell',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Network-first for API data routes used by the main screens
            urlPattern: /\/api\/(dashboard|games|upcoming)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-data',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Threads pool (worker_threads) instead of vitest's default forks pool.
    // Forks-pool hangs locally on machines under memory pressure (each fork
    // loads ~2 GB heap, ~6 forks compete with dev servers + other tools);
    // threads-pool runs the full suite cleanly in ~5s. Discovered during
    // E1 E2E setup (docs/E2E_RESTORATION_PLAN.md commit 3 prep). CI is its
    // own environment, but this matches what proved reliable locally and
    // costs nothing on Ubuntu runners.
    pool: 'threads',
    coverage: {
      reporter: ['text', 'lcov'],
      exclude: ['src/main.tsx', '**/*.d.ts'],
    },
  },
});
