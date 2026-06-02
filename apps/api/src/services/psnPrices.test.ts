/**
 * DEALS-PR2.5 — PSN scraper tests.
 *
 * The HTML scrape is the most fragile piece of DEALS-PR2.5. These tests
 * pin a sample-HTML snapshot of Sony's __NEXT_DATA__ shape so a Sony
 * page-structure change fires a unit-test failure before hitting prod.
 *
 * Pins:
 *   - marketToLocale mapping AT/DE/IT/FR/ES/GB/US; unmapped → null
 *   - extractPsnPriceFromHtml: parses __NEXT_DATA__ + finds SkuPrice
 *     nodes recursively (path-independent)
 *   - returns empty array when HTML has no __NEXT_DATA__
 *   - returns empty array when __NEXT_DATA__ is malformed JSON
 *   - getPsnPrice: 404 → null; price-string parser handles `€59,99`
 *     and `$59.99` shapes; picks the highest non-free SKU
 */

import {
  marketToLocale,
  extractPsnPriceFromHtml,
  getPsnPrice,
  PsnScrapeError,
} from './psnPrices';

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('DEALS-PR2.5 — PSN marketToLocale', () => {
  it('maps AT/DE/IT/FR/ES/GB/US to PSN locale paths', () => {
    expect(marketToLocale('AT')).toBe('en-at');
    expect(marketToLocale('DE')).toBe('de-de');
    expect(marketToLocale('IT')).toBe('it-it');
    expect(marketToLocale('FR')).toBe('fr-fr');
    expect(marketToLocale('ES')).toBe('es-es');
    expect(marketToLocale('GB')).toBe('en-gb');
    expect(marketToLocale('US')).toBe('en-us');
  });

  it('returns null for null / unmapped', () => {
    expect(marketToLocale(null)).toBeNull();
    expect(marketToLocale(undefined)).toBeNull();
    expect(marketToLocale('JP')).toBeNull();
  });
});

/* Sample HTML snapshot — reduced to the parts our parser actually walks.
 * Captured from store.playstation.com/en-us/search/astro%20bot on 2026-06-02.
 * If Sony rewrites their Next.js page structure such that __NEXT_DATA__
 * no longer contains SkuPrice nodes in this shape, this test fails and we
 * know to update the parser. */
const NEXT_DATA_FIXTURE = {
  props: {
    pageProps: {
      page: {
        body: {
          someSection: {
            results: [
              {
                __typename: 'Product',
                id: 'UP9000-PPSA21564_00-0000000000000000',
                name: 'Astro Bot',
                price: {
                  __typename: 'SkuPrice',
                  basePrice: '$59.99',
                  discountedPrice: '$39.59',
                  discountText: '-34%',
                  isFree: false,
                  skuId: 'UP9000-PPSA21564_00-0000000000000000-U002',
                },
              },
              {
                __typename: 'Product',
                id: 'UP9000-PPSA21564_00-DDE0000000000000',
                name: 'Astro Bot Digital Deluxe',
                price: {
                  __typename: 'SkuPrice',
                  basePrice: '$69.99',
                  discountedPrice: '$69.99',
                  discountText: null,
                  isFree: false,
                  skuId: 'UP9000-PPSA21564_00-DDE0000000000000-U002',
                },
              },
            ],
          },
        },
      },
    },
  },
};

function htmlWith(nextData: unknown): string {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

describe('DEALS-PR2.5 — extractPsnPriceFromHtml', () => {
  it('finds all SkuPrice nodes recursively in __NEXT_DATA__', () => {
    const { prices } = extractPsnPriceFromHtml(htmlWith(NEXT_DATA_FIXTURE));
    expect(prices).toHaveLength(2);
    expect(prices[0]!.basePrice).toBe('$59.99');
    expect(prices[0]!.discountedPrice).toBe('$39.59');
    expect(prices[0]!.discountText).toBe('-34%');
  });

  it('extracts the Product title from anywhere in the tree', () => {
    const { title } = extractPsnPriceFromHtml(htmlWith(NEXT_DATA_FIXTURE));
    expect(title).toBe('Astro Bot');
  });

  it('returns empty when HTML has no __NEXT_DATA__', () => {
    const { prices } = extractPsnPriceFromHtml('<html><body>no data here</body></html>');
    expect(prices).toEqual([]);
  });

  it('returns empty when __NEXT_DATA__ is malformed JSON', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{{ broken</script>';
    const { prices } = extractPsnPriceFromHtml(html);
    expect(prices).toEqual([]);
  });

  it('is path-independent — finds SkuPrice nested anywhere', () => {
    const weirdShape = {
      foo: { bar: { baz: [
        { __typename: 'SkuPrice', basePrice: '€19.99', discountedPrice: '€9.99', discountText: '-50%', isFree: false },
      ] } },
    };
    const { prices } = extractPsnPriceFromHtml(htmlWith(weirdShape));
    expect(prices).toHaveLength(1);
    expect(prices[0]!.basePrice).toBe('€19.99');
  });
});

describe('DEALS-PR2.5 — getPsnPrice', () => {
  it('returns the highest-basePrice non-free SKU when multiple exist (picks base game over add-ons)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlWith(NEXT_DATA_FIXTURE),
    });
    const p = await getPsnPrice(10003925, 'en-us');
    expect(p).not.toBeNull();
    // Digital Deluxe has the higher basePrice ($69.99) so it should win
    // the highest-base picker. (Real deployment may benefit from a
    // smarter "Standard Edition" preference, but base SKU = most expensive
    // non-free is a reasonable heuristic for v1.)
    expect(p!.regular).toBe(69.99);
    expect(p!.currency).toBe('USD');
  });

  it('returns null on 404', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    });
    const p = await getPsnPrice(99999, 'en-us');
    expect(p).toBeNull();
  });

  it('throws PsnScrapeError on 5xx', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    });
    await expect(getPsnPrice(123, 'en-us')).rejects.toThrow(PsnScrapeError);
  });

  it('parses European comma-decimal prices like €59,99', async () => {
    const euroFixture = {
      data: {
        product: {
          __typename: 'Product',
          name: 'Test Game',
          price: {
            __typename: 'SkuPrice',
            basePrice: '€59,99',
            discountedPrice: '€29,99',
            discountText: '-50%',
            isFree: false,
          },
        },
      },
    };
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlWith(euroFixture),
    });
    const p = await getPsnPrice(123, 'de-de');
    expect(p!.regular).toBeCloseTo(59.99, 2);
    expect(p!.current).toBeCloseTo(29.99, 2);
    expect(p!.discountPct).toBe(50);
    expect(p!.currency).toBe('EUR');
  });

  it('returns null when all SKUs are free or malformed', async () => {
    const freeOnly = {
      data: {
        product: {
          __typename: 'Product',
          name: 'Free Game',
          price: {
            __typename: 'SkuPrice',
            basePrice: 'Free',
            discountedPrice: 'Free',
            discountText: null,
            isFree: true,
          },
        },
      },
    };
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlWith(freeOnly),
    });
    const p = await getPsnPrice(123, 'en-us');
    expect(p).toBeNull();
  });
});
