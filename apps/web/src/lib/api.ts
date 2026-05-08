import type {
  DashboardResponse,
  GameListResponse,
  UserGameDetail,
  WishlistRelease,
  StatsResponse,
  GameStatus,
  PatchGameBody,
  AuthResponse,
  LoginBody,
  RegisterBody,
  PatchMeBody,
  PlatformStatusResponse,
  PlatformDetail,
  PlatformLogResponse,
  SyncFrequency,
  ManualAddBody,
  IgdbSearchResult,
  IgdbUpcomingRelease,
  RecentReleasesResponse,
  ShelvesResponse,
} from '@hoard/types';
import * as cache from './cache';

// In dev: leave VITE_API_URL unset and let Vite's proxy forward /api/* to the
// API server (keeps requests same-origin so cookies don't need SameSite=None).
// In prod: set VITE_API_URL to the Railway domain so requests go directly to
// the API.
const API_BASE = import.meta.env['VITE_API_URL'] ?? '';

function url(path: string): string {
  return `${API_BASE}${path}`;
}

// Thrown by `api.remapGame` when the user already has a different UserGame
// for the target Game. The modal catches this to offer a merge option;
// see CLAUDE.md "Recent fixes" — sync-quality remap collision flow.
export class RemapConflictError extends Error {
  conflictUserGameId: string;
  conflictTitle: string;
  constructor(conflictUserGameId: string, conflictTitle: string) {
    super(`You already have "${conflictTitle}" in your library.`);
    this.name = 'RemapConflictError';
    this.conflictUserGameId = conflictUserGameId;
    this.conflictTitle = conflictTitle;
  }
}

async function fetchWithRetry(input: string, init: RequestInit, retries = 1): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok && res.status >= 500 && retries > 0) {
    return fetchWithRetry(input, init, retries - 1);
  }
  return res;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(url(path), { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(url(path), { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : null,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface GamesParams {
  status?: GameStatus;
  platform?: string;
  q?: string;
  sort?: 'lastPlayed' | 'title' | 'playtime';
  page?: number;
  limit?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * Invalidate every cache entry that depends on the user's library.
 * Called after mutations that change games, status, playtime, or platform sync.
 */
function invalidateLibrary(): void {
  cache.invalidate('games:');
  cache.invalidate('shelves:');
  cache.invalidate('gameCounts');
  cache.invalidate('dashboard');
}

export const api = {
  dashboard: () =>
    get<DashboardResponse>('/api/dashboard'),

  games: (params?: GamesParams) =>
    get<GameListResponse>(`/api/games${buildQuery({ ...params })}`),

  shelves: (perStatus?: number) =>
    get<ShelvesResponse>(`/api/games/shelves${buildQuery({ perStatus })}`),

  gameCounts: () =>
    get<{ counts: Partial<Record<GameStatus, number>> }>('/api/games/counts'),

  game: (id: string) =>
    get<UserGameDetail>(`/api/games/${id}`),

  patchGame: async (id: string, body: PatchGameBody) => {
    const updated = await patch<UserGameDetail>(`/api/games/${id}`, body);
    cache.set(`game:${id}`, updated);
    invalidateLibrary();
    return updated;
  },

  upcoming: (params?: { platform?: string }) =>
    get<WishlistRelease[]>(`/api/upcoming${buildQuery({ platform: params?.platform })}`),

  toggleWishlist: async (igdbId: number) => {
    const r = await post<{ tracked: boolean }>(`/api/upcoming/${igdbId}/wishlist`);
    cache.invalidate('upcoming:');
    cache.invalidate('dashboard'); // wishlist countdown lives there
    // The RECENT page joins wishlist with the IGDB recent feed server-side:
    // un-starring a recent drop should remove it from `// just out · starred`,
    // and starring a high-hype recent drop should move it from `hyped` →
    // `starred`. Without this, both views are stale until SWR's 30s window.
    cache.invalidate('releases:recent');
    // Toggle now also writes a UserGame(Wishlist) (or deletes one) at the
    // server: drop the library caches so the Wishlist shelf, the search
    // overlay, and per-shelf counts reflect the change immediately.
    invalidateLibrary();
    return r;
  },

  stats: () =>
    get<StatsResponse>('/api/stats'),

  // auth
  login: (body: LoginBody) =>
    post<AuthResponse>('/api/auth/login', body),

  register: (body: RegisterBody) =>
    post<AuthResponse>('/api/auth/register', body),

  logout: async () => {
    const r = await post<void>('/api/auth/logout');
    // Drop everything — next session starts clean.
    cache.invalidate('');
    return r;
  },

  me: () =>
    get<AuthResponse>('/api/auth/me').then((r) => r.user),

  updateMe: async (body: PatchMeBody) => {
    const updated = await patch<AuthResponse>('/api/auth/me', body).then((r) => r.user);
    // hypeThreshold is a server-side IGDB filter for the upcoming feed.
    // When it changes, the my-platforms / all caches must be dropped or the
    // Releases page keeps serving the old filtered list until SWR's stale
    // window expires. The wishlist scope reads from the DB and ignores the
    // threshold, but `cache.invalidate('upcoming:')` is a prefix match —
    // the wishlist key is cheap to refetch and a stale `wishlisted` flag
    // would also be wrong.
    if (body.hypeThreshold !== undefined) {
      cache.invalidate('upcoming:');
    }
    return updated;
  },

  deleteAccount: async () => {
    const r = await del<{ ok: boolean }>('/api/auth/me');
    cache.invalidate('');
    return r;
  },

  wipeLibrary: async () => {
    const r = await post<{ ok: boolean; gamesDeleted: number; platformsDisconnected: number }>('/api/auth/me/wipe-library');
    // After a wipe everything that was scoped to the user's library is gone —
    // dashboard, shelves, counts, platform status all need re-fetching.
    cache.invalidate('');
    return r;
  },

  // platforms
  platformStatus: () =>
    get<PlatformStatusResponse>('/api/platforms/status'),

  syncPlatform: async (code: string) => {
    const r = await post<void>(`/api/platforms/${code.toLowerCase()}/sync`);
    cache.invalidate('platformStatus');
    invalidateLibrary();
    return r;
  },

  updatePlatform: async (code: string, body: { syncFrequency?: SyncFrequency }) => {
    const r = await patch<PlatformDetail>(`/api/platforms/${code.toLowerCase()}`, body);
    cache.invalidate('platformStatus');
    return r;
  },

  // Cursor-paginated activity feed for one platform. Backs the Log tab
  // on PlatformDetail (PR B in `docs/SETTINGS_AUDIT_PLAN.md`). Not cached
  // — log entries are append-only and we want the latest run to show
  // up immediately after a sync. Pass `cursor` from the previous page's
  // `nextCursor` to fetch the next 50; pass nothing for the first page.
  platformLog: (code: string, cursor?: string | null) => {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return get<PlatformLogResponse>(`/api/platforms/${code.toLowerCase()}/log${qs}`);
  },

  // Reveal-on-demand fetch of the user's stored platform credential.
  // Server returns the platform-specific field (PS → { npsso }, ST →
  // { steamId }, XB → { apiKey }). NOT cached anywhere — used by the
  // [reveal] button on PlatformDetail's auth tab; we never persist this
  // in the in-memory cache so it doesn't accidentally survive a logout.
  getPlatformCredentials: async (code: string): Promise<{ npsso?: string; steamId?: string; apiKey?: string }> => {
    const res = await fetch(url(`/api/platforms/${code.toLowerCase()}/credentials`), { credentials: 'include' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<{ npsso?: string; steamId?: string; apiKey?: string }>;
  },

  disconnectPlatform: async (code: string) => {
    const r = await del<void>(`/api/platforms/${code.toLowerCase()}`);
    cache.invalidate('platformStatus');
    invalidateLibrary();
    return r;
  },

  connectPsn: async (npsso: string) => {
    const r = await post<void>('/api/platforms/psn/connect', { npsso });
    cache.invalidate('platformStatus');
    invalidateLibrary();
    return r;
  },

  connectXbox: async (apiKey: string) => {
    const r = await post<void>('/api/platforms/xbox/connect', { apiKey });
    cache.invalidate('platformStatus');
    invalidateLibrary();
    return r;
  },

  // manual games (Nintendo / Epic)
  addManualGame: async (body: ManualAddBody) => {
    const r = await post<UserGameDetail>('/api/games/manual', body);
    invalidateLibrary();
    return r;
  },

  // Repoint an existing UserGame at a different IGDB game. Used to fix
  // sync mismatches the matcher couldn't catch (Slay-the-Spire-2 class) +
  // any future IGDB drift. Server preserves notes/status/playtime — only
  // gameId is rewritten.
  //
  // Collision handling: when the user already has a different UserGame for
  // the target Game, the server returns 409 with `{ conflictUserGameId,
  // conflictTitle }`. We surface that as a typed `RemapConflictError` so the
  // modal can offer a merge option. Re-call with `merge: true` to combine
  // playtime / status / notes / rating from the source UserGame INTO the
  // existing target one and delete the source. Cache invalidation drops
  // BOTH userGames + the library prefixes — after a merge, both rows
  // changed identity (one was deleted, one was rewritten).
  remapGame: async (userGameId: string, igdbId: number, merge = false) => {
    const res = await fetch(url(`/api/games/${userGameId}/remap`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ igdbId, merge }),
    });
    if (res.status === 409) {
      const body = await res.json().catch(() => ({})) as { conflictUserGameId?: string; conflictTitle?: string };
      throw new RemapConflictError(
        body.conflictUserGameId ?? '',
        body.conflictTitle ?? '',
      );
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json() as UserGameDetail;
    // Drop everything that referenced the old gameId. After a merge the
    // source userGameId no longer exists; invalidating it just removes a
    // stale cache entry, which is correct.
    cache.invalidate(`game:${userGameId}`);
    cache.invalidate(`game:${data.id}`);
    invalidateLibrary();
    return data;
  },

  // IGDB
  igdbSearch: (q: string) =>
    get<IgdbSearchResult[]>(`/api/igdb/search?q=${encodeURIComponent(q)}`),

  igdbUpcoming: (scope: 'my-platforms' | 'all' | 'wishlist' = 'my-platforms') =>
    // Server treats missing `scope` as `my-platforms`; we only need to
    // forward the param when the caller wants something else. Both `all`
    // and `wishlist` MUST be passed through — earlier code only forwarded
    // `all`, which silently routed `useUpcoming('wishlist')` to the
    // my-platforms feed and broke the hero countdown.
    get<IgdbUpcomingRelease[]>(
      scope === 'my-platforms'
        ? '/api/igdb/upcoming'
        : `/api/igdb/upcoming?scope=${scope}`,
    ),

  // Releases page — RECENT surface + banner qualification (R1 in
  // docs/RELEASES_PLAN.md). Returns the 14-day window split into
  // user-starred (filtered against library) + IGDB high-hype (deduped).
  releasesRecent: () =>
    get<RecentReleasesResponse>('/api/releases/recent'),
};
