import { useEffect, useRef } from 'react';
import type { PlatformStatusResponse, PlatformDetail, SyncFrequency } from '@hoard/types';
import { useQuery } from './useQuery';
import { api } from '../lib/api';

/**
 * Background polling: triggers `POST /api/platforms/:code/sync` for any
 * platform whose `lastSyncAt` is older than its `syncFrequency` window.
 *
 * Mounted once at AppShell. Re-checks on:
 *   - mount (initial visit / route into the shell)
 *   - `visibilitychange` (returning to the tab from the background)
 *   - a once-per-minute interval while the tab is visible
 *
 * Skips platforms that are:
 *   - not syncable (Nintendo / Epic) — `syncable` is false
 *   - configured `MANUAL` — auto-sync opted out
 *   - already syncing (`syncStatus === 'syncing'`) — server marks the row
 *     immediately so we never stack duplicate sync jobs
 *   - locally-recently kicked off (per-code in-memory ref) — guards against
 *     a race where the cache hasn't refreshed yet but we just fired one
 *
 * The `useQuery('platformStatus', …)` mount dedupes with Sidebar's mount,
 * so this doesn't add a second network request — it piggybacks the cache.
 */
const FREQ_TO_MS: Record<SyncFrequency, number> = {
  FIVE_MIN: 5 * 60 * 1000,
  FIFTEEN_MIN: 15 * 60 * 1000,
  HOURLY: 60 * 60 * 1000,
  // MANUAL is encoded as Infinity so the "overdue?" check never fires.
  MANUAL: Number.POSITIVE_INFINITY,
};

const RECHECK_INTERVAL_MS = 60_000;

function isOverdue(p: PlatformDetail, now: number): boolean {
  if (!p.syncable) return false;
  if (p.syncStatus === 'syncing') return false;
  const interval = FREQ_TO_MS[p.syncFrequency];
  if (!Number.isFinite(interval)) return false;
  if (!p.lastSyncAt) return true;
  return now - new Date(p.lastSyncAt).getTime() > interval;
}

export function useAutoSync(): void {
  const { data } = useQuery<PlatformStatusResponse>(
    'platformStatus',
    () => api.platformStatus(),
    { staleMs: 30_000 },
  );

  // Tracks the last time we kicked off a sync for each platform code. Guards
  // the window between firing the POST and the cache refresh that flips
  // `syncStatus` to 'syncing' — without this we'd re-fire on the next tick.
  const lastKickedRef = useRef<Map<string, number>>(new Map());

  // Latest platforms list, kept in a ref so the effect's interval handler
  // sees fresh data without re-creating the interval on every refetch.
  const platformsRef = useRef<PlatformDetail[]>([]);
  platformsRef.current = data?.platforms ?? [];

  useEffect(() => {
    let stopped = false;

    const tick = () => {
      if (stopped || document.hidden) return;
      const now = Date.now();
      for (const p of platformsRef.current) {
        if (!isOverdue(p, now)) continue;
        const last = lastKickedRef.current.get(p.code);
        if (last && now - last < FREQ_TO_MS[p.syncFrequency]) continue;
        lastKickedRef.current.set(p.code, now);
        void api.syncPlatform(p.code).catch(() => {
          // Failure is non-fatal — clear the kick stamp so we can retry on
          // the next tick. The user-visible "manual sync" button does its
          // own state management for explicit retries.
          lastKickedRef.current.delete(p.code);
        });
      }
    };

    tick();
    const id = setInterval(tick, RECHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
}

// Exported for unit tests.
export const __testing = { isOverdue, FREQ_TO_MS };
