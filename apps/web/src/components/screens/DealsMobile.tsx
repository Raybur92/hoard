import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MobileHeader } from '../layout/MobileHeader';
import { Cover } from '../primitives/Cover';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { Marker } from '../primitives/Marker';
import { PullableScroll } from '../primitives/PullableScroll';
import { useDeals } from '../../hooks/useDeals';
import { useUser } from '../../contexts/UserContext';
import type { DealRow } from '@hoard/types';

/**
 * DEALS-PR1 — `/deals` mobile shell.
 *
 * Compressed per OQ-DEALS-4: hero collapses to a normal row; per-row
 * card density reduced (storefront chip moved to subline).
 */

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function MobileDealRow({ deal }: { deal: DealRow }) {
  const navigate = useNavigate();
  const priceFmt = formatPrice(deal.currentPrice, deal.currency);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/game/${deal.gameIgdbId}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${deal.gameIgdbId}`); }}
        aria-label={`Open ${deal.gameTitle}`}
      >
        <Cover w={60} h={34} src={deal.gameHeroImageUrl ?? deal.gameCoverUrl} label={deal.gameTitle.toUpperCase()} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.gameTitle}</div>
        <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span>{deal.shopName}</span>
          {deal.isHistoricalLow && <span style={{ color: 'var(--green)' }}>// low</span>}
          {deal.isTrendingDown && <span style={{ color: 'var(--green)' }}>// trending</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span className="t-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--green)' }}>−{deal.discountPct}%</span>
        <a href={deal.dealUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', textDecoration: 'none' }}>
          {priceFmt} →
        </a>
      </div>
    </div>
  );
}

function deriveShopList(deals: DealRow[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of deals) counts.set(d.shopName, (counts.get(d.shopName) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function applyShopFilter<T extends { shopName: string }>(rows: T[], shop: string | null): T[] {
  if (!shop) return rows;
  return rows.filter((r) => r.shopName === shop);
}

export function DealsMobile() {
  useDocumentTitle('Deals');
  const navigate = useNavigate();
  const { user } = useUser();
  const { data, loading, error, refetch } = useDeals();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopFilter = searchParams.get('shop');

  const allDeals: DealRow[] = useMemo(() => {
    if (!data) return [];
    const top = data.topWishlistDeal ? [data.topWishlistDeal] : [];
    return [...top, ...data.wishlistDeals, ...data.broaderFeed];
  }, [data]);
  const shopList = useMemo(() => deriveShopList(allDeals), [allDeals]);

  const setShop = (next: string | null): void => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('shop', next);
    else params.delete('shop');
    setSearchParams(params);
  };

  const topWishlistDeal = data && shopFilter && data.topWishlistDeal?.shopName !== shopFilter
    ? null
    : data?.topWishlistDeal ?? null;
  const wishlistDeals = applyShopFilter(data?.wishlistDeals ?? [], shopFilter);
  const broaderFeed = applyShopFilter(data?.broaderFeed ?? [], shopFilter);

  return (
    <>
      <MobileHeader
        title="deals"
        sub={data?.lastSyncedAt
          ? `// refreshed ${new Date(data.lastSyncedAt).toLocaleDateString()}`
          : '// no deals yet'}
        right={
          <Btn sm ariaLabel="Refresh deals" onClick={() => refetch()}>
            <Icon name="refresh" size={10} />
          </Btn>
        }
      />
      {shopList.length >= 2 && (
        <div
          className="thin-scroll"
          role="group"
          aria-label="Filter by shop"
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', marginRight: 2 }}>shop:</span>
          <button
            type="button"
            onClick={() => setShop(null)}
            className={shopFilter === null ? 'chip on' : 'chip'}
            style={{ cursor: 'pointer', flex: '0 0 auto' }}
            aria-pressed={shopFilter === null}
          >
            all
          </button>
          {shopList.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setShop(s.name)}
              className={shopFilter === s.name ? 'chip on' : 'chip'}
              style={{ cursor: 'pointer', flex: '0 0 auto' }}
              aria-pressed={shopFilter === s.name}
            >
              {s.name} <span className="t-faint" style={{ marginLeft: 4 }}>{s.count}</span>
            </button>
          ))}
        </div>
      )}
      <PullableScroll onRefresh={() => { refetch(); }} ariaLabel="Deals">
        {error && !loading && (
          <div style={{ padding: 16 }}>
            <Marker>// failed to load deals</Marker>
            <p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--paper-dim)' }}>{error}</p>
          </div>
        )}
        {loading && !data && (
          <div className="skel" style={{ height: 200, margin: 16 }} />
        )}
        {data && !topWishlistDeal && wishlistDeals.length === 0 && broaderFeed.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <Marker>{shopFilter ? `// no ${shopFilter} deals` : '// nothing on sale'}</Marker>
            <p style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--paper-dim)' }}>
              {shopFilter
                ? `nothing matched the ${shopFilter} filter.`
                : `hoard checks nightly. ${!user?.marketCode ? 'set your market in settings → account.' : ''}`}
            </p>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
              {shopFilter && <Btn sm onClick={() => setShop(null)}>clear filter</Btn>}
              {!shopFilter && (
                <Btn sm onClick={() => navigate('/settings')}>
                  <Icon name="cog" size={10} /> settings
                </Btn>
              )}
            </div>
          </div>
        )}
        {topWishlistDeal && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// top wishlist deal</Marker>
            </div>
            <MobileDealRow deal={topWishlistDeal} />
          </section>
        )}
        {wishlistDeals.length > 0 && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// wishlist deals · {wishlistDeals.length}</Marker>
            </div>
            {wishlistDeals.map((d) => <MobileDealRow key={d.id} deal={d} />)}
          </section>
        )}
        {broaderFeed.length > 0 && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// also on sale · {broaderFeed.length}</Marker>
            </div>
            {broaderFeed.map((d) => <MobileDealRow key={d.id} deal={d} />)}
          </section>
        )}
        {data && data.bundles.length > 0 && !shopFilter && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// bundles · {data.bundles.length}</Marker>
            </div>
            {data.bundles.map((b) => (
              <a
                key={b.id}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--rule)',
                  color: 'var(--paper)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)' }}>{b.title}</div>
                <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span>{b.shopName}</span>
                  <span>· {b.gameCount} games</span>
                  {b.matchingTitles.length > 0 && (
                    <span style={{ color: 'var(--amber)' }}>· {b.matchingTitles.length} match</span>
                  )}
                </div>
              </a>
            ))}
          </section>
        )}
      </PullableScroll>
    </>
  );
}
