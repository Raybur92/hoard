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

/**
 * Fetch the Solr document for a specific Switch applicationId in the
 * given locale. Returns null when the title isn't on Nintendo's index
 * (delisted, region-locked elsewhere, etc.).
 */
export async function getNintendoPrice(
  applicationId: string,
  locale: string,
): Promise<NintendoPrice | null> {
  // Solr query: exact match on application_id_s, restricted to Switch
  // games. wt=json explicit; rows=1 — we only want the canonical doc.
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
  if (doc.application_id_s !== applicationId) {
    // Sanity check — Solr matched a different doc somehow. Skip.
    return null;
  }
  // All four price fields are required to surface a deal. If Nintendo
  // doesn't have a price (e.g. demo / free-to-start without a sale),
  // skip rather than emit a deal with zero values.
  const regular = doc.price_regular_f;
  const lowest = doc.price_lowest_f;
  const pct = doc.price_discount_percentage_f;
  const hasDiscount = doc.price_has_discount_b;
  if (regular === undefined || lowest === undefined || pct === undefined || hasDiscount === undefined) {
    return null;
  }
  const currency = localeCurrency(locale);
  // Compute current selling price from regular × (1 - pct/100). Nintendo
  // doesn't include a "current price" field directly; their UI computes
  // it client-side. price_lowest_f is historical low, not necessarily
  // the active discount.
  const current = hasDiscount ? Math.round(regular * (100 - pct)) / 100 : regular;
  return {
    regular,
    current,
    historicalLow: lowest,
    discountPct: pct,
    currency,
    hasDiscount,
    title: doc.title ?? doc.title_master_s ?? '(unknown)',
    applicationId,
  };
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
