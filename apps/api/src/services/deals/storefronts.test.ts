import { classifyShop, isShopInScope, isReseller } from './storefronts';

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
