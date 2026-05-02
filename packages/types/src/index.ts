export type GameStatus =
  | 'Playing'
  | 'Backlog'
  | 'Completed'
  | 'On Hold'
  | 'Dropped'
  | 'Wishlist';

export type PlatformCode = 'ST' | 'PS' | 'XB' | 'GG' | 'NT' | 'EP';

export type SyncStatus = 'ok' | 'syncing' | 'error' | 'stale' | 'manual';

export type ReleaseDateCategory = 'exact' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'TBA';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Platform {
  id: string;
  userId: string;
  code: PlatformCode;
  syncable: boolean;
  lastSyncAt: string | null;
  syncStatus: SyncStatus;
}

export interface Game {
  id: string;
  igdbId: number;
  title: string;
  developer: string | null;
  releaseYear: number | null;
  genres: string[];
  coverUrl: string | null;
}

export type PlaytimeByPlatform = Partial<Record<PlatformCode, number>>;

export interface UserGame {
  id: string;
  userId: string;
  gameId: string;
  game: Game;
  status: GameStatus;
  playtimeByPlatform: PlaytimeByPlatform;
  lastPlayedAt: string | null;
  notes: string | null;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface HltbData {
  id: string;
  gameId: string;
  mainStory: number | null;
  mainExtras: number | null;
  completionist: number | null;
  fetchedAt: string;
}

export interface WishlistRelease {
  id: string;
  igdbId: number;
  title: string;
  developer: string | null;
  releaseDate: string | null;
  releaseDateCategory: ReleaseDateCategory;
  platforms: string[];
  genres: string[];
  userId: string;
  hype: number | null;
  synopsis: string | null;
}

export interface DashboardStats {
  totalGames: number;
  playingCount: number;
  backlogCount: number;
  completedCount: number;
  onHoldCount: number;
  droppedCount: number;
  wishlistCount: number;
  totalPlaytimeMinutes: number;
}

export interface BacklogPick {
  userGame: UserGame;
  hltb: HltbData | null;
}

export interface DashboardResponse {
  stats: DashboardStats;
  nowPlaying: UserGame[];
  recentActivity: UserGame[];
  wishlistCountdown: WishlistRelease[];
  backlogPick: BacklogPick | null;
}
