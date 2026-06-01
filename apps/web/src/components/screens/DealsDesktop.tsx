import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DealRow } from '@hoard/types';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TopBar } from '../layout/TopBar';
import { Cover } from '../primitives/Cover';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { Marker } from '../primitives/Marker';
import { useDeals } from '../../hooks/useDeals';
import { useUser } from '../../contexts/UserContext';

/**
 * DEALS-PR1 — `/deals` page (desktop).
 *
 * Layout (per PAGES_PLAN §8.4):
 *   - Toolbar: refresh + market chip + last-sync ts
 *   - Top-wishlist-deal hero card (span-12, dominant)
 *   - `// wishlist deals (N)` list
 *   - `// also on sale on your platforms (N)` broader feed
 *
 * Sale-event grouping + library-completion + physical deals → DEALS-PR2/3.
 * Discount range + sort filters → DEALS-PR4.
 */

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const expires = new Date(iso);
  const now = Date.now();
  const diffMs = expires.getTime() - now;
  if (diffMs <= 0) return 'expired';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `ends in ${days}d ${hours}h`;
  return `ends in ${hours}h`;
}

interface DealCardProps { deal: DealRow; variant: 'hero' | 'row' }

function DealCard({ deal, variant }: DealCardProps) {
  const navigate = useNavigate();
  const expiryLabel = formatExpiry(deal.expiresAt);
  const priceFmt = formatPrice(deal.currentPrice, deal.currency);
  const origFmt = deal.originalPrice !== null ? formatPrice(deal.originalPrice, deal.currency) : null;
  if (variant === 'hero') {
    return (
      <div
        data-testid="deal-hero"
        className="panel"
        style={{ padding: 18, display: 'flex', gap: 18, alignItems: 'stretch', gridColumn: '1 / -1' }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/game/${deal.gameIgdbId}`)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${deal.gameIgdbId}`); }}
          aria-label={`Open ${deal.gameTitle}`}
          style={{ cursor: 'pointer' }}
        >
          <Cover w={240} h={135} src={deal.gameHeroImageUrl ?? deal.gameCoverUrl} label={deal.gameTitle.toUpperCase()} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="t-up" style={{ fontSize: 'var(--text-md)', color: 'var(--paper)' }}>{deal.gameTitle}</span>
            <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>on {deal.shopName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="t-mono" style={{ fontSize: 'var(--text-2xl)', color: 'var(--green)' }}>−{deal.discountPct}%</span>
            <span className="t-mono" style={{ fontSize: 'var(--text-lg)', color: 'var(--paper)' }}>{priceFmt}</span>
            {origFmt && (
              <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', textDecoration: 'line-through' }}>{origFmt}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {deal.isWishlisted && <span className="t-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--amber)' }}>// on wishlist</span>}
            {deal.isHistoricalLow && <span className="t-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--green)' }}>// historical low</span>}
            {deal.isTrendingDown && <span className="t-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--green)' }}>// trending down</span>}
            {expiryLabel && <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>{expiryLabel}</span>}
          </div>
          <div style={{ flex: 1 }} />
          <div>
            <a href={deal.dealUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Btn sm variant="primary">buy on {deal.shopName} →</Btn>
            </a>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid="deal-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr auto auto auto auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 12px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/game/${deal.gameIgdbId}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${deal.gameIgdbId}`); }}
        aria-label={`Open ${deal.gameTitle}`}
        style={{ cursor: 'pointer' }}
      >
        <Cover w={60} h={34} src={deal.gameHeroImageUrl ?? deal.gameCoverUrl} label={deal.gameTitle.toUpperCase()} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.gameTitle}</div>
        <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', display: 'flex', gap: 10 }}>
          <span>{deal.shopName}</span>
          {deal.isHistoricalLow && <span style={{ color: 'var(--green)' }}>// historical low</span>}
          {deal.isTrendingDown && <span style={{ color: 'var(--green)' }}>// trending down</span>}
        </div>
      </div>
      <span className="t-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--green)' }}>−{deal.discountPct}%</span>
      <span className="t-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)' }}>{priceFmt}</span>
      <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', minWidth: 80, textAlign: 'right' }}>{expiryLabel ?? ''}</span>
      <a href={deal.dealUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buy ${deal.gameTitle} on ${deal.shopName}`} style={{ color: 'var(--paper)', textDecoration: 'none' }}>
        <span className="t-mono" style={{ fontSize: 'var(--text-xs)' }}>buy →</span>
      </a>
    </div>
  );
}

/**
 * DEALS-PR2 — derive the sorted-by-count distinct shop list from the
 * union of all rendered deal sets (top + wishlist + broader). Used to
 * populate the [shop: …] filter chip. Top shop renders first.
 */
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

export function DealsDesktop() {
  useDocumentTitle('Deals');
  const navigate = useNavigate();
  const { user } = useUser();
  const { data, loading, error, refetch } = useDeals();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopFilter = searchParams.get('shop');
  useEffect(() => { /* mount no-op — useDeals fetches via SWR */ }, []);

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

  // Apply the filter to each section.
  const topWishlistDeal = data && shopFilter && data.topWishlistDeal?.shopName !== shopFilter
    ? null
    : data?.topWishlistDeal ?? null;
  const wishlistDeals = applyShopFilter(data?.wishlistDeals ?? [], shopFilter);
  const broaderFeed = applyShopFilter(data?.broaderFeed ?? [], shopFilter);

  return (
    <>
      <TopBar crumbs={['hoard', 'deals']} />
      <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="t-up" style={{ fontSize: 'var(--text-2xs)' }}>deals</span>
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
          {data?.lastSyncedAt
            ? `· refreshed ${new Date(data.lastSyncedAt).toLocaleString()}`
            : data
              ? '· no deals yet'
              : ''}
        </span>
        <span style={{ flex: 1 }} />
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
          market: {user?.marketCode ?? '—'}
        </span>
        <Btn sm onClick={() => navigate('/settings')}>
          <Icon name="cog" size={10} /> change market
        </Btn>
        <Btn sm onClick={() => refetch()}>
          <Icon name="refresh" size={10} /> refresh
        </Btn>
      </div>

      {/* DEALS-PR2 — per-shop filter chip strip. Only renders when 2+
          distinct shops are present in the feed (no value at 0/1). */}
      {shopList.length >= 2 && (
        <div
          className="thin-scroll"
          role="group"
          aria-label="Filter by shop"
          style={{
            padding: '8px 32px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)', marginRight: 4 }}>shop:</span>
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
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && !loading && (
          <div className="panel" style={{ padding: 18 }}>
            <Marker>// failed to load deals</Marker>
            <p style={{ marginTop: 10, fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>{error}</p>
          </div>
        )}
        {loading && !data && (
          <div className="skel" style={{ height: 160, width: '100%' }} />
        )}
        {data && !topWishlistDeal && wishlistDeals.length === 0 && broaderFeed.length === 0 && (
          <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
            <Marker>{shopFilter ? `// no ${shopFilter} deals right now` : '// nothing on sale right now'}</Marker>
            <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>
              {shopFilter
                ? `nothing matched the ${shopFilter} filter. clear the filter or pick a different shop.`
                : 'hoard checks for new deals nightly. console pricing data is sparser than PC; check the platform store directly if you don\'t see what you expected.'}
            </p>
            {!user?.marketCode && !shopFilter && (
              <p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--paper-faint)' }}>
                tip: set your market in <a href="/settings" style={{ color: 'var(--amber)' }}>settings → account</a> to see localised prices.
              </p>
            )}
            {shopFilter && (
              <Btn sm onClick={() => setShop(null)} style={{ marginTop: 12 }}>clear filter</Btn>
            )}
          </div>
        )}
        {topWishlistDeal && (
          <section data-testid="deals-hero-section">
            <Marker>// top wishlist deal</Marker>
            <div style={{ marginTop: 10 }}>
              <DealCard deal={topWishlistDeal} variant="hero" />
            </div>
          </section>
        )}
        {wishlistDeals.length > 0 && (
          <section data-testid="deals-wishlist-section">
            <Marker>// wishlist deals · {wishlistDeals.length}</Marker>
            <div className="panel" style={{ marginTop: 10 }}>
              {wishlistDeals.map((d) => <DealCard key={d.id} deal={d} variant="row" />)}
            </div>
          </section>
        )}
        {broaderFeed.length > 0 && (
          <section data-testid="deals-broader-section">
            <Marker>// also on sale · {broaderFeed.length}</Marker>
            <div className="panel" style={{ marginTop: 10 }}>
              {broaderFeed.map((d) => <DealCard key={d.id} deal={d} variant="row" />)}
            </div>
          </section>
        )}
        {data && data.bundles.length > 0 && !shopFilter && (
          <section data-testid="deals-bundles-section">
            <Marker>// bundles touching your library · {data.bundles.length}</Marker>
            <div className="panel" style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
              {data.bundles.map((b) => (
                <a
                  key={b.id}
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 14,
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--rule)',
                    color: 'var(--paper)',
                    textDecoration: 'none',
                  }}
                  aria-label={`Open ${b.title} on ${b.shopName}`}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)' }}>{b.title}</div>
                    <div className="t-faint" style={{ fontSize: 'var(--text-2xs)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{b.shopName}</span>
                      <span>·</span>
                      <span>{b.gameCount} games</span>
                      {b.matchingTitles.length > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--amber)' }}>
                            includes {b.matchingTitles.length} in your library
                          </span>
                        </>
                      )}
                      {b.expiresAt && (
                        <>
                          <span>·</span>
                          <span>ends {new Date(b.expiresAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                    {b.matchingTitles.length > 0 && (
                      <div className="t-faint" style={{ fontSize: 'var(--text-3xs)', marginTop: 6, fontStyle: 'italic' }}>
                        {b.matchingTitles.slice(0, 4).join(' · ')}
                        {b.matchingTitles.length > 4 ? ` · +${b.matchingTitles.length - 4} more` : ''}
                      </div>
                    )}
                  </div>
                  <Btn sm variant="primary">view bundle →</Btn>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
