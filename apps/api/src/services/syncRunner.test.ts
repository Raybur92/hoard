jest.mock('@hoard/db', () => ({
  prisma: {
    game: { upsert: jest.fn() },
    userGame: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    hltbData: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('./igdb', () => ({
  searchGames: jest.fn(),
}));

jest.mock('./hltb', () => ({
  fetchHltb: jest.fn(),
}));

import { runSync } from './syncRunner';
import { prisma } from '@hoard/db';
import { searchGames } from './igdb';
import type { SyncedGame } from './platforms/steam';

const mockIgdbResult = {
  igdbId: 101,
  title: 'Hollow Knight',
  developer: 'Team Cherry',
  releaseYear: 2017,
  genres: ['Platform'],
  coverUrl: 'https://example.com/cover.jpg',
};

const mockGame = { id: 'game-1', ...mockIgdbResult };

const syncedGame: SyncedGame = {
  igdbSearchTitle: 'Hollow Knight',
  platformCode: 'ST',
  playtimeMinutes: 300,
  lastPlayedAt: new Date('2024-01-15'),
};

beforeEach(() => {
  jest.resetAllMocks();
  (searchGames as jest.Mock).mockResolvedValue([mockIgdbResult]);
  (prisma.game.upsert as jest.Mock).mockResolvedValue(mockGame);
  (prisma.userGame.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.userGame.upsert as jest.Mock).mockResolvedValue({ id: 'ug-1' });
  (prisma.hltbData.findUnique as jest.Mock).mockResolvedValue(null);
});

describe('runSync', () => {
  it('imports a new game and returns correct counts', async () => {
    const result = await runSync('user-1', [syncedGame]);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('calls prisma.game.upsert with IGDB data', async () => {
    await runSync('user-1', [syncedGame]);
    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { igdbId: 101 },
        create: expect.objectContaining({ title: 'Hollow Knight', developer: 'Team Cherry' }),
      }),
    );
  });

  it('creates a UserGame with OnHold status when synced playtime > 0', async () => {
    await runSync('user-1', [syncedGame]);
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'user-1', status: 'OnHold' }),
      }),
    );
  });

  it('creates a UserGame with Backlog status when synced playtime is 0', async () => {
    await runSync('user-1', [{ ...syncedGame, playtimeMinutes: 0 }]);
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'user-1', status: 'Backlog' }),
      }),
    );
  });

  it('merges playtime instead of overwriting when game already exists', async () => {
    (prisma.userGame.findUnique as jest.Mock).mockResolvedValue({
      playtimeByPlatform: { ST: 500 }, // existing Steam playtime
      lastPlayedAt: null,
    });

    await runSync('user-1', [{ ...syncedGame, playtimeMinutes: 200 }]);

    // Should keep the higher value (500), not overwrite with 200
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          playtimeByPlatform: { ST: 500 },
        }),
      }),
    );
  });

  it('skips a game when IGDB returns no results', async () => {
    (searchGames as jest.Mock).mockResolvedValue([]);
    const result = await runSync('user-1', [syncedGame]);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.game.upsert).not.toHaveBeenCalled();
  });

  it('deduplicates: two platforms with same game produce one UserGame', async () => {
    const psnGame: SyncedGame = { ...syncedGame, platformCode: 'PS', playtimeMinutes: 100 };

    // After first upsert, findUnique returns the created record for the second
    (prisma.userGame.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ playtimeByPlatform: { ST: 300 }, lastPlayedAt: null });

    await runSync('user-1', [syncedGame, psnGame]);

    // Both games resolve to the same igdbId=101 → same game record
    expect(prisma.game.upsert).toHaveBeenCalledTimes(2);
    // Both lead to UserGame upserts for the same userId+gameId
    expect(prisma.userGame.upsert).toHaveBeenCalledTimes(2);
  });

  it('skips and continues when one game throws an error', async () => {
    const badGame: SyncedGame = { ...syncedGame, igdbSearchTitle: 'Bad Game' };
    (searchGames as jest.Mock)
      .mockRejectedValueOnce(new Error('IGDB down'))
      .mockResolvedValueOnce([mockIgdbResult]);

    const result = await runSync('user-1', [badGame, syncedGame]);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(1);
  });
});
