/**
 * DEALS-PR2.5 — Nintendo eShop pricing client.
 *
 * Uses Nintendo Europe's Solr-backed search endpoint at
 * `search.nintendo-europe.com/<locale>/select`. This is the same data
 * layer that powers Nintendo's own eShop browse pages — anonymous,
 * public, stable enough for a personal-tool integration.
 *
 * Per-locale URLs give native currency. We map Hoard's `marketCode`
 * (AT/DE/IT/FR/ES/GB) to a Nintendo locale path per the DEALS-PR2.5
 * plan D4 table. Markets not in the table → skip silently.
 *
 * Lookup key: `application_id_s` (16-char hex Switch applicationId)
 * matches our `Game.nintendoTitleId` column exactly. No fuzzy matching
 * needed.
 *
 * Returned pricing fields (per Nintendo's Solr response):
 *   - price_regular_f:           regular price (MSRP-equivalent)
 *   - price_lowest_f:            historical low (Nintendo-tracked)
 *   - price_discount_percentage_f: current discount % (0 when not on sale)
 *   - price_has_discount_b:      boolean — is it currently on sale
 *
 * Polite throttle: 1 req/s per the DEALS-PR2.5 plan D5.
 */

const NINTENDO_BASE = 'https://search.nintendo-europe.com';

export class NintendoClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'NintendoClientError';
  }
}

/**
 * Hoard marketCode → Nintendo Europe locale path. Markets outside this
 * map return null from `marketToLocale()` — caller skips that user/game.
 */
const MARKET_LOCALE: Record<string, string> = {
  AT: 'en',     // Austria — fronted by EUR endpoint, English locale
  DE: 'de',     // Germany
  IT: 'it',     // Italy
  FR: 'fr',     // France
  ES: 'es',     // Spain
  GB: 'en-gb',  // United Kingdom
};

export function marketToLocale(marketCode: string | null | undefined): string | null {
  if (!marketCode) return null;
  return MARKET_LOCALE[marketCode.toUpperCase()] ?? null;
}

export interface NintendoPrice {
  /** Regular (MSRP-equivalent) price in the locale's currency. */
  regular: number;
  /** Current selling price — equals `regular` when not on sale. */
  current: number;
  /** Historical low Nintendo has tracked for this title in this locale. */
  historicalLow: number;
  /** Current discount % (0 when not on sale). */
  discountPct: number;
  /** ISO 4217 currency code derived from the locale (EUR / GBP / …). */
  currency: string;
  /** Whether the title is currently discounted. */
  hasDiscount: boolean;
  /** Nintendo's title for the game — useful for debug logs. */
  title: string;
  /** Switch applicationId. Should match the input. */
  applicationId: string;
}

interface SolrDoc {
  fs_id?: string;
  title?: string;
  title_master_s?: string;
  application_id_s?: string;
  price_regular_f?: number;
  price_lowest_f?: number;
  price_discount_percentage_f?: number;
  price_has_discount_b?: boolean;
}

interface SolrResponse {
  response?: {
    numFound?: number;
    docs?: SolrDoc[];
  };
}

/** Locale → expected currency. Used to stamp the Deal row. */
function localeCurrency(locale: string): string {
  return locale === 'en-gb' ? 'GBP' : 'EUR';
}

/** Normalise title for matching (lowercase, strip non-alphanumeric, collapse whitespace). */
function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Convert a Solr doc to a NintendoPrice (returns null if required price fields missing). */
function docToPrice(doc: SolrDoc, locale: string, applicationIdHint: string): NintendoPrice | null {
  const regular = doc.price_regular_f;
  const lowest = doc.price_lowest_f;
  const pct = doc.price_discount_percentage_f;
  const hasDiscount = doc.price_has_discount_b;
  if (regular === undefined || lowest === undefined || pct === undefined || hasDiscount === undefined) {
    return null;
  }
  const current = hasDiscount ? Math.round(regular * (100 - pct)) / 100 : regular;
  return {
    regular,
    current,
    historicalLow: lowest,
    discountPct: pct,
    currency: localeCurrency(locale),
    hasDiscount,
    title: doc.title ?? doc.title_master_s ?? '(unknown)',
    applicationId: doc.application_id_s ?? applicationIdHint,
  };
}

/**
 * Fetch the Solr document for a specific Switch applicationId in the
 * given locale. Returns null when the title isn't on Nintendo's index
 * (delisted, region-locked elsewhere, etc.). Use this when we have a
 * known nintendoTitleId (from M3 Switch sync).
 */
export async function getNintendoPrice(
  applicationId: string,
  locale: string,
): Promise<NintendoPrice | null> {
  const url = new URL(`${NINTENDO_BASE}/${locale}/select`);
  url.searchParams.set('q', `application_id_s:"${applicationId}"`);
  url.searchParams.set('fq', 'type:GAME AND system_type:nintendoswitch*');
  url.searchParams.set('rows', '1');
  url.searchParams.set('wt', 'json');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Hoard/1.0 (personal game tracker)' },
  });
  if (!res.ok) {
    throw new NintendoClientError(`Nintendo Solr ${res.status}`, res.status);
  }
  const body = (await res.json()) as SolrResponse;
  const doc = body.response?.docs?.[0];
  if (!doc) return null;
  if (doc.application_id_s !== applicationId) return null;
  return docToPrice(doc, locale, applicationId);
}

/**
 * DEALS-PR2.5+ — fetch the closest-matching Switch game by title.
 *
 * Used when we have a Game in the user's library that IGDB tags as
 * available on Switch, but the user hasn't synced their console (so
 * `Game.nintendoTitleId` is null). Falls back to fuzzy title match
 * against Nintendo's Solr index.
 *
 * Picker semantics mirror the PSN scraper:
 *   1. Filter out DLC-like results (heuristic keyword blacklist)
 *   2. Prefer highest current discount %
 *   3. Within ties, prefer normalised-exact name match, then shortest name
 *
 * Returns null when no usable doc is found.
 */
export async function getNintendoPriceByTitle(
  title: string,
  locale: string,
): Promise<NintendoPrice | null> {
  // Use Solr's `name` field for relevance-ranked title search. Quote
  // the query so embedded spaces don't get parsed as boolean operators.
  const url = new URL(`${NINTENDO_BASE}/${locale}/select`);
  url.searchParams.set('q', `title:"${title.replace(/"/g, '\\"')}"`);
  url.searchParams.set('fq', 'type:GAME AND system_type:nintendoswitch*');
  url.searchParams.set('rows', '20');
  url.searchParams.set('wt', 'json');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Hoard/1.0 (personal game tracker)' },
  });
  if (!res.ok) {
    throw new NintendoClientError(`Nintendo Solr ${res.status}`, res.status);
  }
  const body = (await res.json()) as SolrResponse;
  const docs = body.response?.docs ?? [];
  if (docs.length === 0) return null;

  // Filter + score
  const DLC_KEYWORDS = ['dlc', 'pack', 'pass', 'expansion', 'edition addon', 'add-on', 'addon', 'season pass', 'cosmetic'];
  const isDlc = (d: SolrDoc): boolean => {
    const n = normaliseTitle(d.title ?? d.title_master_s ?? '');
    return DLC_KEYWORDS.some((kw) => n.includes(kw));
  };
  const eligible = docs.filter((d) => !isDlc(d) && (d.price_regular_f ?? 0) > 0);
  const pool = eligible.length > 0 ? eligible : docs.filter((d) => (d.price_regular_f ?? 0) > 0);
  if (pool.length === 0) return null;

  const normQ = normaliseTitle(title);
  const scored = pool.map((d) => {
    const name = d.title ?? d.title_master_s ?? '';
    const norm = normaliseTitle(name);
    return {
      d,
      pct: d.price_discount_percentage_f ?? 0,
      exactBonus: norm === normQ ? 1 : 0,
      len: norm.length,
    };
  });
  scored.sort((a, b) => {
    if (a.pct !== b.pct) return b.pct - a.pct;
    if (a.exactBonus !== b.exactBonus) return b.exactBonus - a.exactBonus;
    return a.len - b.len;
  });
  const pick = scored[0]?.d;
  if (!pick) return null;
  return docToPrice(pick, locale, pick.application_id_s ?? '');
}

/**
 * Build the Nintendo store URL for a Switch title. Used as the deal's
 * buy link (no affiliate routing — Nintendo doesn't have a partner
 * program we'd route through, OQ-DEALS-5).
 *
 * Pattern observed on the search response: each Solr doc carries a `url`
 * field like `/en-gb/Games/Nintendo-Switch-download-software/Hollow-Knight-1125772.html`.
 * We could surface that from the Solr response. For now build a generic
 * search URL — the exact game URL is captured opportunistically when
 * present.
 */
export function nintendoStoreUrl(locale: string, title: string): string {
  const encoded = encodeURIComponent(title);
  return `https://www.nintendo.com/${locale}/search/?q=${encoded}`;
}
