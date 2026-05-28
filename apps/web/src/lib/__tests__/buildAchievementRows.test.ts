import { describe, it, expect } from 'vitest';
import { buildAchievementRows } from '../utils';
import type { AchievementsByPlatform } from '@hoard/types';

const ent = (earned: number, total: number, percent: number) => ({
  earned,
  total,
  percent,
  updatedAt: '2026-05-27T00:00:00.000Z',
});

describe('buildAchievementRows (M0 — per-platform shape)', () => {
  it('returns [] for null/undefined/empty input', () => {
    expect(buildAchievementRows(null)).toEqual([]);
    expect(buildAchievementRows(undefined)).toEqual([]);
    expect(buildAchievementRows({})).toEqual([]);
  });

  it('skips entries with total <= 0 (defensive guard against malformed writes)', () => {
    const abp: AchievementsByPlatform = { ST: ent(0, 0, 0) };
    expect(buildAchievementRows(abp)).toEqual([]);
  });

  it('renders a single Steam row labelled "achievements"', () => {
    const abp: AchievementsByPlatform = { ST: ent(28, 44, 64) };
    const rows = buildAchievementRows(abp);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      code: 'ST',
      label: 'achievements',
      earned: 28,
      total: 44,
      percent: 64,
      updatedAt: '2026-05-27T00:00:00.000Z',
    });
  });

  it('renders a single PSN row labelled "trophies" (Sony branding)', () => {
    const abp: AchievementsByPlatform = { PS: ent(16, 52, 31) };
    const rows = buildAchievementRows(abp);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('trophies');
  });

  it('renders multiple rows for cross-platform games with PS first then ST (stable order)', () => {
    // Cyberpunk-style: same game on Steam (44 achievements) + PSN (45 trophies)
    const abp: AchievementsByPlatform = {
      ST: ent(28, 44, 64),
      PS: ent(30, 45, 67),
    };
    const rows = buildAchievementRows(abp);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.code).toBe('PS');
    expect(rows[0]?.label).toBe('trophies');
    expect(rows[1]?.code).toBe('ST');
    expect(rows[1]?.label).toBe('achievements');
  });

  it('treats every non-PSN platform code as "achievements" (Xbox / GOG / Nintendo / Epic)', () => {
    const abp: AchievementsByPlatform = {
      XB: ent(5, 10, 50),
      GG: ent(3, 8, 38),
      NT: ent(7, 15, 47),
      EP: ent(2, 4, 50),
    };
    const rows = buildAchievementRows(abp);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.label).toBe('achievements');
    }
  });

  it('orders multi-platform rows by PS → ST → XB → GG → NT → EP for stable rendering', () => {
    const abp: AchievementsByPlatform = {
      EP: ent(1, 1, 100),
      NT: ent(2, 2, 100),
      GG: ent(3, 3, 100),
      XB: ent(4, 4, 100),
      ST: ent(5, 5, 100),
      PS: ent(6, 6, 100),
    };
    const rows = buildAchievementRows(abp);
    expect(rows.map((r) => r.code)).toEqual(['PS', 'ST', 'XB', 'GG', 'NT', 'EP']);
  });
});
