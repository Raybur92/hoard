# Hoard — Game Pricing Sources: Research Notes

> **Status:** Research only — captured 2026-05-06 during the Upcoming-rework scoping conversation. Nothing is implemented yet. This file exists so we don't re-litigate the IGDB question every time pricing comes up.

---

## Question

Does our current data pipeline (IGDB + HLTB community proxy) expose **price / MSRP** for upcoming games? If not, where else could we pull it from?

---

## Finding 1 — IGDB does NOT expose pricing

Probed the production IGDB API (v4) directly via our existing Twitch credentials. Every plausible price-shaped field returns `400 Invalid Field`; every plausible price-shaped endpoint returns `404`.

| Probe | Result |
|---|---|
| `/games?fields=price` | `400 — Invalid field name: 'price'` |
| `/games?fields=msrp` | `400 — Invalid field name: 'msrp'` |
| `/games?fields=cost` | `400 — Invalid field name: 'cost'` |
| `/games?fields=pricing` | `400 — Invalid field name: 'pricing'` |
| `/games?fields=price_history` | `400 — Invalid field name: 'price_history'` |
| `/games?fields=retail_price` | `400 — Invalid field name: 'retail_price'` |
| `/prices` endpoint | `404` |
| `/game_prices` endpoint | `404` |
| `/retail_prices` endpoint | `404` |
| `/external_games?fields=*` | Returns Steam/GOG/etc IDs — no price fields |

IGDB is metadata-only by design. Pricing is deliberately out of scope.

---

## Finding 2 — Alternative sources, ranked

| Source | Coverage | Auth | Pre-order pricing | Reliability for *upcoming* |
|---|---|---|---|---|
| **Steam Store API** (`/api/appdetails?appids=X&filters=price_overview&cc=us`) | Steam-only | None (public, no key) | Yes when listed | High for already-on-Steam pre-orders. Returns `final_price`, `initial_price`, `discount_percent`, `currency`. Per-region via `cc=` param. Free, fast, stable. |
| **IsThereAnyDeal (ITAD) API** | 30+ stores: Steam, GOG, Epic, MS Store, Humble, Fanatical, etc. | Free key registration | Yes — best aggregator for pre-orders | Best per-game coverage. Tradeoff: third-party dependency, rate limits, occasional store-side gaps. |
| **PSN Store** | PSN | Cookie-based, reverse-engineered | Yes when announced | Same fragility as our existing PSN sync — pin everything, expect breakage. No formal API. |
| **Microsoft Store / Xbox** | XB | Mixed; some semi-public endpoints | Yes when announced | Fragmented — different surface for digital vs physical. |
| **Nintendo eShop** | NT | Country-locked semi-public endpoints | Yes (sometimes) | Per-region only; no clean global feed. |
| **GOG Store** | GG | Their search API works publicly | Limited pre-order coverage | OK for back-catalog, sparse for upcoming. |

---

## Caveat — "MSRP" is awkward for digital games

Independent of source, pricing for upcoming titles has structural problems:

- **Many games don't announce a final price until ~1 month before release.** A wishlist tracking a title 6 months out gets no price from any source — not because the source is bad, but because the publisher hasn't set one.
- **Prices are per-region** (USD / EUR / GBP / JPY / etc). Hoard would have to pick one canonical region or store all of them with the cost of bandwidth + churn.
- **Pre-order prices are volatile** — discounts apply, then expire; storefront promos shift weekly. A snapshot goes stale fast.
- **"MSRP" as a concept barely exists for digital titles.** Most stores expose `current_price` + `discount_percent`. The "manufacturer suggested retail price" field isn't a clean primitive anywhere; it's reconstructed from `initial_price` (Steam) or equivalent.
- **Free-to-play and Game Pass titles have no MSRP at all.** Schema needs to handle `null` cleanly (which we already do for HLTB).

---

## Recommended implementation path (if pricing becomes scope)

Mirror the HLTB pattern — single source, silent fail, layered fallback if needed:

1. **Steam-first.** Use the Steam Store API — free, no key, reliable. Cache `currentPrice`, `initialPrice`, `discountPercent`, `currency`, `fetchedAt`. The `Game.steamAppId` field already populates for ~62% of our library after PR D, and the existing `scripts/backfill-psn-hltb.ts` Steam-Store-search pattern can pick up some non-Steam titles for free.
2. **Silent fail.** Per Hard Rule 8 — if a price fetch fails or returns nothing, store `null` and show `—` in the UI. Never block a user action on price availability.
3. **Per-region: pick one for v1.** Default to USD; revisit if the user base diversifies. Store the currency code so we don't render `$` everywhere blindly.
4. **Optional ITAD layer (v2).** Adds Epic/GOG/PSN pre-order coverage but introduces a third-party dependency, a rate-limited key, and aggregation complexity. Only worth it if the Steam-only coverage proves too thin in practice.
5. **Skip true pre-announcement games.** Show `—` or `TBA` rather than guessing or scraping.

---

## Schema sketch (not implemented)

If we go ahead, this is roughly the shape that fits the existing data model:

```prisma
model GamePrice {
  id           String   @id @default(cuid())
  gameId       String
  currency     String   // 'USD', 'EUR', etc.
  currentCents Int?     // current price in minor units (cents/pence/etc)
  initialCents Int?     // pre-discount baseline; closest thing to MSRP
  discountPct  Int?     // 0–100; null when not discounted
  source       String   // 'steam', 'itad', 'manual'
  fetchedAt    DateTime @default(now())

  game Game @relation(fields: [gameId], references: [id])

  @@unique([gameId, currency])
}
```

Storing minor units (cents) avoids floating-point. `source` mirrors the `HltbData.source` pattern from PR D, so future ITAD additions can coexist without schema churn.

---

## Reproducing the probes

If IGDB ever adds pricing in a future API revision, re-run these from the repo root with `apps/api/.env` populated:

```ts
// One-shot probe via tsx
import { config } from 'dotenv';
config({ path: 'apps/api/.env' });

const tok = (await (await fetch('https://id.twitch.tv/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: 'client_credentials',
  }).toString(),
})).json()).access_token;

for (const f of ['price', 'msrp', 'cost', 'pricing', 'price_history', 'retail_price']) {
  const r = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID!, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'text/plain' },
    body: `fields ${f}; where id = 1942; limit 1;`,
  });
  console.log(f, '→', r.status);
}
```

Steam Store sanity check (no auth needed):

```bash
curl -s 'https://store.steampowered.com/api/appdetails?appids=292030&cc=us&filters=price_overview' | jq
```

---

## References

- [IGDB API docs](https://api-docs.igdb.com/) — confirms metadata scope, no pricing endpoints
- [IGDB v4 migration notes (Medium)](https://medium.com/igdb/igdb-api-v4-is-coming-6ba97874edbc)
- [Steam Store API community docs](https://wiki.teamfortress.com/wiki/User:RJackson/StorefrontAPI) — undocumented but stable for years
- IsThereAnyDeal API: `https://docs.isthereanydeal.com/`
