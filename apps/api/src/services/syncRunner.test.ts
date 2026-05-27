jest.mock('@hoard/db', () => ({
  prisma: {
    game: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
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
  getGameBySteamId: jest.fn(),
  getGameByPsnConceptId: jest.fn(),
  getGameByXboxTitleId: jest.fn(),
  getGameByGogAppId: jest.fn(),
  getTimeToBeat: jest.fn().mockResolvedValue(null),
  searchGameLocalizations: jest.fn().mockResolvedValue([]),
}));

jest.mock('./hltb', () => ({
  fetchHltbWithFallback: jest.fn(),
}));

import { runSync } from './syncRunner';
import { prisma } from '@hoard/db';
import { Prisma } from '@prisma/client';
import {
  searchGames,
  searchGameLocalizations,
  getGameByPsnConceptId,
  getGameByXboxTitleId,
  getGameByGogAppId,
  getGameBySteamId,
} from './igdb';
import type { SyncedGame } from './platforms/steam';

const mockIgdbResult = {
  igdbId: 101,
  title: 'Hollow Knight',
  developer: 'Team Cherry',
  releaseYear: 2017,
  genres: ['Platform'],
  coverUrl: 'https://example.com/cover.jpg',
  platforms: ['PC (Microsoft Windows)'],
  totalRatingCount: 1000,
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
  (searchGameLocalizations as jest.Mock).mockResolvedValue([]);
  (getGameBySteamId as jest.Mock).mockResolvedValue(null);
  (getGameByPsnConceptId as jest.Mock).mockResolvedValue(null);
  (getGameByXboxTitleId as jest.Mock).mockResolvedValue(null);
  (getGameByGogAppId as jest.Mock).mockResolvedValue(null);
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

  // F1-PR2 / CM13: wishlist auto-promotion on ownership detection
  it('CM13: auto-promotes status=Wishlist → OnHold when sync brings playtime > 0', async () => {
    (prisma.userGame.findUnique as jest.Mock).mockResolvedValue({
      status: 'Wishlist',
      playtimeByPlatform: {}, // no prior playtime
      lastPlayedAt: null,
    });

    await runSync('user-1', [{ ...syncedGame, playtimeMinutes: 120 }]);

    // Update payload should flip status to OnHold (playtime > 0)
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'OnHold',
          playtimeByPlatform: { ST: 120 },
        }),
      }),
    );
  });

  it('CM13: auto-promotes status=Wishlist → Backlog when sync brings zero playtime', async () => {
    (prisma.userGame.findUnique as jest.Mock).mockResolvedValue({
      status: 'Wishlist',
      playtimeByPlatform: {},
      lastPlayedAt: null,
    });

    await runSync('user-1', [{ ...syncedGame, playtimeMinutes: 0 }]);

    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'Backlog',
          playtimeByPlatform: { ST: 0 },
        }),
      }),
    );
  });

  it('CM13: leaves status untouched when existing is NOT Wishlist (user manual choices survive)', async () => {
    (prisma.userGame.findUnique as jest.Mock).mockResolvedValue({
      status: 'Completed', // user manually marked it
      playtimeByPlatform: { ST: 800 },
      lastPlayedAt: null,
    });

    await runSync('user-1', [{ ...syncedGame, playtimeMinutes: 900 }]);

    // The update payload must NOT include a status field — auto-promotion
    // only fires when existing status is Wishlist; any other state is
    // the user's manual decision and survives.
    const upsertCall = (prisma.userGame.upsert as jest.Mock).mock.calls[0]?.[0];
    expect(upsertCall.update).not.toHaveProperty('status');
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

  it('reuses an existing Game on steamAppId P2002 instead of failing the sync', async () => {
    const existingGame = { ...mockGame, id: 'game-existing', steamAppId: 12345 };
    (prisma.game.upsert as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { modelName: 'Game', target: ['steamAppId'] },
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(existingGame);

    const result = await runSync('user-1', [{ ...syncedGame, steamAppId: 12345 }]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(prisma.game.findUnique).toHaveBeenCalledWith({ where: { steamAppId: 12345 } });
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ gameId: 'game-existing' }),
      }),
    );
  });

  it('still throws (and skips the game) on non-steamAppId P2002 collisions', async () => {
    (prisma.game.upsert as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { modelName: 'Game', target: ['igdbId'] },
      }),
    );

    const result = await runSync('user-1', [{ ...syncedGame, steamAppId: 12345 }]);

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.game.findUnique).not.toHaveBeenCalled();
  });

  it('still throws on steamAppId P2002 when the synced row has no steamAppId', async () => {
    (prisma.game.upsert as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { modelName: 'Game', target: ['steamAppId'] },
      }),
    );

    // No steamAppId on the synced row → the collision can't be from this game,
    // so the recovery path must not engage and the error must surface.
    const result = await runSync('user-1', [syncedGame]);

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.game.findUnique).not.toHaveBeenCalled();
  });

  // Sub-unit #4.2 — xboxTitleId threading
  it('persists xboxTitleId on Game create when SyncedGame carries it', async () => {
    const xboxSyncedGame: SyncedGame = {
      ...syncedGame,
      platformCode: 'XB',
      xboxTitleId: 2030093255,
    };

    await runSync('user-1', [xboxSyncedGame]);

    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ xboxTitleId: 2030093255 }),
        update: expect.objectContaining({ xboxTitleId: 2030093255 }),
      }),
    );
  });

  it('reuses an existing Game on xboxTitleId P2002 collision (parallel to steamAppId recovery)', async () => {
    const existingGame = { ...mockGame, id: 'game-existing-xb', xboxTitleId: 2030093255 };
    (prisma.game.upsert as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { modelName: 'Game', target: ['xboxTitleId'] },
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(existingGame);

    const result = await runSync('user-1', [{ ...syncedGame, xboxTitleId: 2030093255 }]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(prisma.game.findUnique).toHaveBeenCalledWith({ where: { xboxTitleId: 2030093255 } });
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ gameId: 'game-existing-xb' }),
      }),
    );
  });

  it('still throws on xboxTitleId P2002 when the synced row has no xboxTitleId', async () => {
    (prisma.game.upsert as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { modelName: 'Game', target: ['xboxTitleId'] },
      }),
    );

    // No xboxTitleId on the synced row → recovery path doesn't engage.
    const result = await runSync('user-1', [syncedGame]);

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.game.findUnique).not.toHaveBeenCalled();
  });

  // Sub-unit #5.3 — gogAppId threading. Unlike steamAppId/xboxTitleId,
  // Game.gogAppId is NOT @unique on the schema (HLTB lookups populate
  // it as a side-effect via codepotatoes.de), so there's no P2002
  // recovery branch — gogAppId just rides along on the upsert.
  it('persists gogAppId on Game upsert when SyncedGame carries it', async () => {
    const gogSyncedGame: SyncedGame = {
      ...syncedGame,
      platformCode: 'GG',
      gogAppId: 1207658691,
    };

    await runSync('user-1', [gogSyncedGame]);

    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ gogAppId: 1207658691 }),
        update: expect.objectContaining({ gogAppId: 1207658691 }),
      }),
    );
  });

  // Diagnostic: surface the actual title strings of skipped + errored
  // games so the activity log can show users what sync isn't catching.
  it('returns skippedTitles for games that fall through both IGDB resolution paths', async () => {
    (searchGames as jest.Mock).mockResolvedValue([]); // smart matcher returns null on empty results

    const result = await runSync('user-1', [
      { ...syncedGame, igdbSearchTitle: 'Brand New Game 1' },
      { ...syncedGame, igdbSearchTitle: 'Brand New Game 2' },
    ]);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.skippedTitles).toEqual(['Brand New Game 1', 'Brand New Game 2']);
    expect(result.errorTitles).toEqual([]);
  });

  it('returns errorTitles for games that throw mid-import', async () => {
    (prisma.game.upsert as jest.Mock).mockRejectedValue(new Error('DB down'));

    const result = await runSync('user-1', [
      { ...syncedGame, igdbSearchTitle: 'Throws on Upsert' },
    ]);

    expect(result.skipped).toBe(1);
    expect(result.errorTitles).toEqual(['Throws on Upsert']);
    expect(result.skippedTitles).toEqual([]);
    // Diagnostic: error message captured per title.
    expect(result.errorMessages['Throws on Upsert']).toBe('DB down');
  });

  // L-series: primary search misses, localization fallback fires + matches.
  it('falls back to searchGameLocalizations when primary search returns null (Italian PSN title example)', async () => {
    // Primary search returns nothing — Andrea's "LEGO Batman: L'Eredità del
    // Cavaliere Oscuro" doesn't match IGDB's English-indexed games.
    (searchGames as jest.Mock).mockResolvedValue([]);
    // Localization fallback finds the English parent via the IT localization.
    const localizedResult = {
      ...mockIgdbResult,
      igdbId: 12345,
      title: 'LEGO Batman: Legacy of the Dark Knight',
      matchTitle: "LEGO Batman: L'Eredità del Cavaliere Oscuro",
      platforms: ['PlayStation 5'],
    };
    (searchGameLocalizations as jest.Mock).mockResolvedValue([localizedResult]);

    const result = await runSync('user-1', [
      {
        igdbSearchTitle: "LEGO Batman: L'Eredità del Cavaliere Oscuro",
        platformCode: 'PS',
        playtimeMinutes: 240,
        lastPlayedAt: new Date('2026-05-27'),
      },
    ]);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    // The Game we persist uses the canonical English title — not the localized one.
    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { igdbId: 12345 },
        create: expect.objectContaining({
          title: 'LEGO Batman: Legacy of the Dark Knight',
        }),
      }),
    );
  });

  it('skips the localization fallback when primary search already succeeds (no extra IGDB calls)', async () => {
    (searchGames as jest.Mock).mockResolvedValue([mockIgdbResult]);

    await runSync('user-1', [syncedGame]);

    expect(searchGames).toHaveBeenCalledTimes(1);
    expect(searchGameLocalizations).not.toHaveBeenCalled();
  });

  it('records the title as skipped when both primary AND localization fallback miss', async () => {
    (searchGames as jest.Mock).mockResolvedValue([]);
    (searchGameLocalizations as jest.Mock).mockResolvedValue([]);

    const result = await runSync('user-1', [
      { ...syncedGame, igdbSearchTitle: 'Truly Unmatchable Game' },
    ]);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedTitles).toEqual(['Truly Unmatchable Game']);
    expect(searchGameLocalizations).toHaveBeenCalledWith('Truly Unmatchable Game');
  });

  /* ── N-series: platform-id lookup via IGDB external_games ── */

  it('N: resolves PSN games by psnConceptId BEFORE title search (Lego Batman Italian case)', async () => {
    // Italian title that would never match via searchGames.
    (searchGames as jest.Mock).mockResolvedValue([]);
    (searchGameLocalizations as jest.Mock).mockResolvedValue([]);
    (getGameByPsnConceptId as jest.Mock).mockResolvedValue({
      ...mockIgdbResult,
      igdbId: 361855,
      title: 'LEGO Batman: Legacy of the Dark Knight',
      platforms: ['PlayStation 5'],
    });

    const result = await runSync('user-1', [
      {
        igdbSearchTitle: "LEGO Batman: L'Eredità del Cavaliere Oscuro",
        platformCode: 'PS',
        playtimeMinutes: 240,
        lastPlayedAt: new Date('2026-05-27'),
        psnConceptId: 10008537,
      },
    ]);

    expect(result.imported).toBe(1);
    expect(getGameByPsnConceptId).toHaveBeenCalledWith(10008537);
    // Title search shouldn't even be reached — Sony-id resolution succeeded.
    expect(searchGames).not.toHaveBeenCalled();
    expect(searchGameLocalizations).not.toHaveBeenCalled();
    // Game persisted with the canonical English title + psnConceptId column.
    expect(prisma.game.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { igdbId: 361855 },
        create: expect.objectContaining({
          title: 'LEGO Batman: Legacy of the Dark Knight',
          psnConceptId: 10008537,
        }),
      }),
    );
  });

  it('N: resolves Xbox games by xboxTitleId BEFORE title search', async () => {
    (searchGames as jest.Mock).mockResolvedValue([]);
    (getGameByXboxTitleId as jest.Mock).mockResolvedValue({
      ...mockIgdbResult,
      igdbId: 555,
      title: 'Forza Horizon 5',
    });

    await runSync('user-1', [
      {
        igdbSearchTitle: 'Forza Horizon 5: Premium Edition',
        platformCode: 'XB',
        playtimeMinutes: 600,
        lastPlayedAt: new Date('2026-05-27'),
        xboxTitleId: 2030093255,
      },
    ]);

    expect(getGameByXboxTitleId).toHaveBeenCalledWith(2030093255);
    expect(searchGames).not.toHaveBeenCalled();
  });

  it('N: resolves GOG games by gogAppId BEFORE title search', async () => {
    (searchGames as jest.Mock).mockResolvedValue([]);
    (getGameByGogAppId as jest.Mock).mockResolvedValue({
      ...mockIgdbResult,
      igdbId: 777,
      title: 'The Witcher 3: Wild Hunt',
    });

    await runSync('user-1', [
      {
        igdbSearchTitle: 'Wiedźmin 3: Dziki Gon',
        platformCode: 'GG',
        playtimeMinutes: 1000,
        lastPlayedAt: new Date('2026-05-27'),
        gogAppId: 1207664663,
      },
    ]);

    expect(getGameByGogAppId).toHaveBeenCalledWith(1207664663);
    expect(searchGames).not.toHaveBeenCalled();
  });

  it('N: falls through to title search when platform-id lookup returns null (IGDB has no external_games row yet)', async () => {
    (getGameByPsnConceptId as jest.Mock).mockResolvedValue(null);
    (searchGames as jest.Mock).mockResolvedValue([mockIgdbResult]);

    await runSync('user-1', [
      { ...syncedGame, platformCode: 'PS', psnConceptId: 999999 },
    ]);

    // Tried PSN-id first, then fell through to title search.
    expect(getGameByPsnConceptId).toHaveBeenCalledWith(999999);
    expect(searchGames).toHaveBeenCalled();
  });

  it('N: P2002 recovery — psnConceptId collision reuses existing Game row', async () => {
    const existingGame = { ...mockGame, id: 'game-existing', psnConceptId: 10008537 };
    (getGameByPsnConceptId as jest.Mock).mockResolvedValue({
      ...mockIgdbResult,
      igdbId: 361855,
      title: 'LEGO Batman: Legacy of the Dark Knight',
    });
    (prisma.game.upsert as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { modelName: 'Game', target: ['psnConceptId'] },
      }),
    );
    (prisma.game.findUnique as jest.Mock).mockResolvedValue(existingGame);

    const result = await runSync('user-1', [
      {
        igdbSearchTitle: "LEGO Batman: L'Eredità del Cavaliere Oscuro",
        platformCode: 'PS',
        playtimeMinutes: 240,
        lastPlayedAt: new Date('2026-05-27'),
        psnConceptId: 10008537,
      },
    ]);

    expect(result.imported).toBe(1);
    expect(prisma.game.findUnique).toHaveBeenCalledWith({ where: { psnConceptId: 10008537 } });
    expect(prisma.userGame.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ gameId: 'game-existing' }),
      }),
    );
  });
});
