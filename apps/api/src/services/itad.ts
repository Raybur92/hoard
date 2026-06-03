/**
 * DEALS-PR1 — IsThereAnyDeal (ITAD) API client.
 *
 * ITAD aggregates pricing/deals across PC + console storefronts. We use
 * it for:
 *   - Current deals per game per storefront (`/games/prices/v3`)
 *   - Historical low per shop (carried inside the prices response)
 *   - Shop catalog for classification (`/service/shops/v1`)
 *   - ID lookup by Steam appid (`/lookup/id/shop/61/v1`) — preferred when
 *     we have a steamAppId on Game; falls back to title lookup
 *     (`/games/lookup/v1`) for non-Steam-keyed games (PSN / Xbox / Switch
 *     / etc.).
 *
 * Per PAGES_PLAN §8 OQ-DEALS-1: env-vars-only auth (`ITAD_API_KEY`).
 * Same pattern as IGDB / Steam / GOG. Console coverage is sparser than
 * PC per OQ-DEALS-3 — accepted gap; the orchestrator silently skips
 * games ITAD doesn't know.
 *
 * Throws `ItadClientError` on misconfiguration or network failure.
 * Callers (the orchestrator) should catch + log + continue rather than
 * letting one bad request fail the whole nightly sync.
 */

const ITAD_BASE = 'https://api.isthereanydeal.com';

export class ItadClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ItadClientError';
  }
}

interface ItadPriceAmount {
  amount: number;
  amountInt: number;
  currency: string;
}

export interface ItadShop {
  id: number;
  title: string;
}

// ITAD's `/games/prices/v3` returns shop as `{ id, name }`. The `/shops/v1`
// catalog endpoint returns `{ id, title }`. Different shapes, same entity.
export interface ItadPriceShop {
  id: number;
  name: string;
}

export interface ItadDeal {
  shop: ItadPriceShop;
  price: ItadPriceAmount;
  regular: ItadPriceAmount;
  cut: number;
  voucher?: string;
  storeLow?: ItadPriceAmount;
  flag?: string;
  drm?: { id: number; name: string }[];
  platforms?: { id: number; name: string }[];
  timestamp?: string;
  expiry?: string;
  url: string;
}

export interface ItadGamePrices {
  id: string;
  deals: ItadDeal[];
}

function getApiKey(): string | null {
  return process.env['ITAD_API_KEY'] ?? null;
}

async function itadFetch<T>(
  path: string,
  params: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const key = getApiKey();
  if (!key) throw new ItadClientError('ITAD_API_KEY not set');
  const url = new URL(ITAD_BASE + path);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const init: RequestInit = { method: body ? 'POST' : 'GET' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), init);
  if (!res.ok) {
    throw new ItadClientError(`ITAD ${path} failed`, res.status);
  }
  return await res.json() as T;
}

/**
 * Returns true when the env var is present. The orchestrator gates on
 * this so non-Andrea environments (e.g. Luigi running local dev without
 * the key) don't crash — the /deals page just renders empty.
 */
export function isItadConfigured(): boolean {
  return getApiKey() !== null;
}

/**
 * Bulk-resolve ITAD game IDs by title via POST `/lookup/id/title/v1`.
 * Body is an array of titles; response is a `{ title: uuid | null }`
 * map. One HTTP call per batch (no per-title throttling needed).
 *
 * Returns a Map keyed by INPUT title (so callers can correlate back to
 * which Game each ID belongs to). Missing entries → skipped from map.
 */
export async function lookupItadIdsByTitles(titles: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (titles.length === 0) return map;
  const result = await itadFetch<Record<string, string | null>>(
    '/lookup/id/title/v1', {}, titles,
  );
  for (const title of titles) {
    const itadId = result[title];
    if (itadId) map.set(title, itadId);
  }
  return map;
}

/**
 * Bulk-resolve ITAD game IDs by Steam appid via POST
 * `/lookup/id/shop/61/v1`. Shop ID 61 is Steam in ITAD's taxonomy;
 * `app/<appid>` is the ITAD shop-side identifier shape (not bare
 * numeric appid). Body is an array of those strings; response is a
 * map of input string → ITAD game uuid or null.
 *
 * Preferred over title lookup for Steam-keyed Games because the
 * appid → ITAD ID mapping is unambiguous (title lookup can mis-match
 * on common names like "Doom" → which?).
 */
export async function lookupItadIdsBySteamAppIds(appIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (appIds.length === 0) return map;
  const shopIds = appIds.map((id) => `app/${id}`);
  const result = await itadFetch<Record<string, string | null>>(
    '/lookup/id/shop/61/v1', {}, shopIds,
  );
  for (const appId of appIds) {
    const itadId = result[`app/${appId}`];
    if (itadId) map.set(appId, itadId);
  }
  return map;
}

/**
 * Fetch current prices for a batch of ITAD game IDs in the user's
 * market currency. Empty input → empty output (no API call).
 *
 * ITAD's v3 endpoint accepts up to 200 game IDs per request. Caller
 * is responsible for chunking; we error explicitly here if exceeded.
 */
const ITAD_PRICES_MAX_BATCH = 200;
export async function getPricesForGames(
  itadIds: string[],
  marketCode: string,
  shopIds?: number[],
): Promise<ItadGamePrices[]> {
  if (itadIds.length === 0) return [];
  if (itadIds.length > ITAD_PRICES_MAX_BATCH) {
    throw new ItadClientError(
      `getPricesForGames called with ${itadIds.length} ids — exceeds ITAD batch limit of ${ITAD_PRICES_MAX_BATCH}`,
    );
  }
  // Without an explicit `shops` parameter ITAD returns its default
  // popular-shops subset (Steam / GOG / Epic / Humble Store for typical
  // PC titles) — Tier-2 resellers (GMG / Kinguin / CDKeys / Humble
  // Bundle / Instant Gaming) are excluded. Pass the allow-listed shop
  // IDs explicitly to broaden coverage.
  const params: Record<string, string> = { country: marketCode };
  if (shopIds && shopIds.length > 0) {
    params['shops'] = shopIds.join(',');
  }
  return await itadFetch<ItadGamePrices[]>('/games/prices/v3', params, itadIds);
}

/**
 * Fetch ITAD's full shop catalog. Per the canonical docs the path is
 * `/shops/v1` (no `/service/` prefix); response is an array of
 * `{ id, name }` entries. Not currently called by the orchestrator —
 * the storefront classifier matches by shop NAME from `/games/prices/v3`
 * responses directly — but exposed for diagnostic + future filter-chip
 * work.
 */
export async function getShops(): Promise<ItadShop[]> {
  return await itadFetch<ItadShop[]>('/shops/v1', {});
}

/* ── DEALS-PR2 — bundles ──────────────────────────────────────── */

export interface ItadBundleGame {
  id: string;       // ITAD uuid
  slug: string;
  title: string;
  type: string;     // 'game' / 'media' / etc
  mature: boolean;
}

export interface ItadBundleTier {
  price: ItadPriceAmount;
  addon: boolean;
  games: ItadBundleGame[];
}

export interface ItadBundleShopPage {
  id: number;
  name: string;
  shopId: number;
}

export interface ItadBundle {
  id: number;
  title: string;
  page: ItadBundleShopPage;
  url: string;
  details?: string;
  isMature: boolean;
  publish?: string;     // ISO 8601
  expiry?: string;      // ISO 8601
  note?: string | null;
  counts: { games: number; media: number };
  tiers: ItadBundleTier[];
}

/**
 * Fetch all currently-active bundles from ITAD. Single ungated call —
 * returns ~20-50 active bundles globally. No pagination; the array IS
 * the full set at request time.
 */
export async function getBundles(): Promise<ItadBundle[]> {
  return await itadFetch<ItadBundle[]>('/bundles/v1', {});
}
