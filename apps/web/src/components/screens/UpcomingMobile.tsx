import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MobileHeader } from '../layout/MobileHeader';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Chip } from '../primitives/Chip';
import { Btn } from '../primitives/Btn';
import { PullableScroll } from '../primitives/PullableScroll';
import { Icon } from '../primitives/Icon';
import { useUpcoming, type UpcomingScope } from '../../hooks/useUpcoming';
import { api } from '../../lib/api';
import { daysUntil, upcomingDateParts, countdownParts } from '../../lib/utils';
import type { IgdbUpcomingRelease } from '@hoard/types';

function toPlatCode(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('steam')) return 'ST';
  if (n.includes('ps') || n.includes('playstation')) return 'PS';
  if (n.includes('xbox')) return 'XB';
  if (n.includes('gog')) return 'GG';
  if (n.includes('nintendo')) return 'NT';
  if (n.includes('epic')) return 'EP';
  return n.slice(0, 2).toUpperCase();
}

interface UpcomingItem extends IgdbUpcomingRelease {
  days: number;
  parts: ReturnType<typeof upcomingDateParts>;
  platStr: string;
}

function enrichItem(w: IgdbUpcomingRelease): UpcomingItem {
  return {
    ...w,
    days: daysUntil(w.releaseDate),
    parts: upcomingDateParts(w.releaseDate),
    platStr: w.platforms.map(toPlatCode).join('·'),
  };
}

export function UpcomingMobile() {
  useDocumentTitle("Upcoming");
  const [searchParams, setSearchParams] = useSearchParams();
  // Three real scopes after PR B (D1) — see UpcomingDesktop for rationale.
  const scopeParam = searchParams.get('scope');
  const scope: UpcomingScope =
    scopeParam === 'all' ? 'all'
    : scopeParam === 'wishlist' ? 'wishlist'
    : 'my-platforms';
  const setScope = (s: UpcomingScope) => {
    const next = new URLSearchParams(searchParams);
    if (s === 'my-platforms') next.delete('scope'); else next.set('scope', s);
    setSearchParams(next, { replace: true });
  };
  // PR A — A9d: clicking a month tab filters featured + agenda. null = all.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const { data, loading, error, refetch } = useUpcoming(scope);
  const { data: wishlistData } = useUpcoming('wishlist');
  const wishlistCount = wishlistData?.length ?? 0;

  async function handleToggleWishlist(igdbId: number) {
    try {
      await api.toggleWishlist(igdbId);
      void refetch();
    } catch { /* silent */ }
  }

  if (error) {
    return (
      <>
        <MobileHeader title="upcoming" sub="// load failed" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '24px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-2xs)" }}>{`// failed to load upcoming releases`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", maxWidth: 320, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        <MobileHeader title="upcoming" />
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="skel" style={{ height: 140 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2].map(i => <div key={i} className="skel" style={{ width: 60, height: 24 }} />)}
          </div>
          {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 48 }} />)}
        </div>
      </>
    );
  }

  const items = data.map(enrichItem).sort((a, b) => a.days - b.days);
  const featured = items[0];

  // Empty state — no upcoming releases tracked
  if (items.length === 0) {
    return (
      <>
        <MobileHeader title="upcoming" sub="// nothing tracked" />
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0' }}>
          <Chip on={scope === 'wishlist'} onClick={() => setScope('wishlist')}><Icon name="star" size={10} /> wishlist · {wishlistCount}</Chip>
          <Chip on={scope === 'my-platforms'} onClick={() => setScope('my-platforms')}>my platforms</Chip>
          <Chip on={scope === 'all'} onClick={() => setScope('all')}>all releases</Chip>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ padding: 20, width: '100%', textAlign: 'center' }}>
            <Marker>// nothing on the horizon</Marker>
            <p style={{ marginTop: 12, color: 'var(--paper-dim)', fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
              {scope === 'wishlist'
                ? 'no starred releases yet. switch to "all releases" and tap + on something.'
                : scope === 'my-platforms'
                ? 'no upcoming releases on your platforms. try "all releases".'
                : 'no upcoming releases match. lower the hype threshold in settings.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  const monthGroups: Record<string, number> = {};
  for (const w of items) {
    const m = w.parts.month;
    monthGroups[m] = (monthGroups[m] ?? 0) + 1;
  }
  const monthTabs = Object.entries(monthGroups);

  // PR A — A9d: month-tab filtering applied to agenda + featured
  const visibleItems = selectedMonth
    ? items.filter(w => w.parts.month === selectedMonth)
    : items;
  const featuredVisible = visibleItems[0];

  const nextDays = featured?.days ?? 9999;
  const sub = `// ${items.length} releasing · next in ${nextDays < 9999 ? `${nextDays}d` : 'TBA'}`;

  return (
    <>
      <MobileHeader title="upcoming" sub={sub} />

      {/* scope toggle — three real scopes after PR B (D1) */}
      <div className="thin-scroll" style={{ display: 'flex', gap: 6, padding: '8px 16px 0', overflowX: 'auto' }}>
        <Chip on={scope === 'wishlist'} onClick={() => setScope('wishlist')} ariaLabel="Show your wishlisted releases">
          <Icon name="star" size={10} /> wishlist · {wishlistCount}
        </Chip>
        <Chip on={scope === 'my-platforms'} onClick={() => setScope('my-platforms')} ariaLabel="Show upcoming releases on your platforms">
          my platforms
        </Chip>
        <Chip on={scope === 'all'} onClick={() => setScope('all')} ariaLabel="Show all upcoming releases">all releases</Chip>
      </div>

      {/* month strip — clicking a month filters agenda + featured */}
      <div className="thin-scroll" style={{ display: 'flex', gap: 4, padding: '10px 16px 0', overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => setSelectedMonth(null)}
          aria-pressed={selectedMonth === null}
          style={{
            padding: '5px 10px',
            fontFamily: 'var(--mono)', fontSize: "var(--text-3xs)", letterSpacing: '0.08em',
            color: selectedMonth === null ? 'var(--void)' : 'var(--paper-dim)',
            background: selectedMonth === null ? 'var(--paper)' : 'transparent',
            border: '1px solid ' + (selectedMonth === null ? 'var(--paper)' : 'var(--rule)'),
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >all · {items.length}</button>
        {monthTabs.map(([m, n]) => {
          const active = selectedMonth === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMonth(active ? null : m)}
              aria-pressed={active}
              style={{
                padding: '5px 10px',
                fontFamily: 'var(--mono)', fontSize: "var(--text-3xs)", letterSpacing: '0.08em',
                color: active ? 'var(--void)' : 'var(--paper-dim)',
                background: active ? 'var(--paper)' : 'transparent',
                border: '1px solid ' + (active ? 'var(--paper)' : 'var(--rule)'),
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >{m} · {n}</button>
          );
        })}
      </div>

      {/* featured countdown (uses month-filtered first item when active) */}
      {featuredVisible && (() => {
        const featured = featuredVisible;
        const cd = countdownParts(featured.releaseDate);
        return (
          <div style={{ padding: '12px 16px 0' }}>
            <div className="panel" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Marker>// next drop</Marker>
                <button
                  type="button"
                  onClick={() => void handleToggleWishlist(featured.igdbId)}
                  aria-pressed={featured.wishlisted}
                  aria-label={featured.wishlisted ? `Stop tracking ${featured.title}` : `Add ${featured.title} to wishlist`}
                  style={{ fontSize: "var(--text-2xs)", cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: featured.wishlisted ? 'var(--amber)' : 'var(--paper-dim)', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit' }}
                >
                  <Icon name="star" size={10} fill={featured.wishlisted} />
                  {featured.wishlisted ? 'tracking' : '+ wishlist'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <Cover w={64} h={86} src={featured.coverUrl} label={featured.title.toUpperCase()} dev={featured.developer ?? ''} bright />
                <div style={{ flex: 1 }}>
                  <div className="t-display" style={{ fontSize: 32, color: 'var(--amber)', lineHeight: 0.9 }}>
                    {featured.releaseDate ? `T-${featured.days}` : 'TBA'}
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", marginTop: 4, lineHeight: 1.15 }}>{featured.title}</div>
                  <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2 }}>
                    {featured.parts.full} · {featured.developer} · {featured.platStr}
                  </div>
                  {cd && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginTop: 8 }}>
                      {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
                        <div key={k} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', padding: '4px 0', textAlign: 'center' }}>
                          <div className="t-tnum" style={{ fontSize: "var(--text-sm)", color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                          <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 1 }}>{k.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* agenda list — filtered to selected month when active */}
      <PullableScroll onRefresh={refetch} ariaLabel="Upcoming releases" style={{ padding: '14px 16px 0' }}>
        <Marker>// the agenda · {selectedMonth ?? 'all'}</Marker>
        <div style={{ marginTop: 10 }}>
          {visibleItems.map((g, i) => (
            <div key={g.igdbId} style={{
              display: 'grid',
              gridTemplateColumns: '40px 36px 1fr auto',
              gap: 10,
              padding: '10px 0',
              borderBottom: i < visibleItems.length - 1 ? '1px dotted var(--rule-bright)' : 'none',
              alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>{g.parts.month}</div>
                <div className="t-display" style={{ fontSize: "var(--text-md)", color: 'var(--amber)', lineHeight: 1 }}>
                  {g.parts.day === '—' ? '?' : g.parts.day}
                </div>
              </div>
              <Cover w={36} h={48} src={g.coverUrl} label={(g.title[0] ?? '').toUpperCase()} bright />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-xs)", lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                  <span>{g.title}</span>
                  {g.category === 2 && <span style={{ fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>DLC</span>}
                  {g.category === 8 && <span style={{ fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>remake</span>}
                </div>
                <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 2 }}>{g.developer} · {g.platStr}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-tnum" style={{ fontSize: "var(--text-xs)", color: 'var(--amber)' }}>
                  {g.releaseDate ? `T-${g.days}d` : 'TBA'}
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleWishlist(g.igdbId)}
                  aria-pressed={g.wishlisted}
                  aria-label={g.wishlisted ? `Stop tracking ${g.title}` : `Add ${g.title} to wishlist`}
                  style={{ cursor: 'pointer', color: g.wishlisted ? 'var(--amber)' : 'var(--paper-dim)', background: 'transparent', border: 'none', padding: 4, margin: -4 }}
                >
                  <Icon name="star" size={10} fill={g.wishlisted} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </PullableScroll>
    </>
  );
}
