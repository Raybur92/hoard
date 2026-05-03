import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { MobileTabBar } from '../layout/MobileTabBar';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Icon } from '../primitives/Icon';
import { useUpcoming } from '../../hooks/useUpcoming';
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
  const { data, loading, refetch } = useUpcoming();

  async function handleToggleWishlist(igdbId: number) {
    try {
      await api.toggleWishlist(igdbId);
      void refetch();
    } catch { /* silent */ }
  }

  if (loading || !data) {
    return (
      <MobileFrame>
        <MobileHeader title="upcoming" />
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="skel" style={{ height: 140 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2].map(i => <div key={i} className="skel" style={{ width: 60, height: 24 }} />)}
          </div>
          {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 48 }} />)}
        </div>
        <MobileTabBar />
      </MobileFrame>
    );
  }

  const items = data.map(enrichItem).sort((a, b) => a.days - b.days);
  const featured = items[0];

  const monthGroups: Record<string, number> = {};
  for (const w of items) {
    const m = w.parts.month;
    monthGroups[m] = (monthGroups[m] ?? 0) + 1;
  }
  const monthTabs = Object.entries(monthGroups);

  const nextDays = featured?.days ?? 9999;
  const sub = `// ${items.length} releasing · next in ${nextDays < 9999 ? `${nextDays}d` : 'TBA'}`;

  return (
    <MobileFrame>
      <MobileHeader title="upcoming" sub={sub} />

      {/* month strip */}
      <div className="thin-scroll" style={{ display: 'flex', gap: 4, padding: '10px 16px 0', overflowX: 'auto' }}>
        {monthTabs.map(([m, n], i) => (
          <div key={m} style={{
            padding: '5px 10px',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
            color: i === 0 ? 'var(--void)' : 'var(--paper-dim)',
            background: i === 0 ? 'var(--paper)' : 'transparent',
            border: '1px solid ' + (i === 0 ? 'var(--paper)' : 'var(--rule)'),
            whiteSpace: 'nowrap',
          }}>{m} · {n}</div>
        ))}
      </div>

      {/* featured countdown */}
      {featured && (() => {
        const cd = countdownParts(featured.releaseDate);
        return (
          <div style={{ padding: '12px 16px 0' }}>
            <div className="panel" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Marker>// next drop</Marker>
                <span
                  style={{ fontSize: 9, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: featured.wishlisted ? 'var(--amber)' : 'var(--paper-faint)' }}
                  onClick={() => void handleToggleWishlist(featured.igdbId)}
                >
                  <Icon name="star" size={10} fill={featured.wishlisted} />
                  {featured.wishlisted ? 'tracking' : '+ wishlist'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <Cover w={64} h={86} src={featured.coverUrl} label={featured.title.toUpperCase()} dev={featured.developer ?? ''} bright />
                <div style={{ flex: 1 }}>
                  <div className="t-display" style={{ fontSize: 32, color: 'var(--amber)', lineHeight: 0.9 }}>
                    {featured.releaseDate ? `T-${featured.days}` : 'TBA'}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.15 }}>{featured.title}</div>
                  <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>
                    {featured.parts.full} · {featured.developer} · {featured.platStr}
                  </div>
                  {cd && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginTop: 8 }}>
                      {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
                        <div key={k} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', padding: '4px 0', textAlign: 'center' }}>
                          <div className="t-tnum" style={{ fontSize: 13, color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                          <div className="t-faint" style={{ fontSize: 7, marginTop: 1 }}>{k.toUpperCase()}</div>
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

      {/* agenda list */}
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 16px 0' }}>
        <Marker>// the agenda</Marker>
        <div style={{ marginTop: 10 }}>
          {items.map((g, i) => (
            <div key={g.igdbId} style={{
              display: 'grid',
              gridTemplateColumns: '40px 36px 1fr auto',
              gap: 10,
              padding: '10px 0',
              borderBottom: i < items.length - 1 ? '1px dotted var(--rule-bright)' : 'none',
              alignItems: 'center',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div className="t-up t-faint" style={{ fontSize: 8 }}>{g.parts.month}</div>
                <div className="t-display" style={{ fontSize: 18, color: 'var(--amber)', lineHeight: 1 }}>
                  {g.parts.day === '—' ? '?' : g.parts.day}
                </div>
              </div>
              <Cover w={36} h={48} src={g.coverUrl} label={(g.title[0] ?? '').toUpperCase()} bright />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, lineHeight: 1.1 }}>{g.title}</div>
                <div className="t-faint" style={{ fontSize: 9, marginTop: 2 }}>{g.developer} · {g.platStr}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-tnum" style={{ fontSize: 12, color: 'var(--amber)' }}>
                  {g.releaseDate ? `T-${g.days}d` : 'TBA'}
                </div>
                <div
                  style={{ cursor: 'pointer', color: g.wishlisted ? 'var(--amber)' : 'var(--paper-faint)' }}
                  onClick={() => void handleToggleWishlist(g.igdbId)}
                >
                  <Icon name="star" size={10} fill={g.wishlisted} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <MobileTabBar />
    </MobileFrame>
  );
}
