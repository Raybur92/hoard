import type { UserGameDetail } from '@hoard/types';

export interface UserGameRow {
  id: string;
  userId: string;
  gameId: string;
  status: string;
  playtimeByPlatform: unknown;
  lastPlayedAt: Date | null;
  notes: string | null;
  rating: number | null;
  achievementsEarned: number | null;
  achievementsTotal: number | null;
  achievementsPercent: number | null;
  achievementsUpdatedAt: Date | null;
  addedAt: Date;
  updatedAt: Date;
  game: {
    id: string;
    igdbId: number;
    title: string;
    developer: string | null;
    releaseYear: number | null;
    genres: string[];
    coverUrl: string | null;
    hltbId: number | null;
    gogAppId: number | null;
    psnNpCommunicationId: string | null;
    hltbData: {
      id: string;
      gameId: string;
      mainStory: number | null;
      mainExtras: number | null;
      completionist: number | null;
      fetchedAt: Date;
    } | null;
  };
}

export function fromPrismaStatus(s: string): UserGameDetail['status'] {
  return (s === 'OnHold' ? 'On Hold' : s) as UserGameDetail['status'];
}

export function mapUserGame(ug: UserGameRow): UserGameDetail {
  return {
    id: ug.id,
    userId: ug.userId,
    gameId: ug.gameId,
    game: {
      id: ug.game.id,
      igdbId: ug.game.igdbId,
      title: ug.game.title,
      developer: ug.game.developer,
      releaseYear: ug.game.releaseYear,
      genres: ug.game.genres,
      coverUrl: ug.game.coverUrl,
      hltbId: ug.game.hltbId,
      gogAppId: ug.game.gogAppId,
      psnNpCommunicationId: ug.game.psnNpCommunicationId,
    },
    status: fromPrismaStatus(ug.status),
    playtimeByPlatform: ug.playtimeByPlatform as UserGameDetail['playtimeByPlatform'],
    lastPlayedAt: ug.lastPlayedAt?.toISOString() ?? null,
    notes: ug.notes,
    rating: ug.rating,
    achievementsEarned: ug.achievementsEarned,
    achievementsTotal: ug.achievementsTotal,
    achievementsPercent: ug.achievementsPercent,
    achievementsUpdatedAt: ug.achievementsUpdatedAt?.toISOString() ?? null,
    addedAt: ug.addedAt.toISOString(),
    updatedAt: ug.updatedAt.toISOString(),
    hltb: ug.game.hltbData
      ? {
          id: ug.game.hltbData.id,
          gameId: ug.game.hltbData.gameId,
          mainStory: ug.game.hltbData.mainStory,
          mainExtras: ug.game.hltbData.mainExtras,
          completionist: ug.game.hltbData.completionist,
          fetchedAt: ug.game.hltbData.fetchedAt.toISOString(),
        }
      : null,
  };
}
