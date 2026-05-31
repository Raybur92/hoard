/**
 * GD-PR1 — S1 price-offers card (PAGES_PLAN §3.4 + §8.6).
 *
 * Reads from `useGameDeals(igdbId)`. Consumes the DEALS-PR1 pipeline +
 * affiliate router; URLs are pre-rewritten server-side.
 *
 * States:
 *   - loading        — skeleton (no flash, hides into the page rhythm)
 *   - empty          — "// no current deals" line (intentional, NOT 404)
 *   - has-deals      — one row per shop sorted by discount desc, cheapest first
 *
 * Trending-down + historical-low chips mirror the /deals surface so the
 * vocabulary is consistent across the app.
 */

import { useGameDeals } from '../../../hooks/useGameDeals';
import { Marker } from '../../primitives/Marker';

interface Props {
  igdbId: number;
}

export function PriceOffersCard({ igdbId }: Props) {
  const { data, loading, error } = useGameDeals(igdbId);

  if (loading && !data) {
    return (
      <section className="panel" style={{ padding: 20, marginTop: 24 }}>
        <Marker>// price offers</Marker>
        <div className="skel" style={{ height: 60, marginTop: 12 }} />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="panel" style={{ padding: 20, marginTop: 24 }}>
        <Marker>// price offers</Marker>
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 12 }}>
          {`// couldn't load deals`}
        </div>
      </section>
    );
  }

  const { deals, marketCode } = data;

  if (deals.length === 0) {
    return (
      <section className="panel" style={{ padding: 20, marginTop: 24 }}>
        <Marker>// price offers · market {marketCode.toLowerCase()}</Marker>
        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', marginTop: 12 }}>
          {`// no current deals in your market`}
        </div>
      </section>
    );
  }

  return (
    <section className="panel" style={{ padding: 20, marginTop: 24 }}>
      <Marker>// price offers · market {marketCode.toLowerCase()}</Marker>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        {deals.map((d) => {
          const pct = d.discountPct > 0 ? `-${d.discountPct}%` : '';
          return (
            <a
              key={d.id}
              href={d.dealUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="t-mono"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 14,
                alignItems: 'center',
                padding: '10px 4px',
                borderBottom: '1px solid var(--rule)',
                fontSize: 'var(--text-sm)',
                color: 'var(--paper)',
                textDecoration: 'none',
              }}
            >
              <span>
                {d.shopName.toLowerCase()}
                {d.isReseller && <span className="t-faint" style={{ marginLeft: 8, fontSize: 'var(--text-2xs)' }}>· reseller</span>}
                {d.isHistoricalLow && <span className="t-amber" style={{ marginLeft: 8, fontSize: 'var(--text-2xs)' }}>· historical low</span>}
                {d.isTrendingDown && <span className="t-green" style={{ marginLeft: 8, fontSize: 'var(--text-2xs)' }}>· trending down</span>}
              </span>
              {pct && <span className="t-green" style={{ fontSize: 'var(--text-sm)' }}>{pct}</span>}
              <span className="t-tnum" style={{ minWidth: 80, textAlign: 'right' }}>
                {d.currentPrice.toFixed(2)} {d.currency}
              </span>
              <span className="t-faint" style={{ fontSize: 'var(--text-2xs)' }}>buy →</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
