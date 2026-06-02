export type GameStatus =
  | 'Playing'
  | 'Backlog'
  | 'Completed'
  | 'On Hold'
  | 'Dropped'
  | 'Wishlist';

export type PlatformCode = 'ST' | 'PS' | 'XB' | 'GG' | 'NT' | 'EP' | 'IT';

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

/**
 * Closed-beta gating (docs/INVITE_CODES_PLAN.md).
 * `PENDING_INVITE` users land on the welcome screen; `ACTIVE` users
 * have full access to the app.
 */
export type UserStatus = 'PENDING_INVITE' | 'ACTIVE';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  // Closed-beta access state.
  status: UserStatus;
  isAdmin: boolean;
  // Access-request fields — set when the user clicks "Request access" on
  // the welcome screen. `hasRequestedAccess` is append-only (stays true
  // after redemption per I-D12a) so the admin panel can render a
  // "redeemed after request" affordance.
  hasRequestedAccess: boolean;
  accessRequestMessage: string | null;
  accessRequestedAt: string | null;
}

/**
 * Single-use invite code for the closed beta.
 * `usedById` is unique — a code maps 1:1 to its redeemer.
 */
export interface InviteCode {
  id: string;
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  usedById: string | null;
}

/**
 * Admin-facing user summary returned by GET /api/admin/users.
 * Includes access-request fields that AuthUser deliberately hides.
 */
export interface AdminUser {
  id: string;
  email: string;
  displayIdentity: string;
  name: string | null;
  createdAt: string;
  status: UserStatus;
  isAdmin: boolean;
  hasRequestedAccess: boolean;
  accessRequestMessage: string | null;
  accessRequestedAt: string | null;
  redeemedCode: { code: string; usedAt: string } | null;
  platforms: { count: number; codes: PlatformCode[] };
  // Cascade-aware counts surfaced for the pre-deletion confirmation
  // modal (per A-D11 in docs/ADMIN_POLISH_PLAN.md). Both populated
  // server-side via Prisma `_count`; the row UI may also display
  // `gamesCount` inline. The wishlist count rides along even though
  // the modal copy currently only references games + platforms — kept
  // in the payload so future UX iterations don't need a payload change.
  gamesCount: number;
  wishlistCount: number;
}

/**
 * Admin-facing invite code summary returned by GET /api/admin/invite-codes.
 */
export interface AdminInviteCode {
  id: string;
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  usedBy: { id: string; email: string; displayIdentity: string } | null;
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
  // B-IGDB-3 — IGDB-tag triple. `genres` is form (RPG / Action / etc.),
  // `themes` is tone+setting (Fantasy / Sci-Fi / Horror / etc.), and
  // `playerPerspectives` is camera convention (First-person / Third-person
  // / Side-view / Top-down / etc.). All three are kept as separate
  // filterable dimensions per PAGES_PLAN §4.4.1.
  themes: string[];
  playerPerspectives: string[];
  coverUrl: string | null;
  heroImageUrl: string | null;
  // Captured from the codepotatoes.de payload during HLTB lookups (PR D).
  // Used to build the HLTB deep-link on GameDetail and as a future GOG sync key.
  hltbId: number | null;
  gogAppId: number | null;
  // PSN's stable per-title identifier ("NPWR12345_00"). Captured during
  // the trophy sync (T2 in docs/TROPHIES_PLAN.md). Universal per title —
  // every PSN player of a given game shares the same id, so it lives on
  // Game alongside steamAppId, not on UserGame.
  psnNpCommunicationId: string | null;
}

export type PlaytimeByPlatform = Partial<Record<PlatformCode, number>>;

/**
 * Per-platform trophy/achievement progress for a single UserGame.
 * M0 of the sync-expansion workstream (docs/SYNC_EXPANSION_PLAN.md M-D7).
 *
 * One entry per platform that has actually surfaced achievement data
 * for this user's copy of the game. Steam achievements and PSN trophies
 * are DIFFERENT sets per game (Cyberpunk: 44 Steam vs 45 PSN), so each
 * platform's progress is tracked independently — never aggregated into a
 * single flat number. UI renders one row per entry on GameDetail; the
 * receipt section is hidden when the map is empty.
 *
 * Writers: PSN trophy aggregator writes to `.PS`; Steam achievement
 * fetcher writes to `.ST`. Each writer preserves entries it doesn't own
 * (merge, don't replace). Future platforms add their own keys without
 * collision.
 */
export interface AchievementEntry {
  earned: number;
  total: number;
  /** Integer 0-100. Persisted alongside earned/total to avoid recomputing
   *  on every read; T-D2 + CM13 auto-promote logic reads this value. */
  percent: number;
  /** When the platform's API last reported the values. */
  updatedAt: string;
}

export type AchievementsByPlatform = Partial<Record<PlatformCode, AchievementEntry>>;

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
  // Per-platform trophy/achievement progress per M-D7 (M0 of the sync-
  // expansion workstream, docs/SYNC_EXPANSION_PLAN.md). Mirrors the
  // playtimeByPlatform shape. Empty `{}` means no achievement data has
  // been fetched for any platform yet (T2/T3 pre-sync rows + games whose
  // platform reports no achievement support). Replaces the 4 flat
  // columns dropped in M0 — they conflated Steam achievements and PSN
  // trophies which are distinct sets per game.
  achievementsByPlatform: AchievementsByPlatform;
  // F1-PR2 collector metadata per CONCEPTUAL_MODEL CM2 + CM12. All
  // nullable / default-empty so existing sync-imported rows remain
  // unaffected. Populated by the manual-add flow + GameDetail per-row
  // affordances.
  mediaType: MediaType | null;
  condition: Condition | null;
  region: Region | null;
  // Per CM12 + CM13: empty by default. The collector affordance to
  // wishlist a specific platform variant of an owned game writes into
  // this array. The Releases-page toggle does NOT auto-populate it.
  wishlistedPlatforms: string[];
  /**
   * GD-PR3 — sub-status per OQ-GD-2. Free-form String at the DB layer;
   * validity is enforced server-side via `isValidSubStatus(status, subStatus)`
   * so clients can't write e.g. `status: Playing + subStatus: '100%'`.
   * Variants per status (locked GD-PR3 plan):
   *   Playing   → 'infinite' | 'paused'
   *   Completed → 'main' | '+side' | '100%'
   *   Backlog / On Hold / Dropped / Wishlist → null (no variants)
   */
  subStatus: string | null;
  /**
   * GD-PR3 — times-beaten counter per OQ-GD-3. Cheap Int column now;
   * future Session-entity refactor (CM2) will derive this from Session
   * lifecycle events. Null = unset (rendered as 0); 0+ once tapped.
   */
  completionsCount: number | null;
  addedAt: string;
  updatedAt: string;
}

// F1-PR2 collector-metadata enums per CONCEPTUAL_MODEL §6.3.
//
// MediaType — DIGITAL = bought/downloaded digitally; PHYSICAL = have a
// physical copy. Simplified from a 4-value enum 2026-05-22 because the
// platform code already tells you the physical form (PS5 = disc,
// SNES = cart, emulator = ROM).
export type MediaType = 'DIGITAL' | 'PHYSICAL';

// Condition — collector metadata for physical / retro entries. Only
// meaningful when mediaType=PHYSICAL.
export type Condition = 'LOOSE' | 'CIB' | 'SEALED' | 'REPLICA' | 'GRADED';

// Region — collector metadata for physical / retro entries. Critical for
// retro (PAL SNES carts won't accept NTSC carts unmodded). Only
// meaningful when mediaType=PHYSICAL.
export type Region = 'NTSC_U' | 'NTSC_J' | 'PAL' | 'OTHER';

export interface UserGameDetail extends UserGame {
  hltb: HltbData | null;
}

/**
 * GD-PR1 (docs/PAGES_PLAN.md §3 — GameDetail v2).
 *
 * Page-state classification for the unified GameDetail v2 surface. The
 * /game/:igdbId endpoint computes this on the server and returns it
 * alongside the data needed to render the matching state.
 *
 * Detection rules (per OQ-GD-12):
 *   - No UserGame for this user × Game:
 *       releaseDate ≤ now or null → S1 (released, not owned)
 *       releaseDate > now           → S2 (upcoming, not owned)
 *   - UserGame exists, status=Wishlist:
 *       releaseDate > now           → S2 (anticipation framing)
 *       releaseDate ≤ now or null → S3 (library citizen — per-platform
 *                                       wishlist on owned platforms etc.
 *                                       still gets library treatments)
 *   - UserGame exists, status ∈ {Playing, Backlog, OnHold, Dropped} → S3
 *   - UserGame exists, status=Completed → S4
 */
export type GameDetailState = 'S1' | 'S2' | 'S3' | 'S4';

/**
 * Rich Game info returned with every GameDetailResponse. Combines the
 * Game row's persistent columns + lazy-fetched IGDB data needed for S1/S2
 * surfaces (synopsis, full releaseDate, IGDB-cataloged platforms list).
 *
 * For S3/S4 the existing UserGameDetail.game suffices for rendering
 * today's GameDetailDesktop / GameDetailMobile — but this shape is also
 * returned at the top level so future GD-PRs can fold the rich fields in
 * without re-fetching.
 *
 * IGDB-derived fields (`releaseDate`, `platforms`, `synopsis`) may be
 * `null`/`[]` when the IGDB lookup at the route layer fails (network,
 * rate-limit, etc.). The page degrades gracefully — Game-row data is
 * always present.
 */
export interface GameDetailGameInfo {
  id: string; // Game.id (cuid)
  igdbId: number;
  title: string;
  developer: string | null;
  releaseYear: number | null;
  /** Full ISO date when known (from IGDB getReleaseDetails); null when
   *  IGDB lookup fails or the game has TBA / unknown release. */
  releaseDate: string | null;
  /** IGDB-cataloged platforms (e.g. ["PC (Microsoft Windows)", "PlayStation 5"]).
   *  Empty when IGDB lookup fails. Distinct from `UserGame.wishlistedPlatforms`
   *  (which is a per-user subset). */
  platforms: string[];
  genres: string[];
  themes: string[];
  playerPerspectives: string[];
  coverUrl: string | null;
  heroImageUrl: string | null;
  /** Long-form description from IGDB (`summary` field). Null when IGDB
   *  lookup fails or the game has no summary. */
  synopsis: string | null;
  /** IGDB category (main_game=0, dlc_addon=2, remake=8, etc.). Drives
   *  inline `// DLC` / `// remake` chips on the detail header. Null when
   *  IGDB lookup fails. */
  category: number | null;
  /** Stable platform-side IDs already on Game — used by GD-PR2 preorder
   *  deep-links (OQ-GD-14). Surfaced now so the type stays whole; consumers
   *  may ignore until GD-PR2 wires the deep-links. */
  steamAppId: number | null;
  gogAppId: number | null;
  psnConceptId: number | null;
  xboxTitleId: number | null;
  epicCatalogItemId: string | null;
  nintendoTitleId: string | null;
  itchGameId: number | null;
  hltbId: number | null;
  /**
   * GD-PR2 — per-region × per-platform release dates from IGDB. The
   * Releases page uses the earliest single date (above); S2 surface shows
   * the full breakdown in an expandable panel so the user can see e.g.
   * "EU + Japan 2027-03-15 / NA 2027-04-22 / PC 2027-03-15 / PS5 2027-05".
   * Empty array when IGDB lookup fails or the game has no per-region
   * data (older catalog entries are common).
   */
  releaseDates: ReleaseDateEntry[];
  /**
   * GD-PR2 — IGDB screenshot image_ids (use `images.igdb.com/igdb/image/upload/t_screenshot_huge/{id}.jpg`
   * for the gallery, `t_thumb` for the carousel thumbs). Empty when
   * IGDB lookup fails or the game has no screenshots.
   */
  screenshotIds: string[];
  /**
   * GD-PR2 — IGDB video ids — YouTube video_ids (e.g. "dQw4w9WgXcQ").
   * S2 surface renders YouTube thumbs that link out to the video; in-page
   * iframe embed is deferred to a polish PR (CSP carve-out required).
   */
  videoIds: string[];
  /**
   * GD-PR4a — pre-rendered shape-dither SVG for the OQ-GD-13 archivist
   * relic centerpiece. Server-side render via sharp, cached on
   * `Game.relicDitherSvg` and lazily generated on first read. Null when:
   *   - `heroImageUrl` is null (no source image to dither)
   *   - First request for a Game (background generation kicked off; next
   *     request gets the cached SVG)
   *   - sharp render failed (graceful — S4 falls back to coverUrl in img tag)
   *
   * Each cell `<g>` inside the SVG carries an inline `style="animation-delay: Xms"`
   * computed from the cell's Euclidean distance to the artwork centroid;
   * the GD-PR4b frontend animation (D7) uses these directly. Read-only
   * for the frontend.
   */
  relicDitherSvg: string | null;
  /**
   * GD-PR4a — 3 sigil assignments (GENRE / THEME / PERSPECTIVE) for the
   * relic surface. Computed on each request via `assignSigils()` over the
   * Game's `genres / themes / playerPerspectives` arrays. Always 3
   * entries; fallback values fire when classifiers can't place a tag.
   *
   * Frontend renders the actual SVG glyphs by name (look up in
   * `apps/web/src/components/screens/gameDetail/relicSigils.ts`).
   */
  sigils: SigilAssignment[];
}

/**
 * GD-PR4a — one sigil mark assigned to one of the three relic dimensions.
 *
 * - `dimension` — 'GENRE' | 'THEME' | 'PERSPECTIVE' (the relic surface
 *   shows exactly three, in this order)
 * - `value` — the cluster name (e.g. 'COMBAT' / 'CHAOS' / 'First person')
 *   or the SHROUD / APOCRYPHA / ASYLUM fallback
 * - `sigilName` — the lookup key into the frontend's SIGIL_BY_NAME map
 *   (e.g. 'cross', 'flame', 'ring-dot')
 *
 * 1 sigil = 1 value globally (the consecrated-symbol interpretation
 * locked 2026-06-01). Reader builds vocabulary over time.
 */
export interface SigilAssignment {
  dimension: 'GENRE' | 'THEME' | 'PERSPECTIVE';
  value: string;
  sigilName: string;
}

/**
 * GD-PR2 — one entry in the per-region × per-platform release-dates
 * breakdown. IGDB's `release_dates` endpoint returns one row per region
 * × platform combination, often with different dates (PC ahead of console
 * is the canonical case). `region` resolved from IGDB's region enum
 * to a human-readable label by the route layer; `platform` carries the
 * IGDB platform name. `date` is null for TBA entries.
 */
export interface ReleaseDateEntry {
  date: string | null;
  region: string | null;
  platform: string | null;
}

/**
 * GD-PR1 response shape from `GET /api/games/by-igdb/:igdbId`.
 *
 * `userGame` carries today's UserGameDetail shape (with nested `game`)
 * untouched so the existing GameDetailDesktop / GameDetailMobile S3/S4
 * fallback components don't need any changes in GD-PR1. The dispatcher
 * routes to those components when `state ∈ {S3, S4}` and to the new S1/S2
 * components when `state ∈ {S1, S2}` using the top-level `game` field.
 *
 * Returns 404 when no Game row exists for the IGDB id (the user navigated
 * to an unowned, never-wishlisted IGDB id — out of scope for GD-PR1; will
 * be handled in GD-PR2 by lazy-creating the Game row from IGDB).
 */
export interface GameDetailResponse {
  state: GameDetailState;
  igdbId: number;
  game: GameDetailGameInfo;
  userGame: UserGameDetail | null;
}

/**
 * GD-PR1 — Option A endpoint shape for S1's price-offers card.
 *
 * `GET /api/games/by-igdb/:igdbId/deals` returns the user's market deals
 * for a single Game. Reuses the `DealRow` shape from DEALS-PR1; affiliate
 * URLs are pre-rewritten by the server (frontend never sees raw URLs).
 *
 * Empty `deals` array (not 404) when no active deals exist for the game
 * — distinct from "game not found" (404 from the parent /by-igdb route).
 */
export interface GameDealsResponse {
  igdbId: number;
  marketCode: string;
  deals: DealRow[];
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
  heroImageUrl: string | null;
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

/**
 * DASH-PR2 — time-axis period bound for the Dashboard completion + achievements
 * cards. `all` is the default cumulative view; `year` and `month` are
 * engagement-scoped: stats are computed AMONG UserGames whose `lastPlayedAt`
 * falls in the period (start of current calendar year / month, server-local
 * UTC). `lastPlayedAt` is a tractable proxy for "what you engaged with this
 * window" — we don't track `completedAt` or per-achievement timestamps
 * (PAGES_PLAN §7.5 OQ-DASH-8).
 */
export type DashboardPeriod = 'all' | 'year' | 'month';

/** DASH-PR2 — period-scoped subset of DashboardStats. Always present in the
 *  response; mirrors all-time values when `period === 'all'`. */
export interface DashboardPeriodStats {
  /** Completed UserGames whose lastPlayedAt is inside the period. When
   *  `period === 'all'`, this is the cumulative completed count. */
  completedCount: number;
  /** Denominator for the period: UserGames with lastPlayedAt in the period.
   *  When `period === 'all'`, this is `totalGames` (full library). */
  totalGames: number;
  /** `completedCount / totalGames * 100`, one decimal. 0 when `totalGames` is 0. */
  completionPct: number;
  /** Sum of achievementsByPlatform.{platform}.{earned,total} across UserGames
   *  with lastPlayedAt in the period. Achievements aren't timestamped per-unlock,
   *  so this is "all-time achievement progress on games you engaged with in the
   *  period," not "achievements earned in the period." `null` when no engaged
   *  game has achievement data. */
  achievementsRollup: { earned: number; total: number; percent: number } | null;
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
  // B-IGDB-3 — IGDB-tag triple breakdowns. Same shape as `genres`; same
  // Top-N capping (TOP_GENRES = 5 in dashboard.ts). The Dashboard
  // breakdown card surfaces all three as switchable tabs.
  themes: { name: string; count: number }[];
  playerPerspectives: { name: string; count: number }[];
  // T6 of the trophies workstream, updated for M0. Library-wide sum of
  // trophy/achievement progress across every UserGame that has any
  // achievement data fetched, aggregated across all platform entries in
  // achievementsByPlatform. `null` when no game in the library has any
  // achievement data yet (e.g. pre-T2/T3 sync, or every Steam profile is
  // private and no PSN games have been synced). Percent is
  // `earned / total * 100`, rounded to one decimal — same convention as
  // `completionPct`.
  achievementsRollup: { earned: number; total: number; percent: number } | null;
  // DASH-PR2 — period echoed back from the request (`?period=`), so the
  // client can render the correct toggle state on hydration / shared URLs.
  period: DashboardPeriod;
  // DASH-PR2 — period-scoped variants for the completion + achievements
  // cards (PAGES_PLAN §7.4). Top-level fields above stay all-time so the
  // greeting header and other cumulative surfaces don't flicker when the
  // toggle changes.
  periodStats: DashboardPeriodStats;
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
  /** DEALS-PR1 — Dashboard alerts-strip callout: number of currently
   *  active deals on the user's wishlist. 0 = no callout rendered. */
  wishlistDealsCount: number;
}

/** DEALS-PR1 — per-Deal payload returned by `/api/deals`. One row per
 *  (game, shop) pair where ITAD reports an active discount. */
export interface DealRow {
  id: string;
  gameId: string;
  /** GD-PR1 — IGDB id of the parent Game; lets the Deals page navigate
   *  directly to the canonical `/game/:igdbId` GameDetail URL without
   *  resolving Game.id → igdbId on the client. */
  gameIgdbId: number;
  gameTitle: string;
  gameCoverUrl: string | null;
  gameHeroImageUrl: string | null;
  shopId: string;
  shopName: string;
  isReseller: boolean;
  currentPrice: number;
  originalPrice: number | null;
  currency: string;
  discountPct: number;
  /** URL returned by ITAD (NOT yet affiliate-routed — server rewrites
   *  per `routeAffiliateUrl()` before sending). */
  dealUrl: string;
  voucher: string | null;
  expiresAt: string | null;
  storeLow: number | null;
  isHistoricalLow: boolean;
  isTrendingDown: boolean;
  /** `true` when the user has this game on their wishlist (Wishlist
   *  status OR a non-empty wishlistedPlatforms entry per CM12). Drives
   *  whether the deal lands in the wishlist section vs broader feed. */
  isWishlisted: boolean;
}

export interface DealsResponse {
  topWishlistDeal: DealRow | null;
  wishlistDeals: DealRow[];
  broaderFeed: DealRow[];
  /** Active market code (e.g. "AT" / "US"); null when the user hasn't
   *  set one and Accept-Language couldn't be derived at signup. */
  marketCode: string | null;
  /** ISO timestamp of the most recent deal-sync run that affected any
   *  of the rows in this response; null when no deals exist yet. */
  lastSyncedAt: string | null;
  /** DEALS-PR2 — active bundles that include at least one game in the
   *  user's library or wishlist. Already affiliate-routed server-side. */
  bundles: BundleRow[];
}

/**
 * DEALS-PR2 — one current bundle relevant to the requesting user. Shipped
 * as a flat row by `/api/deals`. Bundle game-membership is server-resolved
 * against the user's library/wishlist; `matchingTitles` carries the subset
 * of bundle game titles the user actually has (for the UI hint
 * "// includes 3 games in your wishlist").
 */
export interface BundleRow {
  id: string;
  shopName: string;
  title: string;
  /** Affiliate-routed buy URL — server pre-rewrites; safe to use as-is. */
  url: string;
  /** ISO timestamp; null when ITAD didn't supply an end date. */
  expiresAt: string | null;
  /** Total games in the bundle (across all tiers) per ITAD's count field. */
  gameCount: number;
  /** Games the user has in library/wishlist that appear in this bundle.
   *  Empty array when no overlap — but the bundle wouldn't be in the
   *  response at all in that case (route filters before returning). */
  matchingTitles: string[];
}

/**
 * B-IGDB-3b2 — `/api/games/lens-index` payload. Every IGDB-tag value
 * present in the user's library with its UserGame count. Sorted by
 * count desc, ties broken by name asc. Used by:
 *   - Library overview's browse-by panel
 *   - `/library/by-genre/:slug` etc. for slug → canonical-name lookup
 */
export interface LensIndexEntry { name: string; count: number; }
export interface LensIndexResponse {
  genre: LensIndexEntry[];
  theme: LensIndexEntry[];
  perspective: LensIndexEntry[];
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
  /**
   * GD-PR3 — sub-status. Server validates against the current/incoming
   * status via `isValidSubStatus(status, subStatus)`; mismatched values
   * return 400 `INVALID_SUB_STATUS`. Null clears.
   */
  subStatus?: string | null;
  /**
   * GD-PR3 — times-beaten counter. Int ≥ 0. Null clears.
   */
  completionsCount?: number | null;
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
  // Closed-beta gating (docs/INVITE_CODES_PLAN.md). Drives the welcome
  // screen state on the frontend; isAdmin gates the sidebar admin entry.
  // accessRequestMessage / accessRequestedAt are deliberately NOT exposed
  // here — they're admin-only fields on /api/admin/users (I3).
  status: UserStatus;
  isAdmin: boolean;
  hasRequestedAccess: boolean;
  preferences: UserPreferences;
  // DEALS-PR1 — ISO 3166-1 alpha-2 (e.g. "AT" / "US"). Drives locale
  // currency on /deals + Amazon storefront selection (DEALS-PR3).
  marketCode: string | null;
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
  /** DEALS-PR1 — ISO 3166-1 alpha-2 market code; `null` clears. */
  marketCode?: string | null;
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

/* ── Platform sync log (PR B of the settings audit workstream) ── */

export type PlatformLogLevel = 'info' | 'warn' | 'error';

export interface PlatformLogEntry {
  id: string;
  level: PlatformLogLevel;
  /** Machine-readable event tag — e.g. `sync.started`, `library.imported`,
   *  `trophies.applied`, `achievements.applied`, `wishlist.imported`,
   *  `sync.ok`, `sync.error`. UI uses it for color-coding. */
  event: string;
  /** Human-readable terminal-style message — what the user actually reads
   *  in the Log tab. */
  message: string;
  /** Reserved for v2 drill-down. v1 stores nothing here. */
  details: Record<string, unknown> | null;
  /** ISO 8601 timestamp; client renders `[YYYY-MM-DD HH:MM:SS]`. */
  createdAt: string;
}

export interface PlatformLogResponse {
  entries: PlatformLogEntry[];
  /** Opaque cursor for the next page; `null` when fully drained. */
  nextCursor: string | null;
}

export interface ManualAddBody {
  igdbId: number;
  platformLabel: string;
  status: GameStatus;
  title: string;
  developer?: string;
  coverUrl?: string;
  // F1-PR2 collector metadata per CM2 + CM13. All optional — the
  // backend writes them through to UserGame when present.
  // mediaType: DIGITAL | PHYSICAL (simplified 2026-05-22). When omitted,
  // UserGame.mediaType stays null (consistent with sync-imported rows).
  mediaType?: MediaType;
  // Only meaningful when mediaType=PHYSICAL. The frontend hides the
  // pickers otherwise so this stays undefined for DIGITAL adds.
  condition?: Condition;
  region?: Region;
  // Per CM13: even when status=Wishlist on a manual-add, wishlistedPlatforms
  // stays empty by default. The dedicated GameDetail per-row affordance
  // (PR6+) writes to it. Accepting it here for future-compatibility +
  // the rare case where the manual-add flow itself supports per-platform
  // wishlist entry (not in PR1 P2 UI).
  wishlistedPlatforms?: string[];
  // F1-PR3 — optional manual playtime for the picked platform, expressed
  // in minutes. Closes the S7 "playtime: —" downgrade: without this,
  // manual-add games render with no playtime forever while synced games
  // show real hours. When provided, the backend writes the value into
  // playtimeByPlatform[platformLabel] on UserGame create. Update path
  // does not touch playtime here (full silent-merge matrix lands in
  // F1-PR5) — manual playtime is treated as "first-write only" for now.
  manualPlaytimeMinutes?: number;
}

/* ── IGDB ── */

export interface IgdbSearchResult {
  igdbId: number;
  title: string;
  developer: string | null;
  releaseYear: number | null;
  genres: string[];
  // B-IGDB-3 — IGDB's `themes` axis (tone+setting: Fantasy / Sci-Fi /
  // Horror / Comedy / Historical / etc.). Empty when IGDB has no theme data.
  themes: string[];
  // B-IGDB-3 — IGDB's `player_perspectives` axis (camera: First-person /
  // Third-person / Side-view / Top-down / etc.). Empty when IGDB has none.
  playerPerspectives: string[];
  coverUrl: string | null;
  heroImageUrl: string | null;
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
  // L-series — when the result was matched via IGDB's `game_localizations`
  // fallback (e.g. Italian PSN title hitting an Italian localization row),
  // this holds the LOCALIZED title that `pickBestMatch` should score
  // against. `title` always remains IGDB's canonical English title so the
  // Game.title we persist stays consistent across users + locales.
  matchTitle?: string;
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
  // B-IGDB-3 — IGDB-tag triple's tone+setting + camera axes. Default `[]`
  // when absent; new field, so older payloads + cache hits may not carry it.
  themes: string[];
  playerPerspectives: string[];
  coverUrl: string | null;
  heroImageUrl: string | null;
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
  /**
   * REL-PR1 (PAGES_PLAN §5.4 + OQ-REL-3) — the platforms the user wishlisted
   * this release for, when they're a strict subset of the IGDB platforms
   * array above. Sourced from `UserGame.wishlistedPlatforms` and populated
   * by the same route enrichment path as `userGameId`. Empty when the user
   * has no UserGame for this release or when `wishlistedPlatforms` is empty
   * on the row.
   *
   * Card rendering: when the array is non-empty AND a strict subset of
   * `platforms`, surface `// wishlisted: PS5 · Switch` instead of the
   * generic platform array. When empty (or matching the full set), fall
   * back to the generic rendering.
   */
  wishlistedPlatforms: string[];
}

/* ── Feedback (F-series, docs/FEEDBACK_PLAN.md) ── */

/**
 * Basic feedback shape returned from POST /api/feedback. The L2 layer of
 * the user-research observation system (docs/USER_RESEARCH.md §6.2).
 * Cascade-deletes with user per F-D1. Read state is a single boolean per
 * F-D5 — promotion path is adding `processedAt: DateTime?` when volume
 * justifies a triage workflow.
 */
export interface Feedback {
  id: string;
  userId: string;
  message: string;
  viewport: string | null;
  ua: string | null;
  read: boolean;
  createdAt: string;
}

/**
 * Admin-facing feedback row returned from GET /api/admin/feedback.
 * Mirrors the AdminUser / AdminInviteCode pattern — joined user identity
 * surfaced inline so the admin row can render `displayIdentity(user)`
 * without a second lookup.
 */
export interface FeedbackWithUser extends Feedback {
  user: { id: string; email: string; name: string | null; displayIdentity: string };
}

/**
 * Cursor-paginated response from GET /api/admin/feedback. unreadCount is
 * total-across-all-pages (not page-scoped) so the admin section header
 * chip stays accurate while the user paginates — see the route-handler
 * comment in F1.2 for why this is deliberate.
 */
export interface FeedbackListResponse {
  items: FeedbackWithUser[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface PostFeedbackBody {
  message: string;
  viewport?: string;
  ua?: string;
}

export interface PatchFeedbackBody {
  read: boolean;
}

/* ── Telemetry / UserEvent (TL-series, docs/TELEMETRY_PLAN.md) ── */

/**
 * Per-user event log entry. L1 layer of the user-research observation
 * system (docs/USER_RESEARCH.md §6.2). Cascade-deletes with user per
 * TL-D1. `event` is a free-form string per TL-D4 — new event tags can
 * land without a migration. `details` is an optional structured payload
 * (TL-D5) — shape varies per event class:
 *   - wishlist.toggled → { igdbId, action: 'add'|'remove' }
 *   - error.surfaced   → { route, errorClass, status, message, requestId? }
 *   - session.opened   → { userAgent }
 *   - signup.pending   → { provider }
 *   - signup.completed → { code } (4-4 suffix, no PII)
 *   - platform.connected → { code }
 *   - sync.first       → { code, gamesImported }
 *   - remap.used       → { fromIgdbId, toIgdbId, merged }
 *
 * Immutable per TL-D10 — no read flag, no processedAt, no PATCH route.
 */
export interface UserEvent {
  id: string;
  userId: string;
  event: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Admin-facing event row returned from GET /api/admin/events. Joined
 * user identity surfaced inline so the admin row can render
 * displayIdentity(user) without a second lookup. Same pattern as
 * FeedbackWithUser / AdminInviteCode.
 */
export interface UserEventWithUser extends UserEvent {
  user: { id: string; email: string; name: string | null; displayIdentity: string };
}

/**
 * Cursor-paginated response from GET /api/admin/events. No unreadCount
 * analogue — events are immutable per TL-D10 so there's no read-state
 * to count.
 */
export interface UserEventListResponse {
  items: UserEventWithUser[];
  nextCursor: string | null;
}

/* ── Events (EV-PR1, docs/EVENTS_PLAN.md) ── */

/**
 * IGDB showcase / industry event raw shape — what the IGDB `events`
 * endpoint returns (after our mapper). NOT to be confused with `UserEvent`
 * above (that's the telemetry feed). `gameIgdbIds` is the resolved list
 * of IGDB game ids from the nested `games` field; the sync orchestrator
 * resolves each to a Hoard `Game` row at write time per EV-D11.
 */
export interface IgdbEvent {
  igdbId: number;
  slug: string;
  name: string;
  description: string | null;
  /** ISO 8601 in UTC. */
  startTime: string;
  /** ISO 8601 in UTC; null when IGDB didn't supply an end time. */
  endTime: string | null;
  liveStreamUrl: string | null;
  /** IANA timezone, e.g. "America/Los_Angeles". Used by `.ics` per EV-D15
   *  starting in EV-PR4; EV-PR1 ignores it. */
  timeZone: string | null;
  logoUrl: string | null;
  networks: Array<{ name: string; type: string; url: string | null }>;
  videos: Array<{ youtubeId: string; name: string | null }>;
  gameIgdbIds: number[];
}

/** EV-PR1 — three-state classification per EV-D12.
 *
 *  - `upcoming` — startTime > now
 *  - `live`     — startTime ≤ now AND (endTime ≥ now, OR endTime is null AND
 *                 startTime + 4h ≥ now)
 *  - `past`     — endTime < now (when present) OR startTime + 4h < now (when
 *                 endTime is null)
 */
export type EventState = 'upcoming' | 'live' | 'past';

/** Compact event row used by the `/events` list view + cross-page chips. */
export interface EventListRow {
  slug: string;
  name: string;
  startTime: string;
  endTime: string | null;
  liveStreamUrl: string | null;
  logoUrl: string | null;
  networks: Array<{ name: string; type: string; url: string | null }>;
  gameCount: number;
  state: EventState;
}

/** GET `/api/events` payload. Sectioned per `state` so the frontend can
 *  render upcoming/recent/past in order without re-bucketing. `hero` is the
 *  next-soonest upcoming event globally (EV-D13). */
export interface EventsListResponse {
  hero: EventListRow | null;
  upcoming: EventListRow[];
  /** Past events within the last 30 days (always rendered when populated). */
  recent: EventListRow[];
  /** Past events older than 30 days, within the 24-month default depth
   *  window (EV-D6). EV-PR2 adds year-jump for going deeper. */
  past: EventListRow[];
  counts: { upcoming: number; past: number };
}

/** Detail-view event row — adds description / timezone / video deep-links
 *  on top of the list row. */
export interface EventDetailRow extends EventListRow {
  description: string | null;
  timeZone: string | null;
  videos: Array<{ youtubeId: string; name: string | null }>;
}

/**
 * One game card in the event's game grid. `userGame` is non-null when the
 * user already has a UserGame for this game (drives the `on your wishlist` /
 * `in your library` chip). `announcementType` stays null in EV-PR1; EV-PR3
 * derives it from IGDB metadata where patterns are extractable.
 */
export interface EventGameRow {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  heroImageUrl: string | null;
  announcementType: string | null;
  userGame: { id: string; status: GameStatus } | null;
}

/** GET `/api/events/:slug` payload. `personalisation` carries pre-computed
 *  counts so the detail header can render `// 3 on your wishlist` without
 *  the client iterating `games[]`. */
export interface EventDetailResponse {
  event: EventDetailRow;
  games: EventGameRow[];
  personalisation: {
    onWishlistCount: number;
    onLibraryCount: number;
  };
}

/** Admin-only sync summary returned by POST `/api/admin/events/sync`. */
export interface EventsSyncSummary {
  scanned: number;
  eventsUpserted: number;
  gamesUpserted: number;
  gameLinksUpserted: number;
}
