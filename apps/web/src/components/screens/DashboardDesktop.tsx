import { useState, useMemo, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { AlertsStrip } from './dashboard/AlertsStrip';
import { NextReleaseCountdown } from './dashboard/NextReleaseCountdown';
import { PeriodToggle } from './dashboard/PeriodToggle';
import { useDashboard } from '../../hooks/useDashboard';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { minutesToHours, formatRelative, shortYear, buildAsciiBar } from '../../lib/utils';
import type { DashboardPeriod, DashboardResponse, UserGameDetail, PlatformStat } from '@hoard/types';

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

function asciiChart(platforms: PlatformStat[]): string {
  return platforms.map(p => {
    const bar = buildAsciiBar(p.pct, 32);
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

/** Bento card wrapper — applies the panel styling + grid-column span.
 *  Span is a 1–12 integer matching CSS grid columns.
 *  data-bento-span on the root element makes the layout introspectable in tests. */
function BentoCard({
  span,
  children,
  style,
  testId,
}: {
  span: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  testId?: string;
}) {
  return (
    <div
      className="panel"
      data-bento-span={span}
      data-testid={testId}
      style={{ gridColumn: `span ${span}`, padding: 20, display: 'flex', flexDirection: 'column', ...style }}
    >
      {children}
    </div>
  );
}

export function DashboardDesktop() {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  // DASH-PR2 — period state for the combined progress card. Changing it
  // refetches dashboard data via a different cache key. The lastGoodRef
  // below keeps the previous period's data visible while the new one
  // loads, so the toggle feels instant + the bento doesn't flash back
  // to the loading skeleton on every chip click.
  const [period, setPeriod] = useState<DashboardPeriod>('all');
  // B-IGDB-3 — active dimension on the breakdown card (genre · theme ·
  // perspective). Local state; per OQ-DASH-7 may persist to URL in a
  // follow-up if cohort signal demands.
  const [breakdownTab, setBreakdownTab] = useState<'genre' | 'theme' | 'perspective'>('genre');
  const { data, loading, error, refetch } = useDashboard(period);
  const lastGoodRef = useRef<DashboardResponse | null>(null);
  if (data) lastGoodRef.current = data;
  const user = useCurrentUser();
  const [pickIdx, setPickIdx] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const platformChart = useMemo(
    () => (data ? asciiChart(data.stats.playtimeByPlatform) : ''),
    [data],
  );

  // Modal element rendered at a stable position across all return branches —
  // see LibraryDesktop's matching comment.
  const modalElement = showAddModal && (
    <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { refetch(); }} />
  );

  // DASH-PR2 — once we have ANY dashboard payload, render with it. The
  // loading skeleton only fires on cold start. Period switches (which
  // change the cache key and momentarily set data=undefined) fall back
  // to the previous payload via lastGoodRef.
  const resolvedData = data ?? lastGoodRef.current;

  if ((loading && !resolvedData) || error || !resolvedData) {
    return (
      <>
        {modalElement}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
                <div className="skel" style={{ gridColumn: 'span 6', height: 220 }} />
                <div className="skel" style={{ gridColumn: 'span 3', height: 220 }} />
                <div className="skel" style={{ gridColumn: 'span 4', height: 140 }} />
                <div className="skel" style={{ gridColumn: 'span 4', height: 140 }} />
                <div className="skel" style={{ gridColumn: 'span 4', height: 140 }} />
              </div>
            </div>
        }
      </>
    );
  }

  // `activity` is required in the new DashboardResponse, but old cached
  // payloads (SW or in-memory) from before F14 may not have it — fall back.
  const { stats, nowPlaying, wishlistCountdown, backlogPick, backlogItems, platforms, activity = { weeks: 24, cells: [] }, wishlistDealsCount = 0 } = resolvedData;
  // B-IGDB-3 — defensive fallback for the new IGDB-tag triple fields.
  // Old cached payloads (Service Worker / in-memory SWR) from before the
  // partial PR don't carry these; without the fallback, the breakdown card
  // throws `undefined is not an object (evaluating 'stats.themes.length')`
  // until the SW cache rotates. Matches the `activity` fallback above.
  const breakdownThemes = stats.themes ?? [];
  const breakdownPerspectives = stats.playerPerspectives ?? [];
  const np = nowPlaying[0] ?? null;
  const rotation = nowPlaying.slice(1);
  const nextRelease = wishlistCountdown[0] ?? null;

  // First-run / empty state: zero games owned.
  if (stats.totalGames === 0) {
    return (
      <>
        {modalElement}
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
      {modalElement}
      <TopBar
        crumbs={['hoard', 'dashboard']}
        syncedAt={platforms[0]?.lastSyncAt ? `synced ${formatRelative(platforms[0].lastSyncAt)}` : null}
      />

      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 32px' }}>

        {/* greeting + bignum + system status header — preserved above bento per
            DASH-PR1 plan (terminal-aesthetic-y personal touch). Cards below
            communicate via span; this header sets identity + page context. */}
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
                <Fragment key={p.code}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Plat code={p.code} />
                    <span className="t-dim">{PLATFORM_NAMES[p.code] ?? p.code}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--paper-dim)' }}>
                    <span>{p.lastSyncAt ? `synced ${formatRelative(p.lastSyncAt)}` : 'never synced'}</span>
                    <span style={{ color: p.syncStatus === 'ok' ? 'var(--green)' : p.syncStatus === 'stale' ? 'var(--amber)' : 'var(--red)' }}>
                      {p.syncStatus}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 24 }} />

        {/* Bento grid — 12-col CSS grid per PAGES_PLAN §7.4 (DASH-PR1).
            Cards declare their span via grid-column on each child. The slim
            alerts strip (span-12) lands in DASH-PR3 — surfaces sync-error
            states today; Q-series / EV-PR3 / Deals workstreams thread
            additional chips into the same AlertsStrip component later.
            Progressive-disclosure: absent cards don't render; grid reflows. */}
        <div
          data-testid="bento-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16, alignItems: 'stretch' }}
        >

          {/* Slim alerts strip — span-12 at top. Returns null when no alerts
              are active; grid reflows naturally so row 1 starts immediately. */}
          <AlertsStrip platforms={platforms} wishlistDealsCount={wishlistDealsCount} />

          {/* Row 1 — now playing (span-6) + next release countdown (span-3) +
              <empty 3-col tail for the next-event slot that EV-PR1 will fill> */}
          {np && (
            <BentoCard span={6} testId="card-now-playing" style={{ padding: 0 }}>
              <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '120px 1fr', gap: 22 }}>
                <Cover
                  w={120} h={160}
                  src={np.game.coverUrl}
                  label={(np.game.title.split(' ')[0] ?? '').toUpperCase()}
                  dev={np.game.developer?.split(' ')[0] ?? '—'}
                  year={shortYear(np.game.releaseYear)}
                  bright
                />
                <div>
                  <Marker>// now playing · resumed {np.lastPlayedAt ? formatRelative(np.lastPlayedAt) : '—'}</Marker>
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
                      game detail with ?focus=notes. GD-PR3 will add inline
                      [+min] [done] [+note] affordances directly on this card
                      (manual-platform-only per F1-PR5 lock); deferred from
                      DASH-PR1 per §7.4 matrix. */}
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

              {/* Active rotation sub-section — shows other Playing games when
                  nowPlaying has more than one entry. Per §7.4 ASCII mockup:
                  compact rows below the primary hero. The API returns up to
                  3 Playing games sorted by lastPlayedAt desc; we render
                  [1] and [2] as compact rows. */}
              {rotation.length > 0 && (
                <div style={{ borderTop: '1px solid var(--rule)', padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Marker>// active rotation · playing × {nowPlaying.length}</Marker>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rotation.map((g) => {
                      const mins = Object.values(g.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => navigate(`/game/${g.id}`)}
                          aria-label={`Open ${g.game.title}`}
                          style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '4px 0', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                        >
                          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {g.game.title}
                          </span>
                          <span className="t-tnum t-dim" style={{ fontSize: 'var(--text-2xs)' }}>{minutesToHours(mins)}</span>
                          <span className="t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
                            {g.lastPlayedAt ? formatRelative(g.lastPlayedAt) : '—'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </BentoCard>
          )}

          {nextRelease && (
            <div data-testid="card-next-release" style={{ gridColumn: 'span 3' }}>
              <NextReleaseCountdown release={nextRelease} />
            </div>
          )}

          {/* Row 2 — three span-4 stat cards: backlog picker · completion · achievements */}
          {displayPick && (
            <BentoCard span={4} testId="card-backlog-picker">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <Marker>// play next · backlog pick</Marker>
                <Btn sm onClick={shufflePick}>shuffle</Btn>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/game/${displayPick.id}`)}
                aria-label={`Open ${displayPick.game.title}`}
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
              >
                <Cover w={48} h={64} src={displayPick.game.coverUrl} label={(displayPick.game.title.split(' ')[0] ?? '').toUpperCase()} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "var(--text-sm)", color: 'var(--paper)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayPick.game.title}</div>
                  <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 3 }}>
                    {displayPick.game.developer} · {displayPick.game.releaseYear}
                  </div>
                  {displayPick.hltb?.mainStory && (
                    <div style={{ fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', marginTop: 3 }}>
                      HLTB ~{Math.round(displayPick.hltb.mainStory / 60)}h
                    </div>
                  )}
                </div>
              </button>
            </BentoCard>
          )}

          {/* DASH-PR2 — combined progress card. Completion + achievements
              share the same period scope (spec §7.4: "toggle shared between
              completion + achievements"), so the v1-era split into two cards
              was visual redundancy. One card, one toggle, two metrics inside.
              When achievements data is absent for the active period, the
              right half is hidden and completion takes the full width.

              `loadingNewPeriod` = the user just clicked a chip and the new
              period's data hasn't arrived yet; we're showing stale numbers
              from `lastGoodRef`. Dim the figures so the user sees that
              something is happening (Andrea's eyeball feedback — without
              this cue, the click feels like nothing changed). */}
          <BentoCard span={8} testId="card-progress">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
              <Marker>// progress</Marker>
              <PeriodToggle value={period} onChange={setPeriod} compact />
            </div>

            {(() => {
              const loadingNewPeriod = loading && !data;
              return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: stats.periodStats.achievementsRollup ? '1fr 1px 1fr' : '1fr',
              gap: stats.periodStats.achievementsRollup ? 24 : 0,
              alignItems: 'start',
              opacity: loadingNewPeriod ? 0.45 : 1,
              transition: 'opacity 120ms ease',
            }}>
              <div data-testid="progress-completion">
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 8 }}>completed</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="t-mono t-tnum" style={{ fontSize: 'var(--text-xl)', color: 'var(--green)', lineHeight: 1 }}>
                    {stats.periodStats.completionPct}%
                  </span>
                  <span className="t-tnum t-dim" style={{ fontSize: 'var(--text-2xs)' }}>
                    {stats.periodStats.completedCount} / {stats.periodStats.totalGames}
                  </span>
                </div>
                <Gauge total={20} filled={Math.round((stats.periodStats.completedCount / Math.max(stats.periodStats.totalGames, 1)) * 20)} />
              </div>

              {stats.periodStats.achievementsRollup && (
                <>
                  {/* Vertical divider mirrors the .panel hairline aesthetic. */}
                  <div style={{ background: 'var(--rule)', alignSelf: 'stretch', minHeight: 56 }} />
                  <div data-testid="progress-achievements">
                    <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 8 }}>achievements</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span
                        className="t-mono t-tnum"
                        style={{ fontSize: 'var(--text-xl)', lineHeight: 1, color: stats.periodStats.achievementsRollup.percent >= 80 ? 'var(--green)' : 'var(--paper)' }}
                      >
                        {stats.periodStats.achievementsRollup.percent}%
                      </span>
                      <span className="t-tnum t-dim" style={{ fontSize: 'var(--text-2xs)' }}>
                        {stats.periodStats.achievementsRollup.earned.toLocaleString('en')} / {stats.periodStats.achievementsRollup.total.toLocaleString('en')}
                      </span>
                    </div>
                    <Gauge total={20} filled={Math.round((stats.periodStats.achievementsRollup.percent / 100) * 20)} />
                  </div>
                </>
              )}
            </div>
              );
            })()}
          </BentoCard>

          {/* Row 3 — IGDB-tag triple breakdown (span-6) + hours by platform
              (span-6). Hours-by-platform sits in the slot the spec reserves
              for the year-in-review wrap-up (OQ-DASH-9 future workstream).

              B-IGDB-3 — breakdown is now a 3-tab strip across genre · theme
              · perspective. Hoard keeps the three IGDB axes as separate
              dimensions per PAGES_PLAN §4.4.1; the tab strip surfaces all
              three from the same card without competing for grid space. */}
          {(stats.genres.length + breakdownThemes.length + breakdownPerspectives.length) > 0 && (
            <BentoCard span={6} testId="card-breakdown">
              {(() => {
                const series = breakdownTab === 'theme'
                  ? breakdownThemes
                  : breakdownTab === 'perspective'
                    ? breakdownPerspectives
                    : stats.genres;
                const tabs: { id: typeof breakdownTab; label: string; available: boolean }[] = [
                  { id: 'genre', label: 'genre', available: stats.genres.length > 0 },
                  { id: 'theme', label: 'theme', available: breakdownThemes.length > 0 },
                  { id: 'perspective', label: 'perspective', available: breakdownPerspectives.length > 0 },
                ];
                const maxCount = series[0]?.count ?? 1;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <Marker>// top {breakdownTab === 'perspective' ? 'perspectives' : `${breakdownTab}s`}</Marker>
                      <div role="tablist" aria-label="Breakdown dimension" style={{ display: 'inline-flex', gap: 4 }}>
                        {tabs.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={breakdownTab === t.id}
                            disabled={!t.available}
                            onClick={() => { if (t.available && breakdownTab !== t.id) setBreakdownTab(t.id); }}
                            className={breakdownTab === t.id ? 'chip solid amber' : 'chip'}
                            style={{
                              height: 22,
                              padding: '0 8px',
                              fontSize: 'var(--text-3xs)',
                              letterSpacing: '0.04em',
                              opacity: t.available ? 1 : 0.35,
                              cursor: t.available && breakdownTab !== t.id ? 'pointer' : 'default',
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      {series.length === 0 ? (
                        <div className="t-mono t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
                          no {breakdownTab === 'perspective' ? 'perspective' : breakdownTab} data yet — pre-B-IGDB-3 syncs didn't capture this. New syncs + the one-time backfill populate it.
                        </div>
                      ) : (
                        series.map(({ name, count }, i) => (
                          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 'var(--text-xs)' }}>
                            <span style={{ width: 130, color: i === 0 ? 'var(--paper)' : 'var(--paper-dim)' }}>{name}</span>
                            <div style={{ flex: 1, height: 3, background: 'var(--ink-2)', position: 'relative' }}>
                              <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: 'var(--paper-dim)' }} />
                            </div>
                            <span className="t-tnum t-faint" style={{ fontSize: 'var(--text-2xs)', width: 28, textAlign: 'right' }}>{count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </BentoCard>
          )}

          {stats.playtimeByPlatform.length > 0 && (
            <BentoCard span={6} testId="card-platforms">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Marker>// hours by platform · all-time</Marker>
                <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)" }}>
                  {(stats.totalPlaytimeMinutes / 60).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h total
                </span>
              </div>
              <pre className="ascii t-dim" style={{ marginTop: 12, fontSize: "var(--text-xs)", lineHeight: 1.55 }}>
                {platformChart}
              </pre>
            </BentoCard>
          )}

          {/* Row 4 — activity heatmap (span-12 full-width temporal strip) */}
          <BentoCard span={12} testId="card-heatmap">
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
          </BentoCard>
        </div>
      </div>
    </>
  );
}
