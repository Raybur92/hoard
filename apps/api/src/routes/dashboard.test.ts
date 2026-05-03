import request from 'supertest';

jest.mock('@hoard/db', () => ({
  prisma: {
    userGame: { findMany: jest.fn() },
    platform: { findMany: jest.fn() },
    wishlistRelease: { findMany: jest.fn() },
  },
}));

jest.mock('../middleware/user', () => ({
  requireUser: (req: any, _res: any, next: any) => { req.userId = 'test-user-id'; next(); },
  requireAuth: (req: any, _res: any, next: any) => { req.userId = 'test-user-id'; next(); },
}));

import { app } from '../index';
import { prisma } from '@hoard/db';

beforeEach(() => {
  jest.resetAllMocks();
});

const makeUserGame = (overrides: Partial<{ id: string; status: string; mainStory: number | null }> = {}) => ({
  id: overrides.id ?? 'ug-1',
  userId: 'test-user-id',
  gameId: 'game-1',
  status: overrides.status ?? 'Backlog',
  playtimeByPlatform: { ST: 600, PS: 300 } as Record<string, number>,
  lastPlayedAt: new Date('2025-01-01'),
  notes: null,
  rating: null,
  addedAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  game: {
    id: 'game-1',
    igdbId: 1942,
    title: 'Hollow Knight',
    developer: 'Team Cherry',
    releaseYear: 2017,
    genres: ['Platformer', 'Metroidvania'],
    coverUrl: null,
    hltbData: overrides.mainStory != null
      ? { id: 'h-1', gameId: 'game-1', mainStory: overrides.mainStory, mainExtras: null, completionist: null, fetchedAt: new Date() }
      : null,
  },
});

describe('GET /api/dashboard', () => {
  it('returns the full DashboardResponse shape with all required fields', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUserGame({ id: 'ug-1', status: 'Playing', mainStory: 1500 }),
      makeUserGame({ id: 'ug-2', status: 'Backlog', mainStory: 600 }),
      makeUserGame({ id: 'ug-3', status: 'Completed' }),
    ]);
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([
      { id: 'p-1', userId: 'test-user-id', code: 'ST', syncable: true, lastSyncAt: new Date(), syncStatus: 'ok' },
    ]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalGames).toBe(3);
    expect(res.body.stats.playingCount).toBe(1);
    expect(res.body.stats.backlogCount).toBe(1);
    expect(res.body.stats.completedCount).toBe(1);
    expect(res.body.stats.totalPlaytimeMinutes).toBe(2700); // 3 games × (600+300)
    expect(res.body.nowPlaying).toHaveLength(1);
    expect(res.body.platforms).toHaveLength(1);
    expect(res.body.backlogPick).toBeDefined();
    expect(res.body.backlogItems).toBeDefined();
    expect(res.body.wishlistCountdown).toEqual([]);
  });

  it('sorts backlog items by HLTB mainStory ascending so backlogPick is the shortest', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([
      makeUserGame({ id: 'ug-long', status: 'Backlog', mainStory: 3000 }),
      makeUserGame({ id: 'ug-short', status: 'Backlog', mainStory: 600 }),
      makeUserGame({ id: 'ug-mid', status: 'Backlog', mainStory: 1200 }),
    ]);
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.backlogPick.id).toBe('ug-short');
    expect(res.body.backlogItems[0].id).toBe('ug-short');
    expect(res.body.backlogItems[1].id).toBe('ug-mid');
    expect(res.body.backlogItems[2].id).toBe('ug-long');
  });

  it('handles empty libraries without crashing', async () => {
    (prisma.userGame.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.platform.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.wishlistRelease.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.stats.totalGames).toBe(0);
    expect(res.body.backlogPick).toBeNull();
    expect(res.body.nowPlaying).toEqual([]);
  });
});
