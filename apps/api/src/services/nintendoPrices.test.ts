/**
 * DEALS-PR2.5 — Nintendo eShop client tests.
 *
 * Pins:
 *   - marketToLocale mapping for AT/DE/IT/FR/ES/GB; unmapped → null
 *   - locale → currency derivation (EUR vs GBP)
 *   - Solr response → NintendoPrice shape conversion
 *   - missing-fields → null (not partial object)
 *   - mismatched applicationId → null (sanity guard)
 *   - non-200 → throws NintendoClientError
 */

import { marketToLocale, getNintendoPrice, getNintendoPriceByTitle, NintendoClientError } from './nintendoPrices';

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('DEALS-PR2.5 — marketToLocale', () => {
  it('maps AT/DE/IT/FR/ES/GB to Nintendo locale paths', () => {
    expect(marketToLocale('AT')).toBe('en');
    expect(marketToLocale('DE')).toBe('de');
    expect(marketToLocale('IT')).toBe('it');
    expect(marketToLocale('FR')).toBe('fr');
    expect(marketToLocale('ES')).toBe('es');
    expect(marketToLocale('GB')).toBe('en-gb');
  });

  it('is case-insensitive on the marketCode', () => {
    expect(marketToLocale('at')).toBe('en');
    expect(marketToLocale('De')).toBe('de');
  });

  it('returns null for null / unmapped markets', () => {
    expect(marketToLocale(null)).toBeNull();
    expect(marketToLocale(undefined)).toBeNull();
    expect(marketToLocale('US')).toBeNull();
    expect(marketToLocale('JP')).toBeNull();
    expect(marketToLocale('')).toBeNull();
  });
});

const solrResponse = (overrides: Record<string, unknown> = {}) => ({
  response: {
    numFound: 1,
    docs: [{
      application_id_s: '0100633007d48000',
      title: 'Hollow Knight',
      title_master_s: 'Hollow Knight',
      price_regular_f: 14.99,
      price_lowest_f: 6.74,
      price_discount_percentage_f: 0,
      price_has_discount_b: false,
      ...overrides,
    }],
  },
});

describe('DEALS-PR2.5 — getNintendoPrice', () => {
  it('parses a non-discounted Solr response (EUR locale)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => solrResponse(),
    });
    const p = await getNintendoPrice('0100633007d48000', 'en');
    expect(p).not.toBeNull();
    expect(p!.regular).toBe(14.99);
    expect(p!.current).toBe(14.99); // no discount → current = regular
    expect(p!.historicalLow).toBe(6.74);
    expect(p!.discountPct).toBe(0);
    expect(p!.hasDiscount).toBe(false);
    expect(p!.currency).toBe('EUR');
    expect(p!.title).toBe('Hollow Knight');
  });

  it('derives GBP currency for the en-gb locale', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => solrResponse(),
    });
    const p = await getNintendoPrice('0100633007d48000', 'en-gb');
    expect(p!.currency).toBe('GBP');
  });

  it('computes current = regular × (1 - pct/100) on a discounted title', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => solrResponse({
        price_regular_f: 14.99,
        price_discount_percentage_f: 40,
        price_has_discount_b: true,
      }),
    });
    const p = await getNintendoPrice('0100633007d48000', 'en');
    expect(p!.hasDiscount).toBe(true);
    expect(p!.discountPct).toBe(40);
    expect(p!.current).toBe(8.99); // 14.99 × 0.6 = 8.994 → rounded to 8.99
  });

  it('returns null when the response has no docs', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { numFound: 0, docs: [] } }),
    });
    const p = await getNintendoPrice('nonexistent', 'en');
    expect(p).toBeNull();
  });

  it('returns null when the matched doc has a different applicationId (sanity guard)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => solrResponse({ application_id_s: 'something_else' }),
    });
    const p = await getNintendoPrice('0100633007d48000', 'en');
    expect(p).toBeNull();
  });

  it('returns null when a required price field is missing', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => solrResponse({ price_regular_f: undefined }),
    });
    const p = await getNintendoPrice('0100633007d48000', 'en');
    expect(p).toBeNull();
  });

  it('throws NintendoClientError on non-200 response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    await expect(getNintendoPrice('0100633007d48000', 'en'))
      .rejects.toThrow(NintendoClientError);
  });
});

describe('DEALS-PR2.5+ — getNintendoPriceByTitle (title fallback)', () => {
  it('picks the result with the highest discount % when multiple eligible', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          numFound: 3,
          docs: [
            { application_id_s: 'A1', title: 'Hollow Knight', price_regular_f: 14.99, price_lowest_f: 6.74, price_discount_percentage_f: 10, price_has_discount_b: true },
            { application_id_s: 'A2', title: 'Hollow Knight: Silksong', price_regular_f: 29.99, price_lowest_f: 29.99, price_discount_percentage_f: 50, price_has_discount_b: true },
            { application_id_s: 'A3', title: 'Hollow Knight: Voidheart', price_regular_f: 14.99, price_lowest_f: 14.99, price_discount_percentage_f: 0, price_has_discount_b: false },
          ],
        },
      }),
    });
    const p = await getNintendoPriceByTitle('Hollow Knight', 'en');
    expect(p).not.toBeNull();
    expect(p!.discountPct).toBe(50);
    expect(p!.title).toBe('Hollow Knight: Silksong');
  });

  it('prefers normalised-exact match when discount % ties', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          numFound: 2,
          docs: [
            { application_id_s: 'B1', title: 'Hollow Knight: Voidheart Edition', price_regular_f: 14.99, price_lowest_f: 6.74, price_discount_percentage_f: 0, price_has_discount_b: false },
            { application_id_s: 'B2', title: 'Hollow Knight',                   price_regular_f: 14.99, price_lowest_f: 6.74, price_discount_percentage_f: 0, price_has_discount_b: false },
          ],
        },
      }),
    });
    const p = await getNintendoPriceByTitle('Hollow Knight', 'en');
    expect(p!.title).toBe('Hollow Knight');
  });

  it('filters DLC results (keyword blacklist)', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          numFound: 2,
          docs: [
            { application_id_s: 'C1', title: 'Game DLC Pack', price_regular_f: 4.99, price_lowest_f: 4.99, price_discount_percentage_f: 80, price_has_discount_b: true },
            { application_id_s: 'C2', title: 'Game', price_regular_f: 29.99, price_lowest_f: 29.99, price_discount_percentage_f: 10, price_has_discount_b: true },
          ],
        },
      }),
    });
    // Despite the DLC having higher discount %, eligible filter excludes it.
    const p = await getNintendoPriceByTitle('Game', 'en');
    expect(p!.title).toBe('Game');
    expect(p!.discountPct).toBe(10);
  });

  it('returns null when Solr returns no docs', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { numFound: 0, docs: [] } }),
    });
    const p = await getNintendoPriceByTitle('Nonexistent Game', 'en');
    expect(p).toBeNull();
  });

  it('throws NintendoClientError on non-200 response', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    await expect(getNintendoPriceByTitle('Game', 'en'))
      .rejects.toThrow(NintendoClientError);
  });
});
