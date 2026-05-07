export type GameStatus =
  | 'Playing'
  | 'Backlog'
  | 'Completed'
  | 'On Hold'
  | 'Dropped'
  | 'Wishlist';

export type PlatformCode = 'ST' | 'PS' | 'XB' | 'GG' | 'NT' | 'EP';

export type SyncStatus = 'ok' | 'syncing' | 'error' | 'stale' | 'manual';

/**
 * Per-platform auto-sync cadence. Stored on Platform.syncFrequency. Drives
 * the client's useAutoSync hook — a platform's `lastSyncAt` older than its
 * frequency window triggers a background sync on app open / visibility
 * change. `MANUAL` disables auto-sync (the explicit "sync now" button is
 * always available regardless).
 */
export type SyncFrequency = 'FIVE_MIN' | 'FIFTEEN_MIN' | 'HOURLY' | 'MANUAL';

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
  syncFrequency: SyncFrequency;
}

export interface Game {
  id: string;
  igdbId: number;
  title: string;
  developer: string | null;
  releaseYear: number | null;
  genres: string[];
  coverUrl: string | null;
  // Captured from the codepotatoes.de payload during HLTB lookups (PR D).
  // Used to build the HLTB deep-link on GameDetail and as a future GOG sync key.
  hltbId: number | null;
  gogAppId: number | null;
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

// DO NOT RENAME — see docs/RELEASES_PLAN.md §1 (decision D1). The DB table is
// `WishlistRelease`; the type mirrors it. The Releases page rename is surface-
// only; data model stays `WishlistRelease` everywhere.
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
  coverUrl: string | null;
  // IGDB category (e.g. main_game=0, dlc_addon=2, remake=8). Drives the
  // DLC / remake chip on Upcoming. Persisted from PR B onward.
  category: number;
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

/** Activity heatmap cells, column-major (weeks × 7).
 *  cells[col * 7 + row] = number of distinct games whose lastPlayedAt fell on
 *  that day. Row 0 = Sunday … row 6 = Saturday. Column 0 = oldest week in the
 *  window; column (weeks - 1) = current week.
 *  Future cells (e.g. tomorrow's row in the rightmost column) stay at 0. */
export interface ActivityHeatmap {
  weeks: number;
  cells: number[];
}

export interface DashboardResponse {
  stats: DashboardStats;
  nowPlaying: UserGameDetail[];
  wishlistCountdown: WishlistRelease[];
  backlogPick: UserGameDetail | null;
  backlogItems: UserGameDetail[];
  platforms: Platform[];
  activity: ActivityHeatmap;
}

export interface GameListResponse {
  games: UserGameDetail[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ShelvesResponse {
  shelves: Record<GameStatus, UserGameDetail[]>;
  counts: Partial<Record<GameStatus, number>>;
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

export interface UserPreferences {
  hypeThreshold: number;
  libraryView: 'shelves' | 'grid' | 'list';
  showHltb: boolean;
  coverDensity: 'cozy' | 'standard' | 'dense';
  terminalCursor: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  preferences: UserPreferences;
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

export interface PatchMeBody {
  name?: string;
  email?: string;
  hypeThreshold?: number;
  libraryView?: 'shelves' | 'grid' | 'list';
  showHltb?: boolean;
  coverDensity?: 'cozy' | 'standard' | 'dense';
  terminalCursor?: boolean;
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
  syncFrequency: SyncFrequency;
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
  // IGDB platform names (e.g. "PlayStation 5", "PC (Microsoft Windows)")
  // used by `pickBestMatch` to prefer results that match the syncing
  // platform. Empty when IGDB has no platform data — treated as "unknown,
  // don't penalize" rather than "wrong platform."
  platforms: string[];
  // IGDB's `total_rating_count` — proxy for popularity. Used as a tiebreak
  // by `pickBestMatch` so well-known games (Slay the Spire) outrank obscure
  // sequels / clones (Slay the Spire 2 in early access). Null when IGDB
  // didn't report it.
  totalRatingCount: number | null;
}

// Lives at IGDB's /game_time_to_beats endpoint, keyed by game_id. Fetched
// on-demand via getTimeToBeat(igdbId), not bundled into the games endpoint
// response. Values are in seconds — caller converts to minutes.
export interface IgdbTimeToBeat {
  hastily: number | null;
  normally: number | null;
  completely: number | null;
}

// Response shape for GET /api/releases/recent (R1 in docs/RELEASES_PLAN.md).
// Both lists share `IgdbUpcomingRelease`; `wishlisted` distinguishes them
// (true for `starred`, false for `hyped`). See decision D7.
export interface RecentReleasesResponse {
  starred: IgdbUpcomingRelease[];
  hyped: IgdbUpcomingRelease[];
}

// DO NOT RENAME — see docs/RELEASES_PLAN.md §1 (decision D1). The page is being
// reworked from "Upcoming" to "Releases" but the underlying type stays. The
// Releases page consumes IgdbUpcomingRelease as-is; renaming this type would
// touch dozens of files for zero functional gain. Confirm the rule still
// holds by reading RELEASES_PLAN.md §1 before any rename attempt.
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
  category: number;
  hype: number | null;
  /**
   * UserGame.id when the user has a library entry for this release (any
   * status). Populated by the wishlist scope and any other scope where the
   * release has a matching UserGame row. Used for client-side navigation:
   * cards link to `/game/${userGameId}` when present, so wishlisted releases
   * route to a real detail page instead of 404'ing on an igdbId-as-cuid.
   * Null for non-wishlisted, non-owned releases (typical in All mode).
   */
  userGameId: string | null;
}
