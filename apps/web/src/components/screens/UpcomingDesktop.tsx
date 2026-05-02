import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { useUpcoming } from '../../hooks/useUpcoming';
import { daysUntil, upcomingDateParts, countdownParts } from '../../lib/utils';
import { api } from '../../lib/api';
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
    platStr: w.platforms.map(toPlatCode).join(' · '),
  };
}

export function UpcomingDesktop() {
  const { data, loading, refetch } = useUpcoming();

  async function handleToggleWishlist(igdbId: number) {
    try {
      await api.toggleWishlist(igdbId);
      void refetch();
    } catch { /* silent */ }
  }

  if (loading || !data) {
    return (
      <div className="app-shell hoard-noise">
        <Sidebar />
        <div className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="t-mono t-faint" style={{ fontSize: 12 }}>// loading...</span>
        </div>
      </div>
    );
  }

  const items = data.map(enrichItem).sort((a, b) => a.days - b.days);
  const featured = items[0];

  const monthGroups: Record<string, number> = {};
  for (const w of items) {
    const m = w.parts.month;
    monthGroups[m] = (monthGroups[m] ?? 0) + 1;
  }
  const months = Object.entries(monthGroups);

  const timelineItems = items
    .filter(w => w.releaseDate)
    .slice(0, 8)
    .map((w, i) => ({ ...w, side: i % 2 === 0 ? 'top' : 'bot' }));
  const maxDays = Math.max(...timelineItems.map(w => w.days), 1);

  return (
    <div className="app-shell hoard-noise">
      <Sidebar />
      <div className="app-main">
        <TopBar crumbs={['hoard', 'upcoming']} />

        {/* month tabs */}
        <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
          {months.map(([m, n], i) => (
            <div key={m} style={{
              padding: '8px 14px',
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em',
              color: i === 0 ? 'var(--paper)' : 'var(--paper-faint)',
              borderBottom: i === 0 ? '2px solid var(--amber)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {m} <span className="t-faint" style={{ fontSize: 9 }}>{n}</span>
            </div>
          ))}
          <span style={{ flex: 1 }} />
          <div style={{ padding: '6px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Chip on><Icon name="star" size={11} /> wishlist · {items.length}</Chip>
            <Chip>all releases</Chip>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 460px', minHeight: 0 }}>

          {/* left: featured + timeline */}
          <div className="thin-scroll" style={{ overflow: 'auto', padding: '24px 32px 32px', borderRight: '1px solid var(--rule)' }}>

            {/* featured */}
            {featured && (() => {
              const cd = countdownParts(featured.releaseDate);
              return (
                <div className="panel" style={{ padding: 24, display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start' }}>
                  <Cover w={180} h={240} src={featured.coverUrl} label={featured.title.toUpperCase()} dev={featured.developer ?? '—'} year={featured.parts.full.split(',')[1]?.trim() ?? null} bright />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <Marker>// next release · {featured.days} days away</Marker>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                          <span className="t-display" style={{ fontSize: 48, lineHeight: 0.85, color: 'var(--amber)' }}>T-{featured.days}</span>
                          <div>
                            <div style={{ fontSize: 26, lineHeight: 1.05, color: 'var(--paper)', letterSpacing: '-0.01em' }}>{featured.title}</div>
                            <div className="t-mono t-dim" style={{ fontSize: 12, marginTop: 4 }}>{featured.developer} · {featured.genres[0] ?? '—'}</div>
                          </div>
                        </div>
                      </div>
                      {cd && (
                        <div style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
                          {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
                            <div key={k} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', padding: '6px 8px', textAlign: 'center', minWidth: 38 }}>
                              <div className="t-mono t-tnum" style={{ fontSize: 18, color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                              <div className="t-faint t-up" style={{ fontSize: 8, marginTop: 3 }}>{k.toUpperCase()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                      <div><div className="t-up t-faint" style={{ fontSize: 9 }}>release</div><div className="t-tnum" style={{ marginTop: 4, color: 'var(--paper)' }}>{featured.parts.full}</div></div>
                      <div><div className="t-up t-faint" style={{ fontSize: 9 }}>day</div><div className="t-tnum" style={{ marginTop: 4 }}>{featured.parts.dow}</div></div>
                      <div>
                        <div className="t-up t-faint" style={{ fontSize: 9 }}>platforms</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                          {featured.platforms.map(p => <Plat key={p} code={toPlatCode(p)} lg />)}
                        </div>
                      </div>
                      <div><div className="t-up t-faint" style={{ fontSize: 9 }}>genres</div><div style={{ marginTop: 4, fontSize: 11 }}>{featured.genres[0] ?? '—'}</div></div>
                    </div>
                    <div className="t-sans" style={{ marginTop: 16, fontSize: 13, lineHeight: 1.5, color: 'var(--paper-dim)' }}>
                      {featured.synopsis ?? featured.genres.join(' · ')}
                    </div>
                    <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn
                        {...(featured.wishlisted ? { variant: 'amber' as const } : {})}
                        sm
                        onClick={() => void handleToggleWishlist(featured.igdbId)}
                      >
                        <Icon name="star" size={11} fill={featured.wishlisted} />
                        {featured.wishlisted ? 'on wishlist' : '+ wishlist'}
                      </Btn>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* timeline */}
            {timelineItems.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <Marker>// release timeline</Marker>
                <div style={{ marginTop: 16, position: 'relative', height: 110 }}>
                  {timelineItems.map((e, i) => {
                    const x = maxDays > 0 ? Math.round((e.days / maxDays) * 85) + 5 : 50;
                    const labelTop = e.side === 'top';
                    return (
                      <div key={e.igdbId} style={{
                        position: 'absolute', left: `${x}%`,
                        top: labelTop ? 0 : '50%',
                        height: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        width: 100,
                      }}>
                        {labelTop && (
                          <div style={{ textAlign: 'center', marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--amber)', whiteSpace: 'nowrap' }}>
                              <Icon name="star" size={9} fill={true} style={{ marginRight: 3 }} />{e.title.split(':')[0]}
                            </div>
                            <div className="t-mono t-faint" style={{ fontSize: 9, marginTop: 1 }}>{e.parts.month} {e.parts.day}</div>
                          </div>
                        )}
                        <div style={{ flex: 1, width: 1, background: 'var(--amber)' }} />
                        {!labelTop && (
                          <div style={{ textAlign: 'center', marginTop: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--amber)', whiteSpace: 'nowrap' }}>
                              <Icon name="star" size={9} fill={true} style={{ marginRight: 3 }} />{e.title.split(':')[0]}
                            </div>
                            <div className="t-mono t-faint" style={{ fontSize: 9, marginTop: 1 }}>{e.parts.month} {e.parts.day}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--rule-bright)' }} />
                </div>
              </div>
            )}

            {/* this month list */}
            <div style={{ marginTop: 36 }}>
              <Marker>// upcoming · {items.length} tracked</Marker>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {items.slice(0, 4).map((g) => (
                  <div key={g.igdbId} style={{ display: 'grid', gridTemplateColumns: '60px 76px 1fr', gap: 14, padding: 14, border: '1px solid var(--rule)', background: 'var(--ink)' }}>
                    <div style={{ textAlign: 'center', borderRight: '1px dashed var(--rule-bright)', paddingRight: 8 }}>
                      <div className="t-up t-faint" style={{ fontSize: 9 }}>{g.parts.month}</div>
                      <div className="t-display" style={{ fontSize: 26, color: 'var(--amber)', lineHeight: 1, marginTop: 3 }}>{g.parts.day === '—' ? '?' : g.parts.day}</div>
                      <div className="t-mono t-faint" style={{ fontSize: 9, marginTop: 3 }}>{g.parts.dow}</div>
                    </div>
                    <Cover w={76} h={100} src={g.coverUrl} label={(g.title.split(' ')[0] ?? g.title).toUpperCase()} bright />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: 'var(--paper)', lineHeight: 1.15 }}>{g.title}</div>
                      <div className="t-mono t-faint" style={{ fontSize: 10, marginTop: 2 }}>{g.developer}</div>
                      <div className="t-faint" style={{ fontSize: 11, marginTop: 4 }}>{g.genres[0] ?? '—'}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {g.platforms.slice(0, 3).map(p => <Plat key={p} code={toPlatCode(p)} />)}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span
                          onClick={() => void handleToggleWishlist(g.igdbId)}
                          style={{ fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: g.wishlisted ? 'var(--amber)' : 'var(--paper-faint)' }}
                        >
                          <Icon name="star" size={10} fill={g.wishlisted} />
                          {g.wishlisted ? 'tracking' : '+ wishlist'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* right: agenda */}
          <div className="thin-scroll" style={{ overflow: 'auto' }}>
            <div style={{ padding: '18px 22px 6px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Marker>// agenda · all tracked</Marker>
              <span className="t-mono t-faint" style={{ fontSize: 10 }}>{items.length} items</span>
            </div>
            {items.map((g) => (
              <div key={g.igdbId} style={{
                display: 'grid',
                gridTemplateColumns: '52px 32px 1fr auto',
                gap: 12,
                padding: '14px 22px',
                borderBottom: '1px dotted var(--rule)',
                alignItems: 'center',
                background: 'rgba(212,160,23,0.04)',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="t-up t-faint" style={{ fontSize: 8 }}>{g.parts.month}</div>
                  <div className="t-display" style={{ fontSize: 20, color: 'var(--amber)', lineHeight: 1 }}>{g.parts.day === '—' ? '?' : g.parts.day}</div>
                </div>
                <Cover w={32} h={42} src={g.coverUrl} label={(g.title[0] ?? '').toUpperCase()} bright />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.1 }}>{g.title}</div>
                  <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>{g.developer} · {g.platStr}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="t-tnum" style={{ fontSize: 13, color: 'var(--amber)' }}>
                    {g.releaseDate ? `T-${g.days}d` : 'TBA'}
                  </div>
                  <div
                    style={{ marginTop: 2, cursor: 'pointer', color: g.wishlisted ? 'var(--amber)' : 'var(--paper-faint)' }}
                    onClick={() => void handleToggleWishlist(g.igdbId)}
                  >
                    <Icon name="star" size={10} fill={g.wishlisted} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
