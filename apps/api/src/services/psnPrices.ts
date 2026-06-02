/**
 * DEALS-PR2.5 — PlayStation Store pricing scraper.
 *
 * Sony's official GraphQL API is locked behind persisted-query hashes
 * we can't anonymously extract (probe-deep-research.ts: zero hashes in
 * store page source — Sony moved them server-side). The legacy Chihiro
 * / valkyrie REST APIs are 404. The PSN GraphQL endpoint rejects
 * non-whitelisted queries.
 *
 * BUT — the consumer-facing store pages render at
 * `store.playstation.com/<locale>/concept/<id>` and embed full pricing
 * data in a Next.js `__NEXT_DATA__` script tag, anonymously accessible
 * with a basic User-Agent. We fetch that page, extract __NEXT_DATA__,
 * and walk the JSON looking for `{ __typename: 'SkuPrice', ... }`
 * objects. This is the same data layer their own website uses.
 *
 * Fragility: HTML scraping with a path-independent recursive parser.
 * If Sony reshuffles their Next.js page structure, the parser may stop
 * finding price nodes. We log + treat as zero-result; the rest of the
 * deal sync (ITAD + Nintendo + Xbox) keeps working. A sample-HTML
 * snapshot test pins the current shape so a Sony breakage fires in
 * unit tests before hitting production.
 *
 * Lookup key: `Game.psnConceptId` populated by the N-series PSN sync.
 *
 * Polite throttle: 1 req per 2-3 seconds per the DEALS-PR2.5 plan D5
 * (HTML pages are ~300-600KB; want to be polite + not look like a bot).
 */

const PSN_BASE = 'https://store.playstation.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class PsnScrapeError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'PsnScrapeError';
  }
}

/**
 * Hoard marketCode → PSN locale path. Markets outside this map return
 * null — caller skips that user/game.
 */
const MARKET_LOCALE: Record<string, string> = {
  AT: 'en-at',
  DE: 'de-de',
  IT: 'it-it',
  FR: 'fr-fr',
  ES: 'es-es',
  GB: 'en-gb',
  US: 'en-us',
};

export function marketToLocale(marketCode: string | null | undefined): string | null {
  if (!marketCode) return null;
  return MARKET_LOCALE[marketCode.toUpperCase()] ?? null;
}

/**
 * Locale → ISO 4217 currency. Used to stamp the Deal row; we can't
 * fully trust the `currencyCode` inside Sony's response because their
 * page sometimes renders the symbol in `basePrice` directly without a
 * separate code field. The locale → currency mapping is authoritative.
 */
const LOCALE_CURRENCY: Record<string, string> = {
  'en-at': 'EUR',
  'de-de': 'EUR',
  'it-it': 'EUR',
  'fr-fr': 'EUR',
  'es-es': 'EUR',
  'en-gb': 'GBP',
  'en-us': 'USD',
};

export interface PsnPrice {
  /** Regular ("base") price in locale currency. */
  regular: number;
  /** Current selling price — equals `regular` when not on sale. */
  current: number;
  /** Currency code (EUR / GBP / USD). */
  currency: string;
  /** Discount percentage (0 when not on sale). */
  discountPct: number;
  /** True when the game is currently discounted. */
  hasDiscount: boolean;
  /** Public store URL — used as the deal's buy link. */
  url: string;
  /** Title harvested from the page metadata (for debug logs). */
  title: string;
}

/**
 * Parse a localised price string like "€59,99" / "£49.99" / "$59.99"
 * into a number. Handles both `.` and `,` as decimal separators.
 * Returns NaN if the string can't be parsed (caller treats as no-result).
 */
function parsePriceString(s: string | null | undefined): number {
  if (!s) return NaN;
  // Strip currency symbols / non-digits except `.` and `,`
  const cleaned = s.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return NaN;
  // If both `.` and `,` are present, the rightmost is the decimal sep.
  // If only one is present, treat it as the decimal sep.
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalised: string;
  if (lastDot === -1 && lastComma === -1) {
    normalised = cleaned;
  } else if (lastDot > lastComma) {
    // dot is decimal
    normalised = cleaned.replace(/,/g, '');
  } else {
    // comma is decimal — strip dots used as thousands, swap comma to dot
    normalised = cleaned.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = parseFloat(normalised);
  return Number.isFinite(n) ? n : NaN;
}

interface SkuPriceNode {
  __typename?: string;
  basePrice?: string;
  discountedPrice?: string;
  discountText?: string | null;
  isFree?: boolean;
}

/**
 * Recursively walk a JSON-like value collecting all SkuPrice nodes.
 * Path-independent: doesn't depend on Sony's exact key layout, only on
 * the well-known `__typename: 'SkuPrice'` discriminator. Survives most
 * Next.js shuffle reorderings.
 */
function collectSkuPrices(obj: unknown, sink: SkuPriceNode[] = [], depth = 0): SkuPriceNode[] {
  if (depth > 12 || !obj || typeof obj !== 'object') return sink;
  if (Array.isArray(obj)) {
    for (const v of obj) collectSkuPrices(v, sink, depth + 1);
    return sink;
  }
  const o = obj as Record<string, unknown>;
  if (o['__typename'] === 'SkuPrice' && (o['basePrice'] !== undefined || o['discountedPrice'] !== undefined)) {
    sink.push(o as SkuPriceNode);
  }
  for (const k of Object.keys(o)) {
    collectSkuPrices(o[k], sink, depth + 1);
  }
  return sink;
}

/**
 * Extract __NEXT_DATA__ from a Sony store page HTML string. Exported for
 * sample-HTML unit testing — pass in a stored response snapshot to
 * verify the parser still finds price nodes.
 */
export function extractPsnPriceFromHtml(html: string): {
  prices: SkuPriceNode[];
  title: string;
} {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return { prices: [], title: '' };
  try {
    const data = JSON.parse(match[1]!) as unknown;
    const prices = collectSkuPrices(data);
    // Title harvest — Sony's concept pages put it in pageProps.batarangs
    // or pageProps.page.name. Recursive search for first Product with
    // a name field that doesn't look like a SKU id.
    let title = '';
    const findTitle = (v: unknown, d = 0): boolean => {
      if (d > 8 || !v || typeof v !== 'object') return false;
      if (Array.isArray(v)) {
        for (const x of v) if (findTitle(x, d + 1)) return true;
        return false;
      }
      const o = v as Record<string, unknown>;
      if ((o['__typename'] === 'Concept' || o['__typename'] === 'Product') && typeof o['name'] === 'string' && (o['name'] as string).length > 0 && !(o['name'] as string).includes('_')) {
        title = o['name'] as string;
        return true;
      }
      for (const k of Object.keys(o)) if (findTitle(o[k], d + 1)) return true;
      return false;
    };
    findTitle(data);
    return { prices, title };
  } catch {
    return { prices: [], title: '' };
  }
}

/**
 * Reduce a list of SkuPriceNode candidates to the canonical pick for
 * the "base game" deal. Sony's concept page returns prices for every
 * SKU (base game, deluxe edition, season pass, bundle variants, etc).
 *
 * Heuristic: pick the SkuPrice with the highest `basePrice` that is
 * NOT free and has a non-null discountedPrice. If multiple ties, prefer
 * the one with a discount over one without. This finds the most
 * expensive non-free SKU which is typically the "complete edition" or
 * base game.
 *
 * Returns null when no usable SKU is found (e.g. only free or invalid
 * entries).
 */
function pickBaseSkuPrice(skus: SkuPriceNode[]): SkuPriceNode | null {
  const usable = skus.filter((s) => {
    if (s.isFree) return false;
    const base = parsePriceString(s.basePrice);
    return Number.isFinite(base) && base > 0;
  });
  if (usable.length === 0) return null;
  // Sort by basePrice descending; if equal, prefer ones with discount.
  usable.sort((a, b) => {
    const ba = parsePriceString(a.basePrice);
    const bb = parsePriceString(b.basePrice);
    if (ba !== bb) return bb - ba;
    const hasA = a.discountText ? 1 : 0;
    const hasB = b.discountText ? 1 : 0;
    return hasB - hasA;
  });
  return usable[0] ?? null;
}

/**
 * Fetch the PSN concept page for a given conceptId in the given locale
 * and extract the base-SKU price. Returns null when the game isn't
 * listed in that locale, no usable SKU is found, or scraping fails.
 *
 * Caller catches `PsnScrapeError` on transport failure.
 */
export async function getPsnPrice(
  conceptId: number,
  locale: string,
): Promise<PsnPrice | null> {
  const url = `${PSN_BASE}/${locale}/concept/${conceptId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new PsnScrapeError(`PSN ${url} → ${res.status}`, res.status);
  }
  const html = await res.text();
  const { prices, title } = extractPsnPriceFromHtml(html);
  if (prices.length === 0) {
    // No SkuPrice nodes found — either game not in locale OR Sony
    // changed the page structure. The latter is a recoverable failure
    // (caller logs + skips); the next sync run picks up if our parser
    // is updated.
    return null;
  }
  const pick = pickBaseSkuPrice(prices);
  if (!pick) return null;

  const regular = parsePriceString(pick.basePrice);
  const current = pick.discountedPrice ? parsePriceString(pick.discountedPrice) : regular;
  const discountPct = pick.discountText
    ? Math.abs(parseInt(pick.discountText.replace(/[^0-9]/g, ''), 10))
    : 0;
  const hasDiscount = Boolean(pick.discountText) && discountPct > 0;
  const currency = LOCALE_CURRENCY[locale] ?? 'EUR';

  return {
    regular,
    current: Number.isFinite(current) ? current : regular,
    currency,
    discountPct,
    hasDiscount,
    url,
    title,
  };
}
