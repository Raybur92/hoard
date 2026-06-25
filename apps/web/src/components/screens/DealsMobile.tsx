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

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

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

function MobileGameGroupRow({ group }: { group: GameGroup }) {
  const navigate = useNavigate();
  const bestPrice = group.stores.length > 0 ? (group.stores[0]?.currentPrice ?? Infinity) : Infinity;
  return (
    <div
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
      <div style={{ padding: '10px 14px 10px 4px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
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
              // low
            </span>
          )}
          {group.isTrendingDown && !group.isHistoricalLow && (
            <span className="t-mono" style={{ fontSize: 'var(--text-3xs)', color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              // ↓
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
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
    setSearchParams(params, { replace: true });
  };

  const topWishlistDeal =
    data && shopFilter && data.topWishlistDeal?.shopName !== shopFilter
      ? null
      : (data?.topWishlistDeal ?? null);

  const { wishlistGrouped, browseGrouped } = useMemo(() => ({
    wishlistGrouped: groupByGame(applyShopFilter(data?.wishlistDeals ?? [], shopFilter)),
    browseGrouped: groupByGame(applyShopFilter(data?.broaderFeed ?? [], shopFilter)),
  }), [data, shopFilter]);

  return (
    <>
      <MobileHeader
        title="deals"
        sub={data?.lastSyncedAt ? `// refreshed ${new Date(data.lastSyncedAt).toLocaleDateString()}` : '// no deals yet'}
        right={
          <Btn sm ariaLabel="Refresh deals" onClick={() => refetch()}>
            <Icon name="refresh" size={10} />
          </Btn>
        }
      />

      {/* bundles strip — pinned at top, always visible */}
      {data && (data.bundles ?? []).length > 0 && !shopFilter && (
        <div
          className="thin-scroll"
          role="region"
          aria-label="Current bundles"
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
          }}
        >
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)', flexShrink: 0, marginRight: 4 }}>
            // bundles
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
                padding: '5px 10px',
                background: b.matchingTitles.length > 0 ? 'var(--ink-2)' : 'var(--ink)',
                border: b.matchingTitles.length > 0 ? '1px solid var(--amber)' : '1px solid var(--rule)',
                borderRadius: 2,
                color: 'var(--paper)',
                textDecoration: 'none',
                flexShrink: 0,
                maxWidth: 180,
                overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: 'var(--text-3xs)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
              <span className="t-faint" style={{ fontSize: 'var(--text-3xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.shopName}
                {b.matchingTitles.length === 1 && <span style={{ color: 'var(--amber)' }}> · {b.matchingTitles[0]}</span>}
                {b.matchingTitles.length > 1 && <span style={{ color: 'var(--amber)' }}> · {b.matchingTitles[0]} +{b.matchingTitles.length - 1}</span>}
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
          style={{ padding: '8px 12px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 5, overflowX: 'auto' }}
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

      <PullableScroll onRefresh={() => { refetch(); }} ariaLabel="Deals">
        {error && !loading && (
          <div style={{ padding: 16 }}>
            <Marker>// failed to load deals</Marker>
            <p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--paper-dim)' }}>{error}</p>
          </div>
        )}
        {loading && !data && <div className="skel" style={{ height: 200, margin: 16 }} />}

        {data && !topWishlistDeal && wishlistGrouped.length === 0 && browseGrouped.length === 0 && (
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

        {/* wishlist section — always shown on mobile (no tabs) */}
        {topWishlistDeal && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// top wishlist deal</Marker>
            </div>
            <MobileGameGroupRow group={{
              gameIgdbId: topWishlistDeal.gameIgdbId,
              gameTitle: topWishlistDeal.gameTitle,
              gameCoverUrl: topWishlistDeal.gameCoverUrl,
              gameHeroImageUrl: topWishlistDeal.gameHeroImageUrl,
              isWishlisted: topWishlistDeal.isWishlisted,
              isHistoricalLow: topWishlistDeal.isHistoricalLow,
              isTrendingDown: topWishlistDeal.isTrendingDown,
              stores: [{
                shopName: topWishlistDeal.shopName,
                currentPrice: topWishlistDeal.currentPrice,
                currency: topWishlistDeal.currency,
                discountPct: topWishlistDeal.discountPct,
                dealUrl: topWishlistDeal.dealUrl,
              }],
            }} />
          </section>
        )}
        {wishlistGrouped.length > 0 && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// wishlist deals · {wishlistGrouped.length}</Marker>
            </div>
            {wishlistGrouped.map((g) => (
              <MobileGameGroupRow key={String(g.gameIgdbId)} group={g} />
            ))}
          </section>
        )}
        {browseGrouped.length > 0 && (
          <section>
            <div style={{ padding: '14px 16px 6px' }}>
              <Marker>// also on sale · {browseGrouped.length}</Marker>
            </div>
            {browseGrouped.map((g) => (
              <MobileGameGroupRow key={String(g.gameIgdbId)} group={g} />
            ))}
          </section>
        )}
      </PullableScroll>
    </>
  );
}
