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
  PlatformStatusResponse,
  ManualAddBody,
  IgdbSearchResult,
  IgdbUpcomingRelease,
} from '@hoard/types';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
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
    get<AuthUser>('/api/auth/me'),

  updateMe: (body: Partial<Pick<AuthUser, 'name'>>) =>
    patch<AuthUser>('/api/auth/me', body),

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

  igdbUpcoming: () =>
    get<IgdbUpcomingRelease[]>('/api/igdb/upcoming'),
};
