/**
 * DEALS-PR1 — per-reseller affiliate URL rewriter.
 *
 * Per PAGES_PLAN §8 OQ-DEALS-5 (reversed 2026-05-30): Hoard runs at a
 * cost (Railway + IGDB + ITAD + Vercel). Affiliate revenue from
 * storefronts where the user was already going to buy is cost-recovery,
 * not monetisation-driven UX. **Critically:** affiliate routing does
 * NOT change anything the user sees or does — the affiliate ID is
 * appended invisibly. No buy-pushing UX, no upgraded prominence, no
 * fake urgency.
 *
 * Implementation: per-reseller env-var-keyed affiliate IDs. If the env
 * var isn't set (Andrea hasn't signed up for that program yet), the
 * URL passes through unrewritten — identical UX, just no revenue
 * routing. Storefronts with no affiliate program (Steam / PSN / Xbox
 * / Nintendo / Epic) have no entry here; their links go direct.
 *
 * Identity boundary preserved (CLAUDE.md hard rules + AGENT.md #45):
 * affiliate routing applies primarily to resellers. The trusted
 * allow-list (OQ-DEALS-9) is curated for "what Andrea actually buys
 * from," NOT "where Hoard makes the most money."
 */

/** Map of ITAD-shop-name → env-var name holding the affiliate ID. */
const AFFILIATE_ENV_VARS: Record<string, string> = {
  // Tier-2 resellers (Andrea's allow-list per OQ-DEALS-9):
  'humble bundle': 'HUMBLE_AFFILIATE_ID',
  'instant gaming': 'INSTANT_GAMING_AFFILIATE_ID',
  'gmg': 'GMG_AFFILIATE_ID',
  'green man gaming': 'GMG_AFFILIATE_ID',
  'kinguin': 'KINGUIN_AFFILIATE_ID',
  'cdkeys': 'CDKEYS_AFFILIATE_ID',
  'cd keys': 'CDKEYS_AFFILIATE_ID',
  // Tier-1 first-party with affiliate programs (per OQ-DEALS-5):
  'humble store': 'HUMBLE_AFFILIATE_ID',  // Humble Store ≠ Humble Bundle but same affiliate
  'gog': 'GOG_AFFILIATE_ID',
  'itch.io': 'ITCHIO_AFFILIATE_ID',
};

/**
 * Per-reseller URL rewriter. Per the reseller's documented format,
 * affiliate IDs go either in a query param OR as a path prefix. We
 * use query params (the most common pattern); resellers requiring
 * a path-prefix format need a per-reseller override added here when
 * those programs ship.
 *
 * Default param name for unknown resellers: `affiliate`. Known
 * resellers use their documented param name (e.g. `kinguinid` for
 * Kinguin, `tap_a` for Humble).
 */
const AFFILIATE_PARAM_NAMES: Record<string, string> = {
  'humble bundle': 'partner',     // Humble uses ?partner=
  'humble store': 'partner',
  'instant gaming': 'igr',        // Instant Gaming uses ?igr=
  'gmg': 'mw_aref',                // Green Man Gaming uses ?mw_aref=
  'green man gaming': 'mw_aref',
  'kinguin': 'tap_s',              // Kinguin uses ?tap_s=
  'cdkeys': 'mw_aref',             // CDKeys uses mw_aref (same as GMG; both Awin-based historically)
  'cd keys': 'mw_aref',
  'gog': 'as_aid',                 // GOG uses ?as_aid=
  'itch.io': 'ref',                // itch.io uses ?ref=
};

/**
 * Rewrite a deal URL with the per-shop affiliate ID. Returns the
 * original URL when no affiliate ID is set or the shop has no
 * affiliate program (Steam / PSN / etc.).
 *
 * Idempotent — calling twice doesn't double-append the affiliate
 * param (URLSearchParams `set` overwrites).
 */
export function routeAffiliateUrl(shopName: string, originalUrl: string): string {
  const lower = shopName.trim().toLowerCase();
  const envKey = AFFILIATE_ENV_VARS[lower];
  if (!envKey) return originalUrl;
  const affiliateId = process.env[envKey];
  if (!affiliateId) return originalUrl;
  const paramName = AFFILIATE_PARAM_NAMES[lower] ?? 'affiliate';
  try {
    const url = new URL(originalUrl);
    url.searchParams.set(paramName, affiliateId);
    return url.toString();
  } catch {
    // URL parse failure — return original rather than throw. The deal's
    // `[buy →]` still works; we just don't get the affiliate cut.
    return originalUrl;
  }
}

/**
 * For testing — returns the env var name that would be consulted for
 * a given shop, or null when the shop has no affiliate mapping.
 */
export function getAffiliateEnvKey(shopName: string): string | null {
  return AFFILIATE_ENV_VARS[shopName.trim().toLowerCase()] ?? null;
}
