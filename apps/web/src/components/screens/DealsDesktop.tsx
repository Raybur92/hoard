import { useMemo } from 'react';
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
  const diffMs = expires.getTime() - Date.now();
  if (diffMs <= 0) return 'expired';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `ends in ${days}d ${hours}h`;
  return `ends in ${hours}h`;
}

/** Map a store name to its brand CSS key. Returns '' for unknown stores. */
function shopKey(shopName: string): string {
  const n = shopName.toLowerCase();
  if (n.includes('steam')) return 'st';
  if (n === 'gog' || n.includes('gog.com') || n.includes('good old')) return 'gog';
  if (n.includes('humble')) return 'hb';
  if (n.includes('green man') || n === 'gmg') return 'gmg';
  if (n.includes('epic')) return 'ep';
  if (n.includes('playstation') || n.includes('psn')) return 'psn';
  if (n.includes('nintendo') || n.includes('eshop') || n.includes('e-shop')) return 'ns';
  if (n.includes('itch')) return 'it';
  if (n.includes('instant gaming')) return 'ig';
  if (n.includes('cdkeys') || n === 'cdkey') return 'ck';
  if (n.includes('kinguin')) return 'kg';
  return '';
}

interface DealStore {
  shopName: string;
  currentPrice: number;
  currency: string;
  discountPct: number;
  dealUrl: string;
  expiresAt: string | null;
  voucher: string | null;
}

interface GameGroup {
  gameIgdbId: DealRow['gameIgdbId'];
  gameTitle: string;
  gameCoverUrl: string | null;
  gameHeroImageUrl: string | null;
  isWishlisted: boolean;
  isHistoricalLow: boolean;
  isTrendingDown: boolean;
  stores: DealStore[];
}

function groupByGame(deals: DealRow[]): GameGroup[] {
  const map = new Map<DealRow['gameIgdbId'], GameGroup>();
  for (const d of deals) {
    if (!map.has(d.gameIgdbId)) {
      map.set(d.gameIgdbId, {
        gameIgdbId: d.gameIgdbId,
        gameTitle: d.gameTitle,
        gameCoverUrl: d.gameCoverUrl,
        gameHeroImageUrl: d.gameHeroImageUrl,
        isWishlisted: d.isWishlisted,
        isHistoricalLow: d.isHistoricalLow,
        isTrendingDown: d.isTrendingDown,
        stores: [],
      });
    }
    const g = map.get(d.gameIgdbId)!;
    if (d.isWishlisted) g.isWishlisted = true;
    if (d.isHistoricalLow) g.isHistoricalLow = true;
    if (d.isTrendingDown) g.isTrendingDown = true;
    g.stores.push({
      shopName: d.shopName,
      currentPrice: d.currentPrice,
      currency: d.currency,
      discountPct: d.discountPct,
      dealUrl: d.dealUrl,
      expiresAt: d.expiresAt,
      voucher: d.voucher,
    });
  }
  for (const g of map.values()) {
    g.stores.sort((a, b) => a.currentPrice - b.currentPrice);
  }
  return Array.from(map.values());
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

function HeroDealCard({ deal }: { deal: DealRow }) {
  const navigate = useNavigate();
  const priceFmt = formatPrice(deal.currentPrice, deal.currency);
  const origFmt = deal.originalPrice !== null ? formatPrice(deal.originalPrice, deal.currency) : null;
  const expiryLabel = formatExpiry(deal.expiresAt);
  const key = shopKey(deal.shopName);
  return (
    <div
      data-testid="deal-hero"
      className="panel"
      style={{ padding: 18, display: 'flex', gap: 18, alignItems: 'stretch' }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/game/${deal.gameIgdbId}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${deal.gameIgdbId}`); }}
        aria-label={`Open ${deal.gameTitle}`}
        style={{ cursor: 'pointer', flexShrink: 0 }}
      >
        <Cover w={240} h={135} src={deal.gameHeroImageUrl ?? deal.gameCoverUrl} label={deal.gameTitle.toUpperCase()} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/game/${deal.gameIgdbId}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${deal.gameIgdbId}`); }}
            className="t-up"
            style={{ fontSize: 'var(--text-md)', color: 'var(--paper)', cursor: 'pointer' }}
          >
            {deal.gameTitle}
          </span>
          {key
            ? <span className={`sb sb-${key}`} style={{ pointerEvents: 'none' }}><span className="sb-store">{deal.shopName}</span></span>
            : <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>on {deal.shopName}</span>
          }
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span className="t-mono" style={{ fontSize: 'var(--text-2xl)', color: 'var(--green)' }}>−{deal.discountPct}%</span>
          <span className="t-mono" style={{ fontSize: 'var(--text-lg)', color: 'var(--paper)' }}>{priceFmt}</span>
          {origFmt && (
            <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)', textDecoration: 'line-through' }}>{origFmt}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {deal.isHistoricalLow && <span className="t-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--green)' }}>// historical low</span>}
          {deal.isTrendingDown && <span className="t-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--green)' }}>// trending ↓</span>}
          {expiryLabel && <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>{expiryLabel}</span>}
          {deal.voucher && <span className="t-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--amber)' }}>voucher: {deal.voucher}</span>}
        </div>
        <div style={{ flex: 1 }} />
        <div>
          <Btn sm variant="primary" onClick={() => window.open(deal.dealUrl, '_blank', 'noopener,noreferrer')}>
            buy on {deal.shopName} →
          </Btn>
        </div>
      </div>
    </div>
  );
}

function GameGroupRow({ group }: { group: GameGroup }) {
  const navigate = useNavigate();
  const bestPrice = group.stores.length > 0 ? (group.stores[0]?.currentPrice ?? Infinity) : Infinity;
  return (
    <div
      data-testid="deal-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr',
        borderBottom: '1px solid var(--rule)',
        position: 'relative',
      }}
    >
      {group.isWishlisted && (
        <div
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--amber)' }}
          aria-hidden="true"
        />
      )}
      <div
        role="button"
        tabIndex={-1}
        onClick={() => navigate(`/game/${group.gameIgdbId}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${group.gameIgdbId}`); }}
        aria-hidden="true"
        style={{ cursor: 'pointer', padding: '10px 8px 10px 12px' }}
      >
        <Cover w={60} h={34} src={group.gameHeroImageUrl ?? group.gameCoverUrl} label={group.gameTitle.toUpperCase()} />
      </div>
      <div style={{ padding: '10px 14px 10px 4px', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/game/${group.gameIgdbId}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/game/${group.gameIgdbId}`); }}
            aria-label={`Open ${group.gameTitle}`}
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--paper)',
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: '1 1 0',
              minWidth: 0,
            }}
          >
            {group.gameTitle}
          </span>
          {group.isHistoricalLow && (
            <span className="t-mono" style={{ fontSize: 'var(--text-3xs)', color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              // hist. low
            </span>
          )}
          {group.isTrendingDown && !group.isHistoricalLow && (
            <span className="t-mono" style={{ fontSize: 'var(--text-3xs)', color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              // trending ↓
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {group.stores.map((s) => {
            const key = shopKey(s.shopName);
            return (
              <a
                key={s.shopName}
                href={s.dealUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`sb${key ? ` sb-${key}` : ''}${s.currentPrice === bestPrice ? ' best' : ''}`}
                aria-label={`${s.shopName}: −${s.discountPct}% ${formatPrice(s.currentPrice, s.currency)}`}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="sb-store">{s.shopName}</span>
                <span className="sb-disc">−{s.discountPct}%</span>
                <span className="sb-price">{formatPrice(s.currentPrice, s.currency)}</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DealsDesktop() {
  useDocumentTitle('Deals');
  const navigate = useNavigate();
  const { user } = useUser();
  const { data, loading, error, refetch } = useDeals();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopFilter = searchParams.get('shop');
  const tab = searchParams.get('tab') ?? 'wishlist';

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
    setSearchParams(params, { replace: true });
  };

  const setTab = (t: string): void => {
    const params = new URLSearchParams(searchParams);
    if (t === 'wishlist') params.delete('tab');
    else params.set('tab', t);
    setSearchParams(params, { replace: true });
  };

  const topWishlistDeal =
    data && shopFilter && data.topWishlistDeal?.shopName !== shopFilter
      ? null
      : (data?.topWishlistDeal ?? null);

  const { wishlistGrouped, browseGrouped } = useMemo(() => {
    return {
      wishlistGrouped: groupByGame(applyShopFilter(data?.wishlistDeals ?? [], shopFilter)),
      browseGrouped: groupByGame(applyShopFilter(data?.broaderFeed ?? [], shopFilter)),
    };
  }, [data, shopFilter]);

  const wishlistCount = (data?.topWishlistDeal ? 1 : 0) + wishlistGrouped.length;
  const browseCount = browseGrouped.length;

  return (
    <>
      <TopBar crumbs={['hoard', 'deals']} />

      {/* toolbar */}
      <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <span className="t-up" style={{ fontSize: 'var(--text-2xs)' }}>deals</span>
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
          {data?.lastSyncedAt
            ? `· refreshed ${new Date(data.lastSyncedAt).toLocaleString()}`
            : data ? '· no deals yet' : ''}
        </span>
        <span style={{ flex: 1 }} />
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>market: {user?.marketCode ?? '—'}</span>
        <Btn sm onClick={() => navigate('/settings')}>
          <Icon name="cog" size={10} /> change market
        </Btn>
        <Btn sm onClick={() => refetch()}>
          <Icon name="refresh" size={10} /> refresh
        </Btn>
      </div>

      {/* bundles strip — pinned above filter + tabs, always visible */}
      {data && (data.bundles ?? []).length > 0 && !shopFilter && (
        <div
          className="thin-scroll"
          data-testid="deals-bundles-section"
          role="region"
          aria-label="Current bundles"
          style={{
            padding: '8px 32px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', flexShrink: 0, marginRight: 4 }}>
            // bundles · {(data.bundles ?? []).length}
          </span>
          {(data.bundles ?? []).map((b) => (
            <a
              key={b.id}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              title={b.matchingTitles.length > 0 ? `On your wishlist: ${b.matchingTitles.join(', ')}` : undefined}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                gap: 2,
                padding: '6px 12px',
                background: b.matchingTitles.length > 0 ? 'var(--ink-2)' : 'var(--ink)',
                border: b.matchingTitles.length > 0 ? '1px solid var(--amber)' : '1px solid var(--rule)',
                borderRadius: 2,
                color: 'var(--paper)',
                textDecoration: 'none',
                flexShrink: 0,
                maxWidth: 220,
                overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
              <span className="t-faint" style={{ fontSize: 'var(--text-3xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.shopName} · {b.gameCount} games
                {b.matchingTitles.length === 1 && (
                  <span style={{ color: 'var(--amber)' }}> · {b.matchingTitles[0]}</span>
                )}
                {b.matchingTitles.length > 1 && (
                  <span style={{ color: 'var(--amber)' }}> · {b.matchingTitles[0]} +{b.matchingTitles.length - 1}</span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* store filter chip strip */}
      {shopList.length >= 2 && (
        <div
          className="thin-scroll"
          role="group"
          aria-label="Filter by shop"
          style={{ padding: '8px 32px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flexShrink: 0 }}
        >
          <button
            type="button"
            onClick={() => setShop(null)}
            className={`sc sc-all${shopFilter === null ? ' on' : ''}`}
            aria-pressed={shopFilter === null}
          >
            all <span className="sc-count">{allDeals.length}</span>
          </button>
          {shopList.map((s) => {
            const key = shopKey(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => setShop(s.name)}
                className={`sc${key ? ` sc-${key}` : ''}${shopFilter === s.name ? ' on' : ''}`}
                aria-pressed={shopFilter === s.name}
              >
                {s.name} <span className="sc-count">{s.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* tab bar */}
      <div
        role="tablist"
        aria-label="Deals sections"
        style={{ display: 'flex', borderBottom: '1px solid var(--rule)', background: 'var(--ink)', flexShrink: 0 }}
      >
        {(['wishlist', 'browse'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--amber)' : '2px solid transparent',
              cursor: 'pointer',
              color: tab === t ? 'var(--paper)' : 'var(--paper-faint)',
            }}
          >
            <span className="t-mono" style={{ fontSize: 'var(--text-2xs)' }}>
              {t === 'wishlist' ? `// wishlist · ${wishlistCount}` : `// browse · ${browseCount}`}
            </span>
          </button>
        ))}
      </div>

      {/* tab content */}
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && !loading && (
          <div className="panel" style={{ padding: 18 }}>
            <Marker>// failed to load deals</Marker>
            <p style={{ marginTop: 10, fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>{error}</p>
          </div>
        )}
        {loading && !data && <div className="skel" style={{ height: 160, width: '100%' }} />}

        {/* wishlist tab */}
        {tab === 'wishlist' && data && (
          <>
            {!topWishlistDeal && wishlistGrouped.length === 0 && (
              <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                <Marker>{shopFilter ? `// no ${shopFilter} wishlist deals` : '// nothing on your wishlist is on sale'}</Marker>
                <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>
                  {shopFilter
                    ? `nothing from your wishlist matched the ${shopFilter} filter.`
                    : 'hoard checks for new deals nightly. star games on the releases page to track them here.'}
                </p>
                {shopFilter && (
                  <div style={{ marginTop: 12 }}>
                    <Btn sm onClick={() => setShop(null)}>clear filter</Btn>
                  </div>
                )}
              </div>
            )}
            {topWishlistDeal && (
              <section data-testid="deals-hero-section">
                <Marker>// top wishlist deal</Marker>
                <div style={{ marginTop: 10 }}>
                  <HeroDealCard deal={topWishlistDeal} />
                </div>
              </section>
            )}
            {wishlistGrouped.length > 0 && (
              <section data-testid="deals-wishlist-section">
                <Marker>// wishlist deals · {wishlistGrouped.length}</Marker>
                <div className="panel" style={{ marginTop: 10 }}>
                  {wishlistGrouped.map((g) => (
                    <GameGroupRow key={String(g.gameIgdbId)} group={g} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* browse tab */}
        {tab === 'browse' && data && (
          <>
            {browseGrouped.length === 0 && (
              <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
                <Marker>{shopFilter ? `// no ${shopFilter} deals right now` : '// nothing on sale right now'}</Marker>
                <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--paper-dim)' }}>
                  {shopFilter
                    ? `nothing matched the ${shopFilter} filter.`
                    : 'hoard checks for new deals nightly. console pricing is sparser than PC — check the platform store directly if you don\'t see what you expected.'}
                </p>
                {!user?.marketCode && !shopFilter && (
                  <p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--paper-faint)' }}>
                    tip: set your market in <a href="/settings" style={{ color: 'var(--amber)' }}>settings → account</a> to see localised prices.
                  </p>
                )}
                {shopFilter && (
                  <div style={{ marginTop: 12 }}>
                    <Btn sm onClick={() => setShop(null)}>clear filter</Btn>
                  </div>
                )}
              </div>
            )}
            {browseGrouped.length > 0 && (
              <section data-testid="deals-broader-section">
                <Marker>// also on sale · {browseGrouped.length}</Marker>
                <div className="panel" style={{ marginTop: 10 }}>
                  {browseGrouped.map((g) => (
                    <GameGroupRow key={String(g.gameIgdbId)} group={g} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
