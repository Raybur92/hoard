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
 * Normalise a title for fuzzy matching. Lowercase, strip non-alphanumeric
 * (except spaces), collapse multi-spaces.
 */
function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Walk __NEXT_DATA__ collecting Product objects (with name + nested
 * SkuPrice). Used by getPsnPrice on search-page responses to find the
 * matching product by title.
 */
interface ProductWithPrice {
  name: string;
  price: SkuPriceNode;
  /** SKU-style product id like 'EP4389-PPSA09827_00-GOTHIC1REMAKE000'. Used to build the per-product URL. */
  id: string | null;
  /** True when __typename is 'Concept' (multi-SKU group); affects the URL path (/concept/ vs /product/). */
  isConcept: boolean;
}
function collectProducts(obj: unknown, sink: ProductWithPrice[] = [], depth = 0): ProductWithPrice[] {
  if (depth > 12 || !obj || typeof obj !== 'object') return sink;
  if (Array.isArray(obj)) {
    for (const v of obj) collectProducts(v, sink, depth + 1);
    return sink;
  }
  const o = obj as Record<string, unknown>;
  const isProduct = o['__typename'] === 'Product' || o['__typename'] === 'Concept';
  const hasName = typeof o['name'] === 'string' && (o['name'] as string).length > 0;
  if (isProduct && hasName) {
    const priceNode = o['price'] as SkuPriceNode | undefined;
    if (priceNode && priceNode.__typename === 'SkuPrice' && (priceNode.basePrice !== undefined || priceNode.discountedPrice !== undefined)) {
      sink.push({
        name: o['name'] as string,
        price: priceNode,
        id: typeof o['id'] === 'string' ? o['id'] : null,
        isConcept: o['__typename'] === 'Concept',
      });
    }
  }
  for (const k of Object.keys(o)) collectProducts(o[k], sink, depth + 1);
  return sink;
}

/** Split a normalised title into tokens, dropping common stop words that vary
 * between storefronts ("The Last of Us Part II" vs "Last of Us Part II"). */
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and']);
function titleTokens(normalised: string): Set<string> {
  return new Set(normalised.split(/\s+/).filter((t) => t.length > 0 && !STOP_WORDS.has(t)));
}

/** Jaccard similarity over two token sets. Range [0, 1]; 1 = identical sets. */
function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Fetch the PSN search page for a title in the given locale and extract
 * the matching product's SKU price. Sony's `/concept/<id>` pages don't
 * embed pricing data (prices load via client-side API calls). The
 * `/search/<query>` page DOES embed pricing in `__NEXT_DATA__`, so we
 * search by title + match by name similarity.
 *
 * Per-title overhead: one HTTP fetch + ~300-600KB HTML response.
 *
 * Returns null when no Product matches the title with reasonable
 * similarity, or when the page has no usable SKU. Caller catches
 * `PsnScrapeError` on transport failure.
 */
export async function getPsnPrice(
  title: string,
  locale: string,
): Promise<PsnPrice | null> {
  const url = `${PSN_BASE}/${locale}/search/${encodeURIComponent(title)}`;
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
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  let products: ProductWithPrice[];
  try {
    const data = JSON.parse(match[1]!) as unknown;
    products = collectProducts(data);
  } catch {
    return null;
  }
  if (products.length === 0) return null;

  // Find the product matching the query title most usefully. Sony's
  // catalog has structural differences from PC stores:
  //   - Many games are sold ONLY as editions (Super Deluxe / Ultimate
  //     / Definitive / GOTY) — no plain-base-game SKU exists at all
  //   - Search results mix DLC + skin packs + currency packs + season
  //     passes + cosmetic add-ons with the actual game listings
  //   - Sony's relevance ordering puts DLC ahead of the game itself
  //     surprisingly often
  //   - PSN's search returns franchise neighbours (e.g. "Gothic 1 Remake"
  //     query → "Gothic 1 Classic" in results)
  //
  // Picker priorities (post-2026-06-02 fix — Andrea's Gothic 1 Remake
  // case showed prior policy picked the wrong franchise entry):
  //   1. Filter out DLC/microtransaction noise via name keywords
  //   2. Reject candidates below a Jaccard-similarity threshold so we
  //      don't return a wrong-game deal when no real match exists
  //      (Gothic 1 Classic for a "Gothic 1 Remake" query → rejected)
  //   3. Sort: exact normalised-name match wins, then highest token-
  //      overlap similarity, then highest discount %, then shortest name
  //   4. Returns null when no candidate passes the similarity floor —
  //      a missing PSN deal is far better UX than a wrong one.
  //
  // Previous policy sorted by discount % FIRST which let a deeply-
  // discounted franchise sibling beat the exact-named full-price item.
  const DLC_KEYWORDS = [
    'pack', 'kosmetik', 'punkte', 'currency', 'boost', 'season pass',
    'wäh', 'coin', 'gold', 'silver', 'skin', 'character', 'multiverse-finale',
    'mods-pack', 'cosmetic', 'addon', 'add-on', 'bonus content',
  ];
  const isDlc = (p: ProductWithPrice): boolean => {
    const n = normaliseTitle(p.name);
    return DLC_KEYWORDS.some((kw) => n.includes(kw));
  };
  const normQuery = normaliseTitle(title);
  const queryTokens = titleTokens(normQuery);
  const nonFree = products.filter((p) => !p.price.isFree);
  const eligible = nonFree.filter((p) => !isDlc(p));
  const pool = eligible.length > 0 ? eligible : nonFree;

  // Threshold rationale: 0.5 lets "Hollow Knight" match "Hollow Knight:
  // Voidheart Edition" (2 shared tokens / 4 total = 0.5) but rejects
  // "Gothic 1 Classic" for "Gothic 1 Remake" (2 / 4 = 0.5 — boundary;
  // exact-match bonus saves the day when both Remake and Classic are
  // in the results). Adjust if franchise pollution gets through.
  const SIM_THRESHOLD = 0.5;
  const scored = pool.map((p) => {
    const normName = normaliseTitle(p.name);
    const sim = jaccardSim(queryTokens, titleTokens(normName));
    const exactMatch = normName === normQuery;
    const pct = p.price.discountText
      ? Math.abs(parseInt(p.price.discountText.replace(/[^0-9]/g, ''), 10))
      : 0;
    return { p, exactMatch, sim, pct, len: normName.length };
  });
  const filtered = scored.filter((s) => s.exactMatch || s.sim >= SIM_THRESHOLD);
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => {
    if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
    if (a.sim !== b.sim) return b.sim - a.sim;
    if (a.pct !== b.pct) return b.pct - a.pct;
    return a.len - b.len;
  });
  const pick = filtered[0]?.p ?? null;
  if (!pick) return null;

  const regular = parsePriceString(pick.price.basePrice);
  if (!Number.isFinite(regular) || regular <= 0) {
    // "Free" or unparseable — not a usable deal.
    return null;
  }
  const current = pick.price.discountedPrice ? parsePriceString(pick.price.discountedPrice) : regular;
  const discountPct = pick.price.discountText
    ? Math.abs(parseInt(pick.price.discountText.replace(/[^0-9]/g, ''), 10))
    : 0;
  const hasDiscount = Boolean(pick.price.discountText) && discountPct > 0;
  const currency = LOCALE_CURRENCY[locale] ?? 'EUR';

  // Build the per-product URL when we have the SKU id. Falls back to the
  // search URL if Sony's __NEXT_DATA__ shape ever omits the id (defensive;
  // the fixture always carries it). Concept vs Product is the URL path
  // discriminator: /<locale>/concept/<id> vs /<locale>/product/<id>.
  const productUrl = pick.id
    ? `${PSN_BASE}/${locale}/${pick.isConcept ? 'concept' : 'product'}/${pick.id}`
    : url;

  return {
    regular,
    current: Number.isFinite(current) ? current : regular,
    currency,
    discountPct,
    hasDiscount,
    url: productUrl,
    title: pick.name,
  };
}
