import { classifyShop, isShopInScope, isReseller, isShopRelevantForMarket } from './storefronts';

describe('classifyShop', () => {
  it.each([
    ['Steam', 'first-party'],
    ['steam', 'first-party'],   // case-insensitive
    ['GOG', 'first-party'],
    ['Epic Games Store', 'first-party'],
    ['Humble Store', 'first-party'],
    ['PlayStation Store', 'first-party'],
    ['Xbox Store', 'first-party'],
    ['Nintendo eShop', 'first-party'],
    ['itch.io', 'first-party'],
    ['Battle.net', 'first-party'],
    ['Blizzard', 'first-party'],          // ITAD's name for Battle.net (added 2026-06-03)
    ['EA Store', 'first-party'],          // added 2026-06-03
    ['Ubisoft Store', 'first-party'],     // added 2026-06-03
  ])('classifies %s as first-party', (name, expected) => {
    expect(classifyShop(name)).toBe(expected);
  });

  it.each([
    ['Humble Bundle', 'reseller'],
    ['Instant Gaming', 'reseller'],
    ['GMG', 'reseller'],
    ['Green Man Gaming', 'reseller'],
    ['GreenManGaming', 'reseller'],       // ITAD's actual spelling (added 2026-06-03)
    ['Kinguin', 'reseller'],
    ['CDKeys', 'reseller'],
    ['Fanatical', 'reseller'],            // promoted 2026-06-03
    ['GamesPlanet DE', 'reseller'],       // promoted 2026-06-03 (regional variant)
    ['GamesPlanet UK', 'reseller'],
    ['GamesPlanet FR', 'reseller'],
    ['GamesPlanet US', 'reseller'],
  ])('classifies %s as trusted reseller', (name, expected) => {
    expect(classifyShop(name)).toBe(expected);
  });

  it.each([
    ['G2A', 'excluded'],
    ['Eneba', 'excluded'],
    ['GamesPlanet', 'excluded'],   // bare "GamesPlanet" isn't a real ITAD shop; only regional variants
    ['GamersGate', 'excluded'],
    ['SomeRandomReseller', 'excluded'],
  ])('classifies %s as excluded (off-allow-list)', (name, expected) => {
    expect(classifyShop(name)).toBe(expected);
  });

  it('trims whitespace', () => {
    expect(classifyShop('  Steam  ')).toBe('first-party');
  });
});

describe('isShopInScope', () => {
  it('true for first-party AND for allow-list resellers', () => {
    expect(isShopInScope('Steam')).toBe(true);
    expect(isShopInScope('Humble Bundle')).toBe(true);
  });
  it('false for off-allow-list (grey market) shops', () => {
    expect(isShopInScope('G2A')).toBe(false);
    expect(isShopInScope('Eneba')).toBe(false);
  });
});

describe('isReseller', () => {
  it('true only for shops classified reseller', () => {
    expect(isReseller('Instant Gaming')).toBe(true);
    expect(isReseller('Steam')).toBe(false);
    expect(isReseller('G2A')).toBe(false);
  });
});

describe('isShopRelevantForMarket', () => {
  it('globally-available shops are relevant in any market', () => {
    expect(isShopRelevantForMarket('Steam', 'AT')).toBe(true);
    expect(isShopRelevantForMarket('Fanatical', 'AT')).toBe(true);
    expect(isShopRelevantForMarket('Instant Gaming', 'DE')).toBe(true);
    expect(isShopRelevantForMarket('Humble Bundle', 'US')).toBe(true);
  });

  it('GamesPlanet DE is relevant for AT (DACH) but not GB or US', () => {
    expect(isShopRelevantForMarket('GamesPlanet DE', 'AT')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet DE', 'DE')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet DE', 'CH')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet DE', 'GB')).toBe(false);
    expect(isShopRelevantForMarket('GamesPlanet DE', 'US')).toBe(false);
  });

  it('GamesPlanet UK is only relevant for GB/IE', () => {
    expect(isShopRelevantForMarket('GamesPlanet UK', 'GB')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet UK', 'IE')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet UK', 'AT')).toBe(false);
    expect(isShopRelevantForMarket('GamesPlanet UK', 'US')).toBe(false);
  });

  it('GamesPlanet US is only relevant for US/CA', () => {
    expect(isShopRelevantForMarket('GamesPlanet US', 'US')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet US', 'CA')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet US', 'AT')).toBe(false);
    expect(isShopRelevantForMarket('GamesPlanet US', 'DE')).toBe(false);
  });

  it('GamesPlanet FR is only relevant for FR/BE/CH/LU', () => {
    expect(isShopRelevantForMarket('GamesPlanet FR', 'FR')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet FR', 'BE')).toBe(true);
    expect(isShopRelevantForMarket('GamesPlanet FR', 'AT')).toBe(false);
    expect(isShopRelevantForMarket('GamesPlanet FR', 'GB')).toBe(false);
  });

  it('case-insensitive', () => {
    expect(isShopRelevantForMarket('gamesplanet uk', 'AT')).toBe(false);
    expect(isShopRelevantForMarket('GAMESPLANET UK', 'GB')).toBe(true);
  });

  it('Nintendo UK not shown for AT; Nintendo US not shown for AT', () => {
    expect(isShopRelevantForMarket('Nintendo UK', 'AT')).toBe(false);
    expect(isShopRelevantForMarket('Nintendo US', 'AT')).toBe(false);
    expect(isShopRelevantForMarket('Nintendo UK', 'GB')).toBe(true);
    expect(isShopRelevantForMarket('Nintendo US', 'US')).toBe(true);
  });
});
