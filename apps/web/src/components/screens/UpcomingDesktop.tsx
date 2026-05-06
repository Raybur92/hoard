import { useState } from 'react';
import { TopBar } from '../layout/TopBar';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Btn } from '../primitives/Btn';
import { Icon } from '../primitives/Icon';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useUpcoming, type UpcomingScope } from '../../hooks/useUpcoming';
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
  useDocumentTitle("Upcoming");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Three real scopes after PR B (D1):
  //   my-platforms — IGDB feed, hype-filtered, restricted to user's platforms
  //   all          — IGDB feed, hype-filtered, all platforms
  //   wishlist     — only games this user has starred (DB read, no hype filter)
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
  // null = show all months; click a month tab to filter (PR A — A9d).
  // Clicking the active month again toggles back to all.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const { data, loading, error, refetch } = useUpcoming(scope);
  // Honest wishlist count, regardless of which scope is active (PR B — D1).
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
        <TopBar crumbs={['hoard', 'upcoming']} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '32px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-xs)" }}>{`// failed to load upcoming releases`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", maxWidth: 480, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        <TopBar crumbs={['hoard', 'upcoming']} />
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="skel" style={{ height: 200 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ width: 80, height: 28 }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="skel" style={{ height: 52 }} />)}
          </div>
        </div>
      </>
    );
  }

  const items = data.map(enrichItem).sort((a, b) => a.days - b.days);

  // Empty state — no upcoming releases tracked at all (or none in scope).
  if (items.length === 0) {
    return (
      <>
        <TopBar crumbs={['hoard', 'upcoming']} />
        <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ flex: 1 }} />
          <div style={{ padding: '6px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Chip on={scope === 'wishlist'} onClick={() => setScope('wishlist')}><Icon name="star" size={11} /> wishlist · {wishlistCount}</Chip>
            <Chip on={scope === 'my-platforms'} onClick={() => setScope('my-platforms')}>my platforms</Chip>
            <Chip on={scope === 'all'} onClick={() => setScope('all')}>all releases</Chip>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
          <div className="panel" style={{ padding: 32, maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <Marker>// nothing on the horizon</Marker>
            <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
              {scope === 'wishlist'
                ? 'you haven\'t starred anything yet. switch to "all releases" and tap + on something that catches your eye.'
                : scope === 'my-platforms'
                ? 'no upcoming releases on your connected platforms. switch to "all releases" or wishlist a game from there.'
                : 'no upcoming releases match the current hype threshold. lower it in settings → appearance.'}
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {scope === 'all'
                ? <Btn variant="primary" onClick={() => navigate('/settings/appearance')}><Icon name="cog" size={11} /> tune hype threshold</Btn>
                : <Btn variant="primary" onClick={() => setScope('all')}>show all releases</Btn>}
            </div>
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
  const months = Object.entries(monthGroups);

  // PR A — A9d: month tabs are now interactive. null = show all months;
  // selecting a month filters the featured / timeline / agenda views to it.
  const visibleItems = selectedMonth
    ? items.filter(w => w.parts.month === selectedMonth)
    : items;

  const timelineItems = visibleItems
    .filter(w => w.releaseDate)
    .slice(0, 8)
    .map((w, i) => ({ ...w, side: i % 2 === 0 ? 'top' : 'bot' }));
  const maxDays = Math.max(...timelineItems.map(w => w.days), 1);
  const featuredVisible = visibleItems[0];

  return (
    <>
      <TopBar crumbs={['hoard', 'upcoming']} />

      {/* month tabs — clicking a month filters featured / timeline / agenda
          to that month. Click the active month again to clear. */}
        <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <button
            type="button"
            onClick={() => setSelectedMonth(null)}
            aria-pressed={selectedMonth === null}
            style={{
              padding: '8px 14px',
              fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", letterSpacing: '0.1em',
              color: selectedMonth === null ? 'var(--paper)' : 'var(--paper-faint)',
              borderBottom: selectedMonth === null ? '2px solid var(--amber)' : '2px solid transparent',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            all <span className="t-faint" style={{ fontSize: "var(--text-2xs)" }}>{items.length}</span>
          </button>
          {months.map(([m, n]) => {
            const active = selectedMonth === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonth(active ? null : m)}
                aria-pressed={active}
                style={{
                  padding: '8px 14px',
                  fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", letterSpacing: '0.1em',
                  color: active ? 'var(--paper)' : 'var(--paper-faint)',
                  borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
                  borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {m} <span className="t-faint" style={{ fontSize: "var(--text-2xs)" }}>{n}</span>
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <div style={{ padding: '6px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Chip on={scope === 'wishlist'} onClick={() => setScope('wishlist')}><Icon name="star" size={11} /> wishlist · {wishlistCount}</Chip>
            <Chip on={scope === 'my-platforms'} onClick={() => setScope('my-platforms')}>my platforms</Chip>
            <Chip on={scope === 'all'} onClick={() => setScope('all')}>all releases</Chip>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 460px', minHeight: 0 }}>

          {/* left: featured + timeline (uses visibleItems / featuredVisible
              when month filter is active — fall back to items when not). */}
          <div className="thin-scroll" style={{ overflow: 'auto', padding: '24px 32px 32px', borderRight: '1px solid var(--rule)' }}>

            {/* featured (uses month-filtered first item when a tab is active) */}
            {featuredVisible && (() => {
              const featured = featuredVisible;
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
                            <div className="t-mono t-dim" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>{featured.developer} · {featured.genres[0] ?? '—'}</div>
                          </div>
                        </div>
                      </div>
                      {cd && (
                        <div style={{ flex: '0 0 auto', display: 'flex', gap: 4 }}>
                          {([['d', cd.d], ['h', cd.h], ['m', cd.m], ['s', cd.s]] as [string, string][]).map(([k, v]) => (
                            <div key={k} style={{ background: 'var(--ink-2)', border: '1px solid var(--rule-bright)', padding: '6px 8px', textAlign: 'center', minWidth: 38 }}>
                              <div className="t-mono t-tnum" style={{ fontSize: "var(--text-md)", color: 'var(--amber)', lineHeight: 1 }}>{v}</div>
                              <div className="t-faint t-up" style={{ fontSize: "var(--text-3xs)", marginTop: 3 }}>{k.toUpperCase()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: "var(--text-xs)" }}>
                      <div><div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>release</div><div className="t-tnum" style={{ marginTop: 4, color: 'var(--paper)' }}>{featured.parts.full}</div></div>
                      <div><div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>day</div><div className="t-tnum" style={{ marginTop: 4 }}>{featured.parts.dow}</div></div>
                      <div>
                        <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>platforms</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                          {featured.platforms.map(p => <Plat key={p} code={toPlatCode(p)} lg />)}
                        </div>
                      </div>
                      <div><div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>genres</div><div style={{ marginTop: 4, fontSize: "var(--text-2xs)" }}>{featured.genres[0] ?? '—'}</div></div>
                    </div>
                    <div className="t-sans" style={{ marginTop: 16, fontSize: "var(--text-sm)", lineHeight: 1.5, color: 'var(--paper-dim)' }}>
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
                  {timelineItems.map((e) => {
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
                            <div style={{ fontSize: "var(--text-3xs)", color: 'var(--amber)', whiteSpace: 'nowrap' }}>
                              <Icon name="star" size={9} fill={true} style={{ marginRight: 3 }} />{e.title.split(':')[0]}
                            </div>
                            <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 1 }}>{e.parts.month} {e.parts.day}</div>
                          </div>
                        )}
                        <div style={{ flex: 1, width: 1, background: 'var(--amber)' }} />
                        {!labelTop && (
                          <div style={{ textAlign: 'center', marginTop: 4 }}>
                            <div style={{ fontSize: "var(--text-3xs)", color: 'var(--amber)', whiteSpace: 'nowrap' }}>
                              <Icon name="star" size={9} fill={true} style={{ marginRight: 3 }} />{e.title.split(':')[0]}
                            </div>
                            <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 1 }}>{e.parts.month} {e.parts.day}</div>
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
              <Marker>// upcoming · {visibleItems.length} tracked{selectedMonth ? ` · ${selectedMonth}` : ''}</Marker>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {visibleItems.slice(0, 4).map((g) => (
                  <div key={g.igdbId} style={{ display: 'grid', gridTemplateColumns: '60px 76px 1fr', gap: 14, padding: 14, border: '1px solid var(--rule)', background: 'var(--ink)' }}>
                    <div style={{ textAlign: 'center', borderRight: '1px dashed var(--rule-bright)', paddingRight: 8 }}>
                      <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>{g.parts.month}</div>
                      <div className="t-display" style={{ fontSize: 26, color: 'var(--amber)', lineHeight: 1, marginTop: 3 }}>{g.parts.day === '—' ? '?' : g.parts.day}</div>
                      <div className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 3 }}>{g.parts.dow}</div>
                    </div>
                    <Cover w={76} h={100} src={g.coverUrl} label={(g.title.split(' ')[0] ?? g.title).toUpperCase()} bright />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <div style={{ fontSize: "var(--text-base)", color: 'var(--paper)', lineHeight: 1.15 }}>{g.title}</div>
                        {g.category === 2 && <span className="chip" style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', borderColor: 'var(--rule-bright)' }}>DLC</span>}
                        {g.category === 8 && <span className="chip" style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', borderColor: 'var(--rule-bright)' }}>remake</span>}
                      </div>
                      <div className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2 }}>{g.developer}</div>
                      <div className="t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>{g.genres[0] ?? '—'}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {g.platforms.slice(0, 3).map(p => <Plat key={p} code={toPlatCode(p)} />)}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => void handleToggleWishlist(g.igdbId)}
                          aria-pressed={g.wishlisted}
                          aria-label={g.wishlisted ? `Stop tracking ${g.title}` : `Add ${g.title} to wishlist`}
                          style={{ fontSize: "var(--text-2xs)", cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: g.wishlisted ? 'var(--amber)' : 'var(--paper-dim)', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit' }}
                        >
                          <Icon name="star" size={10} fill={g.wishlisted} />
                          {g.wishlisted ? 'tracking' : '+ wishlist'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* right: agenda (filtered to selected month when active) */}
          <div className="thin-scroll" style={{ overflow: 'auto' }}>
            <div style={{ padding: '18px 22px 6px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Marker>// agenda · {selectedMonth ?? 'all'}</Marker>
              <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)" }}>{visibleItems.length} items</span>
            </div>
            {visibleItems.map((g) => (
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
                  <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>{g.parts.month}</div>
                  <div className="t-display" style={{ fontSize: 20, color: 'var(--amber)', lineHeight: 1 }}>{g.parts.day === '—' ? '?' : g.parts.day}</div>
                </div>
                <Cover w={32} h={42} src={g.coverUrl} label={(g.title[0] ?? '').toUpperCase()} bright />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-xs)", lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span>{g.title}</span>
                    {g.category === 2 && <span style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>DLC</span>}
                    {g.category === 8 && <span style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>remake</span>}
                  </div>
                  <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2 }}>{g.developer} · {g.platStr}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="t-tnum" style={{ fontSize: "var(--text-sm)", color: 'var(--amber)' }}>
                    {g.releaseDate ? `T-${g.days}d` : 'TBA'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleWishlist(g.igdbId)}
                    aria-pressed={g.wishlisted}
                    aria-label={g.wishlisted ? `Stop tracking ${g.title}` : `Add ${g.title} to wishlist`}
                    style={{ marginTop: 2, cursor: 'pointer', color: g.wishlisted ? 'var(--amber)' : 'var(--paper-dim)', background: 'transparent', border: 'none', padding: 4, margin: -4 }}
                  >
                    <Icon name="star" size={10} fill={g.wishlisted} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
    </>
  );
}
