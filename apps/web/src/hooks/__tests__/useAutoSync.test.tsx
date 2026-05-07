import { describe, it, expect } from 'vitest';
import type { PlatformDetail } from '@hoard/types';
import { __testing } from '../useAutoSync';

const { isOverdue, FREQ_TO_MS } = __testing;

function makePlatform(overrides: Partial<PlatformDetail> = {}): PlatformDetail {
  return {
    id: 'plat-1',
    userId: 'u1',
    code: 'ST',
    name: 'Steam',
    syncable: true,
    connected: true,
    syncStatus: 'ok',
    syncFrequency: 'HOURLY',
    lastSyncAt: null,
    gameCount: 100,
    who: 'andrea',
    ...overrides,
  };
}

const NOW = new Date('2026-05-07T12:00:00.000Z').getTime();

describe('useAutoSync — isOverdue rules', () => {
  it('returns false for non-syncable platforms (Nintendo / Epic)', () => {
    expect(isOverdue(makePlatform({ syncable: false, code: 'NT' }), NOW)).toBe(false);
  });

  it('returns false for MANUAL frequency regardless of lastSyncAt', () => {
    expect(isOverdue(makePlatform({ syncFrequency: 'MANUAL', lastSyncAt: null }), NOW)).toBe(false);
    const ancient = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isOverdue(makePlatform({ syncFrequency: 'MANUAL', lastSyncAt: ancient }), NOW)).toBe(false);
  });

  it('returns false while a sync is already in progress', () => {
    expect(isOverdue(makePlatform({ syncStatus: 'syncing', lastSyncAt: null }), NOW)).toBe(false);
  });

  it('returns true when the platform has never synced', () => {
    expect(isOverdue(makePlatform({ syncFrequency: 'HOURLY', lastSyncAt: null }), NOW)).toBe(true);
  });

  it('returns true when lastSyncAt is older than the frequency window', () => {
    const stale = new Date(NOW - FREQ_TO_MS.HOURLY - 1000).toISOString();
    expect(isOverdue(makePlatform({ syncFrequency: 'HOURLY', lastSyncAt: stale }), NOW)).toBe(true);
  });

  it('returns false when lastSyncAt is inside the frequency window', () => {
    const fresh = new Date(NOW - 10 * 60 * 1000).toISOString(); // 10 min ago
    expect(isOverdue(makePlatform({ syncFrequency: 'HOURLY', lastSyncAt: fresh }), NOW)).toBe(false);
  });

  it('respects the FIVE_MIN window', () => {
    const fourMinAgo = new Date(NOW - 4 * 60 * 1000).toISOString();
    expect(isOverdue(makePlatform({ syncFrequency: 'FIVE_MIN', lastSyncAt: fourMinAgo }), NOW)).toBe(false);
    const sixMinAgo = new Date(NOW - 6 * 60 * 1000).toISOString();
    expect(isOverdue(makePlatform({ syncFrequency: 'FIVE_MIN', lastSyncAt: sixMinAgo }), NOW)).toBe(true);
  });
});
