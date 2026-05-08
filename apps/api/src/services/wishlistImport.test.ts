jest.mock('@hoard/db', () => ({
  prisma: {
    game: { findUnique: jest.fn() },
    userGame: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('./igdb', () => ({
  getGameBySteamId: jest.fn(),
  getReleaseDetails: jest.fn(),
}));

import { applySteamWishlistImport } from './wishlistImport';
import { prisma } from '@hoard/db';
import { getGameBySteamId, getReleaseDetails } from './igdb';
import type { SteamWishlistItem } from './platforms/steam';

const item = (appid: number): SteamWishlistItem => ({
  appid,
  priority: 0,
  addedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const mockIgdbResult = {
  igdbId: 1234,
  title: 'Hollow Knight: Silksong',
  developer: 'Team Cherry',
  releaseYear: 2026,
  genres: ['Platform'],
  coverUrl: 'https://example.com/cover.jpg',
  platforms: ['PC (Microsoft Windows)'],
  totalRatingCount: 100,
};

const mockReleaseDetails = {
  igdbId: 1234,
  title: 'Hollow Knight: Silksong',
  developer: 'Team Cherry',
  releaseDate: '2026-09-01T00:00:00.000Z',
  releaseDateCategory: 'exact',
  platforms: ['PC (Microsoft Windows)', 'PlayStation 5'],
  genres: ['Platform'],
  coverUrl: 'https://example.com/cover.jpg',
  synopsis: 'Hornet wakes up.',
  hype: 200,
  category: 0,
  wishlisted: false,
  userGameId: null,
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('applySteamWishlistImport', () => {
  it('imports a new wishlist item: upserts Game, creates UserGame(Wishlist) + WishlistRelease in one transaction', async () => {
    (getGameBySteamId as jest.Mock).mockResolvedValue(mockIgdbResult);
    (getReleaseDetails as jest.Mock).mockResolvedValue(mockReleaseDetails);
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(null); // game not yet in catalog

    const txGameUpsert = jest.fn().mockResolvedValue({ id: 'game-new', igdbId: 1234 });
    const txUserGameCreate = jest.fn().mockResolvedValue({});
    const txWishlistReleaseCreate = jest.fn().mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        game: { upsert: txGameUpsert },
        userGame: { create: txUserGameCreate },
        wishlistRelease: { create: txWishlistReleaseCreate },
      }),
    );

    const result = await applySteamWishlistImport('user-1', [item(990080)]);

    expect(result).toEqual({ candidates: 1, imported: 1, alreadyHad: 0, unresolved: 0, errors: 0 });
    expect(txGameUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { igdbId: 1234 },
      create: expect.objectContaining({ steamAppId: 990080, title: 'Hollow Knight: Silksong' }),
    }));
    expect(txUserGameCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', gameId: 'game-new', status: 'Wishlist', addedAt: item(990080).addedAt },
    });
    expect(txWishlistReleaseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', igdbId: 1234, hype: 200 }),
    }));
  });

  it('skips when the user already has any UserGame for the resolved game (preserves library decision)', async () => {
    (getGameBySteamId as jest.Mock).mockResolvedValue(mockIgdbResult);
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({ id: 'game-existing', igdbId: 1234 });
    (prisma.userGame.findUnique as jest.Mock).mockResolvedValue({ id: 'ug-1', status: 'Playing' });

    const result = await applySteamWishlistImport('user-1', [item(990080)]);

    expect(result.alreadyHad).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(getReleaseDetails).not.toHaveBeenCalled(); // skipped before the second IGDB call
  });

  it('skips when the user already has a Wishlist UserGame (idempotent re-import)', async () => {
    (getGameBySteamId as jest.Mock).mockResolvedValue(mockIgdbResult);
    (prisma.game.findUnique as jest.Mock).mockResolvedValue({ id: 'game-existing', igdbId: 1234 });
    (prisma.userGame.findUnique as jest.Mock).mockResolvedValue({ id: 'ug-1', status: 'Wishlist' });

    const result = await applySteamWishlistImport('user-1', [item(990080)]);

    expect(result.alreadyHad).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts unresolved when IGDB has no record for the appid', async () => {
    (getGameBySteamId as jest.Mock).mockResolvedValue(null);

    const result = await applySteamWishlistImport('user-1', [item(99999999)]);

    expect(result.unresolved).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('counts unresolved when the second IGDB call (release details) fails', async () => {
    (getGameBySteamId as jest.Mock).mockResolvedValue(mockIgdbResult);
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);
    (getReleaseDetails as jest.Mock).mockResolvedValue(null);

    const result = await applySteamWishlistImport('user-1', [item(990080)]);

    expect(result.unresolved).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a per-item error increments errors and continues to the next item', async () => {
    (getGameBySteamId as jest.Mock)
      .mockRejectedValueOnce(new Error('IGDB down'))
      .mockResolvedValueOnce(mockIgdbResult);
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(null);
    (getReleaseDetails as jest.Mock).mockResolvedValue(mockReleaseDetails);
    const txGameUpsert = jest.fn().mockResolvedValue({ id: 'game-new', igdbId: 1234 });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        game: { upsert: txGameUpsert },
        userGame: { create: jest.fn().mockResolvedValue({}) },
        wishlistRelease: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    const result = await applySteamWishlistImport('user-1', [item(111), item(222)]);

    expect(result.errors).toBe(1);
    expect(result.imported).toBe(1); // the second item still went through
  });
});
