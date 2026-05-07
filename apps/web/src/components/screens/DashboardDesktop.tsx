import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { TopBar } from '../layout/TopBar';
import { AddGameModal } from './AddGameModal';
import { Marker } from '../primitives/Marker';
import { Plat } from '../primitives/Plat';
import { Cover } from '../primitives/Cover';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Heatmap } from '../primitives/Heatmap';
import { Gauge } from '../primitives/Gauge';
import { useDashboard } from '../../hooks/useDashboard';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { minutesToHours, formatRelative, daysUntil, formatReleaseDate, shortYear, buildAsciiBar } from '../../lib/utils';
import type { UserGameDetail, PlatformStat, WishlistRelease } from '@hoard/types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'good night';
  if (h < 12) return 'good morning';
  if (h < 17) return 'good afternoon';
  return 'good evening';
}

const PLATFORM_NAMES: Record<string, string> = {
  ST: 'STEAM', PS: 'PSN', XB: 'XBOX', GG: 'GOG', NT: 'NINTENDO', EP: 'EPIC',
};

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

function asciiChart(platforms: PlatformStat[]): string {
  return platforms.map(p => {
    const bar = buildAsciiBar(p.pct, 40);
    const label = (PLATFORM_NAMES[p.code] ?? p.code).padEnd(5);
    const hours = (p.minutes / 60).toFixed(1).padStart(7);
    const pct = `${p.pct.toFixed(1)}%`.padStart(6);
    return `${label}  ${bar}  ${hours} h  ${pct}`;
  }).join('\n');
}

function nowPlayingTitle(title: string) {
  const idx = title.indexOf(': ');
  if (idx === -1) return <span>{title}</span>;
  return (
    <span>
      {title.slice(0, idx + 2)}
      <span style={{ color: 'var(--paper-dim)' }}>{title.slice(idx + 2)}</span>
    </span>
  );
}

export function DashboardDesktop() {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useDashboard();
  const user = useCurrentUser();
  const [pickIdx, setPickIdx] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const platformChart = useMemo(
    () => (data ? asciiChart(data.stats.playtimeByPlatform) : ''),
    [data],
  );

  if (loading || error || !data) {
    return (
      <>
        <TopBar crumbs={['hoard', 'dashboard']} />
        {error
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14 }}>
              <span className="t-mono t-red" style={{ fontSize: "var(--text-xs)" }}>{`// failed to load dashboard`}</span>
              <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", maxWidth: 480, textAlign: 'center' }}>{error}</span>
              <Btn sm onClick={() => refetch()}>retry</Btn>
            </div>
          : <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="skel" style={{ width: 160, height: 12 }} />
                  <div className="skel" style={{ width: 80, height: 48 }} />
                  <div className="skel" style={{ width: 220, height: 12 }} />
                </div>
                <div className="skel" style={{ height: 96 }} />
              </div>
              <div className="skel" style={{ height: 140 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="skel" style={{ height: 220 }} />
                <div className="skel" style={{ height: 220 }} />
              </div>
            </div>
        }
      </>
    );
  }

  // `activity` is required in the new DashboardResponse, but old cached
  // payloads (SW or in-memory) from before F14 may not have it — fall back.
  const { stats, nowPlaying, wishlistCountdown, backlogPick, backlogItems, platforms, activity = { weeks: 24, cells: [] } } = data;
  const np = nowPlaying[0] ?? null;

  // First-run / empty state: zero games owned. Replace the full dashboard
  // with an onboarding panel instead of rendering empty stats.
  if (stats.totalGames === 0) {
    return (
      <>
        <TopBar crumbs={['hoard', 'dashboard']} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <div className="panel" style={{ padding: 40, maxWidth: 520, width: '100%', textAlign: 'center' }}>
            <Marker>// nothing here yet</Marker>
            <h2 className="t-display" style={{ fontSize: "var(--text-xl)", margin: '14px 0 0', color: 'var(--paper)', fontWeight: 'normal' }}>your hoard is empty</h2>
            <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
              connect a gaming account to sync your library, or add a game manually if you want to start curating by hand.
            </p>
            <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn variant="primary" onClick={() => navigate('/settings/platforms')}>
                <Icon name="link" size={11} /> connect a platform
              </Btn>
              <Btn onClick={() => setShowAddModal(true)}>
                <Icon name="plus" size={11} /> add a game
              </Btn>
            </div>
          </div>
        </div>
        {showAddModal && (
          <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { refetch(); setShowAddModal(false); }} />
        )}
      </>
    );
  }

  const backlogPool: UserGameDetail[] = backlogItems.length > 0 ? backlogItems : [];
  const displayPick: UserGameDetail | null = backlogPool[pickIdx] ?? backlogPick;

  function shufflePick() {
    if (backlogPool.length === 0) return;
    setPickIdx(Math.floor(Math.random() * backlogPool.length));
  }

  const npTotalMins = np
    ? Object.values(np.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0)
    : 0;
  const npHltbMain = np?.hltb?.mainStory
    ? `~${Math.round(np.hltb.mainStory / 60)}h`
    : '—';
  const npPlatforms = np
    ? Object.entries(np.playtimeByPlatform).map(([code, mins]) => ({
        code,
        label: (PLATFORM_NAMES[code] ?? code).toLowerCase(),
        h: minutesToHours(mins ?? 0),
      }))
    : [];

  return (
    <>
      <TopBar
        crumbs={['hoard', 'dashboard']}
        syncedAt={platforms[0]?.lastSyncAt ? `synced ${formatRelative(platforms[0].lastSyncAt)}` : null}
      />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 32px' }}>

          {/* hero row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'end' }}>
            <div>
              <Marker>// {greeting()}, {(user?.name ?? user?.email?.split('@')[0] ?? 'hoard').toLowerCase()} · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toLowerCase()}</Marker>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 16 }}>
                <span className="bignum">{stats.totalGames}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>games owned</span>
                  <span className="t-mono t-dim" style={{ fontSize: "var(--text-xs)" }}>+{stats.weeklyAdded} this week</span>
                </div>
              </div>
              <div style={{ marginTop: 6, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", fontFamily: 'var(--mono)' }}>
                <span className="t-green">$</span>{' '}
                {(stats.totalPlaytimeMinutes / 60).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hours played
                &nbsp;·&nbsp;{stats.completionPct}% completed
              </div>
            </div>
            <div className="panel" style={{ padding: '14px 18px' }}>
              <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>system</div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', fontSize: "var(--text-xs)" }}>
                {platforms.map(p => (
                  <>
                    <div key={`${p.code}-l`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Plat code={p.code} />
                      <span className="t-dim">{PLATFORM_NAMES[p.code] ?? p.code}</span>
                    </div>
                    <div key={`${p.code}-r`} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--paper-dim)' }}>
                      <span>{p.lastSyncAt ? `synced ${formatRelative(p.lastSyncAt)}` : 'never synced'}</span>
                      <span style={{ color: p.syncStatus === 'ok' ? 'var(--green)' : p.syncStatus === 'stale' ? 'var(--amber)' : 'var(--red)' }}>
                        {p.syncStatus}
                      </span>
                    </div>
                  </>
                ))}
              </div>
            </div>
          </div>

          <div style={{ height: 28 }} />

          {/* main stats block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>

            {/* left col */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* now playing */}
              {np && (
                <div className="panel" style={{ padding: 20, display: 'grid', gridTemplateColumns: '120px 1fr', gap: 22 }}>
                  <Cover
                    w={120} h={160}
                    src={np.game.coverUrl}
                    label={(np.game.title.split(' ')[0] ?? '').toUpperCase()}
                    dev={np.game.developer?.split(' ')[0] ?? '—'}
                    year={shortYear(np.game.releaseYear)}
                    bright
                  />
                  <div>
                    <Marker>// session active · resumed {np.lastPlayedAt ? formatRelative(np.lastPlayedAt) : '—'}</Marker>
                    <div style={{ marginTop: 10, fontSize: "var(--text-xl)", lineHeight: 1.05, color: 'var(--paper)', letterSpacing: '-0.01em', fontWeight: 500 }}>
                      {nowPlayingTitle(np.game.title)}
                    </div>
                    <div className="t-mono t-dim" style={{ fontSize: "var(--text-xs)", marginTop: 4 }}>
                      {np.game.developer} · {np.game.releaseYear} · {np.game.genres[0] ?? '—'}
                    </div>

                    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: '4px 28px', fontSize: "var(--text-xs)" }}>
                      <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>played</span>
                      <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>est. main</span>
                      <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>progress</span>
                      <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>last save</span>
                      <span className="t-tnum" style={{ color: 'var(--paper)' }}>{minutesToHours(npTotalMins)}</span>
                      <span className="t-tnum t-dim">{npHltbMain}</span>
                      <span className="t-tnum t-green">—</span>
                      <span className="t-tnum t-dim">{np.lastPlayedAt ? formatRelative(np.lastPlayedAt) : '—'}</span>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div className="prog green"><span style={{ width: '0%' }} /></div>
                    </div>

                    {/* PR A — A9b: `resume` opens game detail; `+ note` opens
                        game detail with ?focus=notes (the page handler scrolls
                        to + opens the notes textarea). `log session` was deleted —
                        no v1 model for time logging. */}
                    <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Btn variant="primary" onClick={() => navigate(`/game/${np.id}`)}>
                        <Icon name="play" size={11} fill={true} /> resume
                      </Btn>
                      <Btn onClick={() => navigate(`/game/${np.id}?focus=notes`)}>+ note</Btn>
                      <span style={{ flex: 1 }} />
                      {npPlatforms.map(({ code, label, h }) => (
                        <span key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Plat code={code} lg />
                          <span className="t-faint" style={{ fontSize: "var(--text-2xs)" }}>{label} · {h}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* hours by platform */}
              <div className="panel" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Marker>// hours by platform · all-time</Marker>
                  <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)" }}>
                    {(stats.totalPlaytimeMinutes / 60).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h total
                  </span>
                </div>
                <pre className="ascii t-dim" style={{ marginTop: 12, fontSize: "var(--text-xs)", lineHeight: 1.55 }}>
                  {platformChart}
                </pre>
              </div>

              {/* heatmap */}
              <div className="panel" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                  <Marker>// games last-played · 24 wk</Marker>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: "var(--text-3xs)", color: 'var(--paper-dim)' }}>
                    <span>less</span>
                    <div className="heat-cell" /><div className="heat-cell l1" /><div className="heat-cell l2" />
                    <div className="heat-cell l3" /><div className="heat-cell l4" /><div className="heat-cell l5" />
                    <span>more</span>
                  </div>
                </div>
                <Heatmap weeks={activity.weeks} days={7} cells={activity.cells} />
              </div>
            </div>

            {/* right col: stat grid */}
            <div className="panel" style={{ padding: 20 }}>
              <Marker>// the hoard · in numbers</Marker>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
                {([
                  [String(stats.totalGames),     'TOTAL OWNED', `+${stats.weeklyAdded} wk`,           'dim'],
                  [String(stats.completedCount),  'COMPLETED',   `${stats.completionPct}%`,             'green'],
                  [String(stats.playingCount),    'PLAYING',     'active',                              'green'],
                  [String(stats.backlogCount),    'BACKLOG',     `${Math.round((stats.backlogCount / (stats.totalGames || 1)) * 100)}%`, 'amber'],
                  [String(stats.onHoldCount),     'ON HOLD',     'paused',                              null],
                  [String(stats.droppedCount),    'DROPPED',     'sunk',                                'red'],
                  [String(stats.wishlistCount),   'WISHLIST',    `${wishlistCountdown.length} soon`,    'amber'],
                  [`${(stats.totalPlaytimeMinutes / 60).toFixed(0)}h`, 'TOTAL PLAYED', 'all-time',     'dim'],
                ] as [string, string, string, string | null][]).map(([v, k, sub, tone], i) => (
                  <div key={i} style={{ background: 'var(--ink)', padding: '16px 16px 14px' }}>
                    <div className="t-mono t-tnum" style={{ fontSize: "var(--text-xl)", fontWeight: 500, lineHeight: 1, color: tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--paper)' }}>{v}</div>
                    <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 8 }}>{k}</div>
                    <div className="t-mono" style={{ fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* completion gauge */}
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>completion ratio</span>
                  <span className="t-tnum" style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)' }}>{stats.completedCount} / {stats.totalGames}</span>
                </div>
                <Gauge total={20} filled={Math.round((stats.completedCount / Math.max(stats.totalGames, 1)) * 20)} />
              </div>

              {/* T6 — library-wide trophy/achievement rollup. Hidden when no
                  achievement data exists yet (no PSN sync run, every Steam
                  profile private, etc.). Same Gauge style as the completion
                  ratio above for visual symmetry. */}
              {stats.achievementsRollup && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>achievements</span>
                    <span className="t-tnum" style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)' }}>
                      {stats.achievementsRollup.earned.toLocaleString('en')} / {stats.achievementsRollup.total.toLocaleString('en')}
                      {' · '}
                      <span style={{ color: stats.achievementsRollup.percent >= 80 ? 'var(--green)' : 'var(--paper-dim)' }}>
                        {stats.achievementsRollup.percent}%
                      </span>
                    </span>
                  </div>
                  <Gauge total={20} filled={Math.round((stats.achievementsRollup.percent / 100) * 20)} />
                </div>
              )}

              {/* genre breakdown */}
              {stats.genres.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="t-up t-faint" style={{ fontSize: "var(--text-3xs)", marginBottom: 8 }}>top genres</div>
                  {(() => {
                    const maxCount = stats.genres[0]?.count ?? 1;
                    return stats.genres.map(({ name, count }, i) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: "var(--text-xs)" }}>
                        <span style={{ width: 130, color: i === 0 ? 'var(--paper)' : 'var(--paper-dim)' }}>{name}</span>
                        <div style={{ flex: 1, height: 3, background: 'var(--ink-2)', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: 'var(--paper-dim)' }} />
                        </div>
                        <span className="t-tnum t-faint" style={{ fontSize: "var(--text-2xs)", width: 28, textAlign: 'right' }}>{count}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* backlog picker */}
              {displayPick && (
                <div style={{ marginTop: 20, borderTop: '1px dashed var(--rule-bright)', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Marker>// play next · backlog pick</Marker>
                    <Btn sm onClick={shufflePick}>shuffle</Btn>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Cover w={40} h={54} src={displayPick.game.coverUrl} label={(displayPick.game.title.split(' ')[0] ?? '').toUpperCase()} />
                    <div>
                      <div style={{ fontSize: "var(--text-sm)", color: 'var(--paper)', lineHeight: 1.2 }}>{displayPick.game.title}</div>
                      <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 3 }}>
                        {displayPick.game.developer} · {displayPick.game.releaseYear}
                      </div>
                      <div style={{ fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', marginTop: 3 }}>
                        {displayPick.hltb?.mainStory
                          ? <span>HLTB ~{Math.round(displayPick.hltb.mainStory / 60)}h</span>
                          : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* wishlist dropping soon */}
          {wishlistCountdown.length > 0 && (
            <>
              <div style={{ height: 28 }} />
              <div className="panel" style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <Marker>// wishlist · dropping soon</Marker>
                    <div className="t-display" style={{ fontSize: "var(--text-lg)", color: 'var(--paper)', marginTop: 6, letterSpacing: '0.04em' }}>
                      {wishlistCountdown.length} incoming{' '}
                      <span className="t-amber" style={{ display: 'inline-flex', verticalAlign: '-0.1em' }}>
                        <Icon name="star" size={18} fill={true} />
                      </span>
                    </div>
                  </div>
                  <Link
                    to="/upcoming"
                    className="t-faint"
                    style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--paper-dim)' }}
                  >
                    see full upcoming feed <Icon name="arrowR" size={11} />
                  </Link>
                </div>
                <WishlistCountdown items={wishlistCountdown} />
              </div>
            </>
          )}
        </div>
    </>
  );
}

function WishlistCountdown({ items }: { items: WishlistRelease[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 16 }}>
      {items.map((w, i) => {
        const days = daysUntil(w.releaseDate);
        const urgent = days < 30;
        const platCodes = w.platforms.map(toPlatCode);
        return (
          <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Cover w="100%" h={170} src={w.coverUrl} label={w.title.toUpperCase()} dev={w.developer ?? '—'} bright={urgent} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="t-tnum" style={{ fontSize: "var(--text-2xs)", color: urgent ? 'var(--amber)' : 'var(--paper-dim)' }}>
                {formatReleaseDate(w.releaseDate)}
              </span>
              <span className="t-tnum t-faint" style={{ fontSize: "var(--text-3xs)" }}>
                {w.releaseDate ? `T-${days}` : 'TBA'}
              </span>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: 'var(--paper)', lineHeight: 1.2 }}>{w.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {platCodes.map(code => <Plat key={code} code={code} />)}
              </div>
              <span className="t-amber" style={{ fontSize: "var(--text-xs)", display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={11} fill={true} /> tracking
              </span>
            </div>
            <div className="gauge" style={{ marginTop: 2 }}>
              {Array.from({ length: 12 }).map((_, k) => (
                <div key={k} className={`seg${k < (items.length - i) ? ' amber' : ''}`} style={{ height: 4 }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
