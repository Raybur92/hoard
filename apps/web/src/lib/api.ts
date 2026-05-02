import type {
  DashboardResponse,
  GameListResponse,
  UserGameDetail,
  WishlistRelease,
  StatsResponse,
  GameStatus,
  PatchGameBody,
} from '@hoard/types';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
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
};
