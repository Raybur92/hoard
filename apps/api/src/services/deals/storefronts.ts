/**
 * DEALS-PR1 — storefront taxonomy + classification.
 *
 * Per PAGES_PLAN §8.4, storefronts fall in two categories with different
 * rules:
 *   1. **Tier-1 official first-party storefronts** — always shown, never
 *      filtered. These aren't resellers; they're where the publisher
 *      sold the game.
 *   2. **Tier-2 trusted resellers** — curated allow-list only. Locked
 *      2026-05-30 at: Humble · Instant Gaming · GMG · Kinguin · CDKeys.
 *      Anything not on this list (G2A / Eneba / etc.) is filtered out
 *      entirely.
 *
 * Classification is by ITAD shop NAME (case-insensitive). Shop IDs
 * change rarely but the name is the stable identifier from ITAD's
 * `/service/shops/v1`. The lists below mirror Andrea's lock; expansion
 * is config-driven (edit this file + deploy) per OQ-DEALS-9.
 */

// Tier 1 — first-party storefronts; always shown when ITAD has a deal.
// Names match what ITAD's `/service/shops/v1` returns; case-insensitive
// match at classification time.
const TIER_1_FIRST_PARTY = new Set<string>([
  'steam',
  'gog',
  'epic games store',
  'epic game store', // ITAD has been seen with both spellings
  'humble store',     // Humble's own digital storefront (distinct from "Humble Bundle")
  'battle.net',
  'blizzard',         // ITAD calls Battle.net "Blizzard" in /service/shops/v1
  'itch.io',
  'playstation store',
  'xbox store',
  'microsoft store',  // Xbox storefront sometimes appears under this name
  'nintendo eshop',
  'nintendo us',      // ITAD's name for nintendo.com US storefront
  'nintendo uk',
  // Publisher-owned first-party stores added 2026-06-03 after the ITAD
  // shop catalog diagnostic showed them as legitimate first-party for
  // their own publisher catalogs (EA's FIFA/Mass Effect/Battlefield;
  // Ubisoft's Assassin's Creed/Far Cry/Watch Dogs lines).
  'ea store',
  'ubisoft store',
]);

// Tier 2 — trusted resellers allow-list. Locked 2026-05-30 per OQ-DEALS-9.
// Expanded 2026-06-03 after ITAD shop-catalog diagnostic:
//   - GreenManGaming added (ITAD's spelling) — earlier "green man gaming"
//     entry was a name mismatch; ITAD writes it as one word.
//   - Fanatical + GamesPlanet (DE/FR/UK/US regional variants) promoted
//     from "expansion candidates" to active allow-list per Andrea's call.
// Items in the spec's lock that ITAD doesn't track at all (Humble Bundle
// as a separate shop, Instant Gaming, Kinguin, CDKeys) are kept in the
// set so that if ITAD ever adds them, they're surface-ready — but they
// produce no deals via /games/prices/v3 today.
const TIER_2_RESELLER_ALLOW_LIST = new Set<string>([
  'humble bundle',     // Humble's bundle product line — distinct from Humble Store
  'instant gaming',
  'gmg',               // ITAD sometimes uses "GMG"
  'green man gaming',  // legacy spelling — kept as a defensive alias
  'greenmangaming',    // ITAD's actual spelling (no spaces) in /service/shops/v1
  'kinguin',
  'cdkeys',
  'cd keys',           // possible alt-spelling
  'fanatical',
  'gamesplanet de',
  'gamesplanet fr',
  'gamesplanet uk',
  'gamesplanet us',
]);

export type StorefrontTier = 'first-party' | 'reseller' | 'excluded';

/**
 * Classify a shop NAME (as ITAD returns it) into one of three buckets.
 * 'excluded' covers grey-market sources (G2A / Eneba / etc.) and any
 * reseller not in the allow-list — those deals are dropped at the
 * orchestrator layer before persisting to Deal.
 */
export function classifyShop(name: string | null | undefined): StorefrontTier {
  if (typeof name !== 'string') return 'excluded';
  const lower = name.trim().toLowerCase();
  if (TIER_1_FIRST_PARTY.has(lower)) return 'first-party';
  if (TIER_2_RESELLER_ALLOW_LIST.has(lower)) return 'reseller';
  return 'excluded';
}

/**
 * `true` when the shop should be persisted as a Deal row. `false` for
 * excluded shops (grey-market / off-allow-list resellers).
 */
export function isShopInScope(name: string): boolean {
  return classifyShop(name) !== 'excluded';
}

/**
 * `true` when the deal should be classified `isReseller: true` on Deal.
 * Used by the frontend to apply filter / styling differences.
 */
export function isReseller(name: string): boolean {
  return classifyShop(name) === 'reseller';
}
