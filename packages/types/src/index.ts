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

export interface UserGameDetail extends UserGame {
  hltb: HltbData | null;
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

export interface PlatformStat {
  code: string;
  label: string;
  minutes: number;
  pct: number;
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
  completionPct: number;
  weeklyAdded: number;
  playtimeByPlatform: PlatformStat[];
  genres: { name: string; count: number }[];
}

export interface DashboardResponse {
  stats: DashboardStats;
  nowPlaying: UserGameDetail[];
  wishlistCountdown: WishlistRelease[];
  backlogPick: UserGameDetail | null;
  backlogItems: UserGameDetail[];
  platforms: Platform[];
}

export interface GameListResponse {
  games: UserGameDetail[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PatchGameBody {
  status?: GameStatus;
  notes?: string | null;
  rating?: number | null;
}

export interface StatsResponse {
  totalGames: number;
  completedGames: number;
  completionPct: number;
  totalPlaytimeMinutes: number;
  playtimeByPlatform: PlatformStat[];
  genreBreakdown: { name: string; count: number }[];
  shelfCounts: Partial<Record<GameStatus, number>>;
}

/* ── Auth ── */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  name?: string;
}

/* ── Platform detail (settings) ── */

export interface PlatformDetail {
  id: string;
  userId: string;
  code: PlatformCode;
  name: string;
  syncable: boolean;
  connected: boolean;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  gameCount: number | null;
  who: string | null;
}

export interface PlatformStatusResponse {
  platforms: PlatformDetail[];
}

export interface ManualAddBody {
  igdbId: number;
  platformLabel: string;
  status: GameStatus;
  title: string;
  developer?: string;
  coverUrl?: string;
}

/* ── IGDB ── */

export interface IgdbSearchResult {
  igdbId: number;
  title: string;
  developer: string | null;
  releaseYear: number | null;
  genres: string[];
  coverUrl: string | null;
}

export interface IgdbUpcomingRelease {
  igdbId: number;
  title: string;
  developer: string | null;
  releaseDate: string | null;
  releaseDateCategory: ReleaseDateCategory;
  platforms: string[];
  genres: string[];
  coverUrl: string | null;
  synopsis: string | null;
  wishlisted: boolean;
}
