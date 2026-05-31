import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TopBar } from '../layout/TopBar';
import { Cover } from '../primitives/Cover';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { Marker } from '../primitives/Marker';
import { useDeals } from '../../hooks/useDeals';
import { useUser } from '../../contexts/UserContext';
import type { DealRow } from '@hoard/types';

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

export function DealsDesktop() {
  useDocumentTitle('Deals');
  const navigate = useNavigate();
  const { user } = useUser();
  const { data, loading, error, refetch } = useDeals();
  useEffect(() => { /* mount no-op — useDeals fetches via SWR */ }, []);

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
        {data && !data.topWishlistDeal && data.wishlistDeals.length === 0 && data.broaderFeed.length === 0 && (
          <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
            <Marker>// nothing on sale right now</Marker>
            <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>
              hoard checks for new deals nightly. console pricing data is sparser than PC; check the platform store directly if you don't see what you expected.
            </p>
            {!user?.marketCode && (
              <p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--paper-faint)' }}>
                tip: set your market in <a href="/settings" style={{ color: 'var(--amber)' }}>settings → account</a> to see localised prices.
              </p>
            )}
          </div>
        )}
        {data?.topWishlistDeal && (
          <section data-testid="deals-hero-section">
            <Marker>// top wishlist deal</Marker>
            <div style={{ marginTop: 10 }}>
              <DealCard deal={data.topWishlistDeal} variant="hero" />
            </div>
          </section>
        )}
        {data && data.wishlistDeals.length > 0 && (
          <section data-testid="deals-wishlist-section">
            <Marker>// wishlist deals · {data.wishlistDeals.length}</Marker>
            <div className="panel" style={{ marginTop: 10 }}>
              {data.wishlistDeals.map((d) => <DealCard key={d.id} deal={d} variant="row" />)}
            </div>
          </section>
        )}
        {data && data.broaderFeed.length > 0 && (
          <section data-testid="deals-broader-section">
            <Marker>// also on sale · {data.broaderFeed.length}</Marker>
            <div className="panel" style={{ marginTop: 10 }}>
              {data.broaderFeed.map((d) => <DealCard key={d.id} deal={d} variant="row" />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
