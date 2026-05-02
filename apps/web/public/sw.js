/* global self */
/* Hoard service worker — Phase 2 stub (no caching yet; Phase 6 adds Workbox) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
