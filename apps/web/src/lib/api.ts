import type {
  DashboardResponse,
  GameListResponse,
  UserGameDetail,
  WishlistRelease,
  StatsResponse,
  GameStatus,
  PatchGameBody,
  AuthUser,
  AuthResponse,
  LoginBody,
  RegisterBody,
  PatchMeBody,
  PlatformStatusResponse,
  ManualAddBody,
  IgdbSearchResult,
  IgdbUpcomingRelease,
} from '@hoard/types';

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

export const api = {
  dashboard: () =>
    get<DashboardResponse>('/api/dashboard'),

  games: (params?: GamesParams) =>
    get<GameListResponse>(`/api/games${buildQuery({ ...params })}`),

  gameCounts: () =>
    get<{ counts: Partial<Record<GameStatus, number>> }>('/api/games/counts'),

  game: (id: string) =>
    get<UserGameDetail>(`/api/games/${id}`),

  patchGame: (id: string, body: PatchGameBody) =>
    patch<UserGameDetail>(`/api/games/${id}`, body),

  upcoming: (params?: { platform?: string }) =>
    get<WishlistRelease[]>(`/api/upcoming${buildQuery({ platform: params?.platform })}`),

  toggleWishlist: (igdbId: number) =>
    post<{ tracked: boolean }>(`/api/upcoming/${igdbId}/wishlist`),

  stats: () =>
    get<StatsResponse>('/api/stats'),

  // auth
  login: (body: LoginBody) =>
    post<AuthResponse>('/api/auth/login', body),

  register: (body: RegisterBody) =>
    post<AuthResponse>('/api/auth/register', body),

  logout: () =>
    post<void>('/api/auth/logout'),

  me: () =>
    get<AuthResponse>('/api/auth/me').then((r) => r.user),

  updateMe: (body: PatchMeBody) =>
    patch<AuthResponse>('/api/auth/me', body).then((r) => r.user),

  deleteAccount: () =>
    del<{ ok: boolean }>('/api/auth/me'),

  // platforms
  platformStatus: () =>
    get<PlatformStatusResponse>('/api/platforms/status'),

  syncPlatform: (code: string) =>
    post<void>(`/api/platforms/${code.toLowerCase()}/sync`),

  disconnectPlatform: (code: string) =>
    del<void>(`/api/platforms/${code.toLowerCase()}`),

  connectPsn: (npsso: string) =>
    post<void>('/api/platforms/psn/connect', { npsso }),

  connectXbox: (apiKey: string) =>
    post<void>('/api/platforms/xbox/connect', { apiKey }),

  // manual games (Nintendo / Epic)
  addManualGame: (body: ManualAddBody) =>
    post<UserGameDetail>('/api/games/manual', body),

  // IGDB
  igdbSearch: (q: string) =>
    get<IgdbSearchResult[]>(`/api/igdb/search?q=${encodeURIComponent(q)}`),

  igdbUpcoming: (scope: 'my-platforms' | 'all' = 'my-platforms') =>
    get<IgdbUpcomingRelease[]>(`/api/igdb/upcoming${scope === 'all' ? '?scope=all' : ''}`),
};
