import { useNavigate } from 'react-router-dom';
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

export function DealsMobile() {
  useDocumentTitle('Deals');
  const navigate = useNavigate();
  const { user } = useUser();
  const { data, loading, error, refetch } = useDeals();
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
        {data && !data.topWishlistDeal && data.wishlistDeals.length === 0 && data.broaderFeed.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <Marker>// nothing on sale</Marker>
            <p style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--paper-dim)' }}>
              hoard checks nightly. {!user?.marketCode && 'set your market in settings → account.'}
            </p>
            <div style={{ marginTop: 12 }}>
              <Btn sm onClick={() => navigate('/settings')}>
                <Icon name="cog" size={10} /> settings
              </Btn>
            </div>
          </div>
        )}
        {data?.topWishlistDeal && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// top wishlist deal</Marker>
            </div>
            <MobileDealRow deal={data.topWishlistDeal} />
          </section>
        )}
        {data && data.wishlistDeals.length > 0 && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// wishlist deals · {data.wishlistDeals.length}</Marker>
            </div>
            {data.wishlistDeals.map((d) => <MobileDealRow key={d.id} deal={d} />)}
          </section>
        )}
        {data && data.broaderFeed.length > 0 && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// also on sale · {data.broaderFeed.length}</Marker>
            </div>
            {data.broaderFeed.map((d) => <MobileDealRow key={d.id} deal={d} />)}
          </section>
        )}
      </PullableScroll>
    </>
  );
}
