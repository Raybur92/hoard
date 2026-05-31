import { routeAffiliateUrl, getAffiliateEnvKey } from './affiliate';

describe('getAffiliateEnvKey', () => {
  it.each([
    ['Humble Bundle', 'HUMBLE_AFFILIATE_ID'],
    ['Instant Gaming', 'INSTANT_GAMING_AFFILIATE_ID'],
    ['GMG', 'GMG_AFFILIATE_ID'],
    ['Green Man Gaming', 'GMG_AFFILIATE_ID'],   // alt-spelling falls to same env
    ['Kinguin', 'KINGUIN_AFFILIATE_ID'],
    ['CDKeys', 'CDKEYS_AFFILIATE_ID'],
    ['GOG', 'GOG_AFFILIATE_ID'],
    ['itch.io', 'ITCHIO_AFFILIATE_ID'],
  ])('maps %s → %s', (shop, expected) => {
    expect(getAffiliateEnvKey(shop)).toBe(expected);
  });

  it.each(['Steam', 'PlayStation Store', 'Xbox Store', 'Nintendo eShop', 'Epic Games Store'])(
    'returns null for first-party storefronts without affiliate programs (%s)',
    (shop) => {
      expect(getAffiliateEnvKey(shop)).toBe(null);
    },
  );

  it('case-insensitive lookup', () => {
    expect(getAffiliateEnvKey('humble bundle')).toBe('HUMBLE_AFFILIATE_ID');
    expect(getAffiliateEnvKey('HUMBLE BUNDLE')).toBe('HUMBLE_AFFILIATE_ID');
  });
});

describe('routeAffiliateUrl', () => {
  beforeEach(() => {
    delete process.env.HUMBLE_AFFILIATE_ID;
    delete process.env.INSTANT_GAMING_AFFILIATE_ID;
    delete process.env.GMG_AFFILIATE_ID;
    delete process.env.KINGUIN_AFFILIATE_ID;
    delete process.env.CDKEYS_AFFILIATE_ID;
  });

  it('passes through unchanged when no env var set', () => {
    const url = 'https://www.humblebundle.com/store/some-game';
    expect(routeAffiliateUrl('Humble Bundle', url)).toBe(url);
  });

  it('passes through unchanged for shops with no affiliate mapping (Steam etc.)', () => {
    process.env.HUMBLE_AFFILIATE_ID = 'andrea';
    const url = 'https://store.steampowered.com/app/12345';
    expect(routeAffiliateUrl('Steam', url)).toBe(url);
  });

  it('appends the affiliate ID as the per-reseller-documented query param when env set', () => {
    process.env.HUMBLE_AFFILIATE_ID = 'andrea';
    const out = routeAffiliateUrl('Humble Bundle', 'https://www.humblebundle.com/store/some-game');
    expect(out).toContain('partner=andrea');
  });

  it.each([
    ['Instant Gaming', 'INSTANT_GAMING_AFFILIATE_ID', 'igr'],
    ['GMG', 'GMG_AFFILIATE_ID', 'mw_aref'],
    ['Kinguin', 'KINGUIN_AFFILIATE_ID', 'tap_s'],
    ['CDKeys', 'CDKEYS_AFFILIATE_ID', 'mw_aref'],
  ])('uses the correct param name for %s', (shop, envKey, paramName) => {
    process.env[envKey] = 'aff-123';
    const out = routeAffiliateUrl(shop, 'https://example.com/buy/game');
    expect(out).toContain(`${paramName}=aff-123`);
  });

  it('returns the original URL when URL parse fails (no double-throw)', () => {
    process.env.HUMBLE_AFFILIATE_ID = 'andrea';
    const malformed = 'not a real url';
    expect(routeAffiliateUrl('Humble Bundle', malformed)).toBe(malformed);
  });

  it('idempotent — calling twice does not duplicate the param', () => {
    process.env.HUMBLE_AFFILIATE_ID = 'andrea';
    const url = 'https://www.humblebundle.com/store/some-game';
    const once = routeAffiliateUrl('Humble Bundle', url);
    const twice = routeAffiliateUrl('Humble Bundle', once);
    expect(twice).toBe(once);
  });
});
