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
  ManualAddBody,
  IgdbSearchResult,
  IgdbUpcomingRelease,
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

  updateMe: (body: PatchMeBody) =>
    patch<AuthResponse>('/api/auth/me', body).then((r) => r.user),

  deleteAccount: async () => {
    const r = await del<{ ok: boolean }>('/api/auth/me');
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

  // IGDB
  igdbSearch: (q: string) =>
    get<IgdbSearchResult[]>(`/api/igdb/search?q=${encodeURIComponent(q)}`),

  igdbUpcoming: (scope: 'my-platforms' | 'all' | 'wishlist' = 'my-platforms') =>
    get<IgdbUpcomingRelease[]>(`/api/igdb/upcoming${scope === 'all' ? '?scope=all' : ''}`),
};
