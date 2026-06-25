import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Icon } from '../primitives/Icon';
import { Hr } from '../primitives/Hr';
import { Heatmap } from '../primitives/Heatmap';
import { Btn } from '../primitives/Btn';
import { Gauge } from '../primitives/Gauge';
import { AlertsStrip } from './dashboard/AlertsStrip';
import { NextReleaseCountdown } from './dashboard/NextReleaseCountdown';
import { NextEventCountdown } from './dashboard/NextEventCountdown';
import { PeriodToggle } from './dashboard/PeriodToggle';
import { useDashboard } from '../../hooks/useDashboard';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { PullableScroll } from '../primitives/PullableScroll';
import { minutesToHours, formatRelative, buildAsciiBar } from '../../lib/utils';
import type { DashboardPeriod, DashboardResponse, PlatformStat, UserGameDetail } from '@hoard/types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const PLATFORM_NAMES: Record<string, string> = {
  ST: 'STEAM', PS: 'PSN', XB: 'XBOX', GG: 'GOG', NT: 'NINT', EP: 'EPIC',
};

function asciiChart(platforms: PlatformStat[]): string {
  return platforms.map(p => {
    const bar = buildAsciiBar(p.pct, 20);
    const label = (PLATFORM_NAMES[p.code] ?? p.code).slice(0, 5).padEnd(5);
    const hours = Math.round(p.minutes / 60).toString().padStart(4);
    return `${label} ${bar} ${hours}`;
  }).join('\n');
}

export function DashboardMobile() {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  // DASH-PR2 — period state for the combined progress card; lastGoodRef
  // keeps the previous period's data on screen while a new period fetches
  // (avoids the loading-skeleton flash on chip click).
  const [period, setPeriod] = useState<DashboardPeriod>('all');
  // B-IGDB-3 — breakdown dimension (genre · theme · perspective).
  const [breakdownTab, setBreakdownTab] = useState<'genre' | 'theme' | 'perspective'>('genre');
  const { data, loading, error, refetch } = useDashboard(period);
  const lastGoodRef = useRef<DashboardResponse | null>(null);
  if (data) lastGoodRef.current = data;
  const user = useCurrentUser();
  const [pickIdx, setPickIdx] = useState(0);
  const platformChart = useMemo(
    () => (data ? asciiChart(data.stats.playtimeByPlatform) : ''),
    [data],
  );

  if (error) {
    return (
      <>
        <MobileHeader title="hoard" sub="// load failed" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '24px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-2xs)" }}>{`// failed to load dashboard`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", maxWidth: 320, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }

  const resolvedData = data ?? lastGoodRef.current;

  if ((loading && !resolvedData) || !resolvedData) {
    return (
      <>
        <MobileHeader title="hoard" />
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skel" style={{ width: 100, height: 10 }} />
            <div className="skel" style={{ width: 60, height: 36 }} />
            <div className="skel" style={{ width: 180, height: 10 }} />
          </div>
          <div className="skel" style={{ height: 100 }} />
          <div className="skel" style={{ height: 80 }} />
          <div className="skel" style={{ height: 60 }} />
        </div>
      </>
    );
  }

  // `activity` is required in the new DashboardResponse, but old cached
  // payloads (SW or in-memory) from before F14 may not have it — fall back.
  const { stats, nowPlaying, wishlistCountdown, backlogPick, backlogItems, platforms, activity = { weeks: 24, cells: [] }, wishlistDealsCount = 0, nextEvent = null } = resolvedData;
  // B-IGDB-3 — defensive fallback for the new IGDB-tag triple fields.
  // Old cached payloads (SW / in-memory SWR) from before the partial PR
  // don't carry these. See DashboardDesktop's matching comment.
  const breakdownThemes = stats.themes ?? [];
  const breakdownPerspectives = stats.playerPerspectives ?? [];

  // First-run / empty state: zero games owned.
  if (stats.totalGames === 0) {
    return (
      <>
        <MobileHeader title="hoard" sub="// nothing here yet" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ padding: 24, width: '100%', textAlign: 'center' }}>
            <Marker>// nothing here yet</Marker>
            <h2 className="t-display" style={{ fontSize: "var(--text-md)", margin: '12px 0 0', color: 'var(--paper)', fontWeight: 'normal' }}>your hoard is empty</h2>
            <p style={{ marginTop: 12, color: 'var(--paper-dim)', fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
              connect a platform to sync your library, or add a game manually.
            </p>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Btn variant="primary" onClick={() => navigate('/settings/platforms')}>
                <Icon name="link" size={11} /> connect a platform
              </Btn>
              <Btn onClick={() => navigate('/library')}>
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
  // Mobile shows the last 16 weeks. The activity array is column-major
  // (col * 7 + row), oldest first — slice off the leading columns.
  const MOBILE_WEEKS = 16;
  const skipWeeks = Math.max(0, activity.weeks - MOBILE_WEEKS);
  const mobileCells = activity.cells.slice(skipWeeks * 7);
  const np = nowPlaying[0] ?? null;
  const rotation = nowPlaying.slice(1);
  const nextRelease = wishlistCountdown[0] ?? null;
  const npTotalMin = np
    ? Object.values(np.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0)
    : 0;
  const npPct = np?.hltb?.mainStory
    ? Math.min(100, Math.round((npTotalMin / np.hltb.mainStory) * 100))
    : 0;
  const npHltb = np?.hltb?.mainStory ? `~${Math.round(np.hltb.mainStory / 60)}h` : '—';
  const npDominantPlat = np
    ? (Object.entries(np.playtimeByPlatform).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] ?? 'ST')
    : 'ST';
  const syncSub = platforms[0]?.lastSyncAt
    ? `// synced ${formatRelative(platforms[0].lastSyncAt)}`
    : '// synced';

  return (
    <>
      <MobileHeader
        title="hoard"
        sub={syncSub}
      />
      <PullableScroll onRefresh={refetch} ariaLabel="Dashboard content">

        {/* Greeting + bignum header — same role as desktop, slimmer */}
        <div style={{ padding: '14px 16px 4px' }}>
          <Marker>// good {greeting()}, {(user?.name ?? user?.email?.split('@')[0] ?? 'hoard').toLowerCase()}</Marker>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
            <span className="t-display bignum" style={{ fontSize: "var(--text-display-sm)", lineHeight: 0.85 }}>{stats.totalGames}</span>
            <div>
              <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)" }}>games owned</div>
              <div className="t-mono t-dim" style={{ fontSize: "var(--text-2xs)" }}>+{stats.weeklyAdded} wk</div>
            </div>
          </div>
        </div>

        {/* Mobile cards stack in span-order per OQ-DASH-1 #1
            (alerts → now-playing → countdowns → stats → breakdowns → heatmap).

            Slim alerts strip (DASH-PR3) — only render the padding wrapper
            when there's content, so the dashboard doesn't carry blank space
            at the top when no alerts are active. */}
        {platforms.some((p) => p.syncStatus === 'error') && (
          <div style={{ padding: '12px 16px 0' }}>
            <AlertsStrip platforms={platforms} wishlistDealsCount={wishlistDealsCount} />
          </div>
        )}

        {/* now playing — primary hero, tap card → game detail */}
        {np && (
          <div data-testid="card-now-playing" style={{ padding: '12px 16px' }}>
            <button
              type="button"
              className="panel"
              onClick={() => navigate(`/game/${np.id}`)}
              aria-label={`Open ${np.game.title}`}
              style={{ padding: 12, display: 'flex', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
            >
              <Cover w={70} h={94} label={(np.game.title.split(': ')[1] ?? np.game.title).toUpperCase()} dev={np.game.developer ?? ''} bright />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-2xs)", color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="dotO" size={7} fill={true} /> now playing
                </div>
                <div style={{ fontSize: "var(--text-base)", lineHeight: 1.15, marginTop: 3 }}>{np.game.title}</div>
                <div className="t-faint" style={{ fontSize: "var(--text-3xs)", marginTop: 2 }}>
                  {minutesToHours(npTotalMin)} · {formatRelative(np.lastPlayedAt)} · {npDominantPlat.toLowerCase()}
                </div>
                <div className="prog green" style={{ marginTop: 8 }}>
                  <span style={{ width: `${npPct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: "var(--text-3xs)", color: 'var(--paper-dim)' }}>
                  <span>{npPct}%</span>
                  <span>{npHltb}</span>
                </div>
              </div>
            </button>

            {/* Active rotation — compact rows for the other Playing games.
                Mirrors desktop bento §7.4 ASCII (active rotation sub-section). */}
            {rotation.length > 0 && (
              <div className="panel" style={{ marginTop: 8, padding: '12px 14px' }}>
                <Marker>// active rotation · playing × {nowPlaying.length}</Marker>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rotation.map((g) => {
                    const mins = Object.values(g.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => navigate(`/game/${g.id}`)}
                        aria-label={`Open ${g.game.title}`}
                        style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '2px 0', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.game.title}
                        </span>
                        <span className="t-tnum t-dim" style={{ fontSize: 'var(--text-3xs)' }}>{minutesToHours(mins)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* next release countdown — compact, replaces the old multi-row
            "dropping soon" list per DASH-PR1 plan. Reuses the same
            NextReleaseCountdown component as desktop. */}
        {nextRelease && (
          <div data-testid="card-next-release" style={{ padding: '0 16px 12px' }}>
            <NextReleaseCountdown release={nextRelease} />
          </div>
        )}

        {/* EV-PR1 — next IGDB showcase event */}
        {nextEvent && (
          <div data-testid="card-next-event" style={{ padding: '0 16px 12px' }}>
            <NextEventCountdown event={nextEvent} />
          </div>
        )}

        {/* backlog picker — AGENT.md key decision #4 */}
        {displayPick && (
          <div data-testid="card-backlog-picker" style={{ padding: '8px 16px 4px' }}>
            <Hr kind="dot" />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
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
              <Icon name="arrowR" size={12} style={{ color: 'var(--paper-dim)', flexShrink: 0 }} />
            </button>
          </div>
        )}

        {/* DASH-PR2 — combined progress card. Completion + achievements
            share the same period scope, so one card, one toggle, two
            metrics. Mobile stacks the two halves vertically inside the
            card (narrow width). When achievements is null for the active
            period, only completion renders.

            `loadingNewPeriod` dims the stats while the new period is
            fetching in the background — visible signal that a chip click
            registered (Andrea's eyeball feedback). */}
        {(() => {
          const loadingNewPeriod = loading && !data;
          return (
        <div data-testid="card-progress" style={{ padding: '14px 16px 0' }}>
          <div className="panel" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <Marker>// progress</Marker>
              <PeriodToggle value={period} onChange={setPeriod} compact />
            </div>

            <div style={{ opacity: loadingNewPeriod ? 0.45 : 1, transition: 'opacity 120ms ease' }}>
            <div data-testid="progress-completion">
              <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 6 }}>completed</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span className="t-mono t-tnum" style={{ fontSize: 'var(--text-lg)', color: 'var(--green)', lineHeight: 1 }}>
                  {stats.periodStats.completionPct}%
                </span>
                <span className="t-tnum t-dim" style={{ fontSize: 'var(--text-2xs)' }}>
                  {stats.periodStats.completedCount} / {stats.periodStats.totalGames}
                </span>
              </div>
              <Gauge total={20} filled={Math.round((stats.periodStats.completedCount / Math.max(stats.periodStats.totalGames, 1)) * 20)} />
            </div>

            {stats.periodStats.achievementsRollup && (
              <div data-testid="progress-achievements" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-3xs)', marginBottom: 6 }}>achievements</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span
                    className="t-mono t-tnum"
                    style={{ fontSize: 'var(--text-lg)', lineHeight: 1, color: stats.periodStats.achievementsRollup.percent >= 80 ? 'var(--green)' : 'var(--paper)' }}
                  >
                    {stats.periodStats.achievementsRollup.percent}%
                  </span>
                  <span className="t-tnum t-dim" style={{ fontSize: 'var(--text-2xs)' }}>
                    {stats.periodStats.achievementsRollup.earned.toLocaleString('en')} / {stats.periodStats.achievementsRollup.total.toLocaleString('en')}
                  </span>
                </div>
                <Gauge total={20} filled={Math.round((stats.periodStats.achievementsRollup.percent / 100) * 20)} />
              </div>
            )}
            </div>
          </div>
        </div>
          );
        })()}

        {/* B-IGDB-3 — IGDB-tag triple breakdown with 3-tab strip
            (genre · theme · perspective). Same tab pattern as desktop. */}
        {(stats.genres.length + breakdownThemes.length + breakdownPerspectives.length) > 0 && (
          <div data-testid="card-breakdown" style={{ padding: '14px 16px 0' }}>
            {(() => {
              const series = breakdownTab === 'theme'
                ? breakdownThemes
                : breakdownTab === 'perspective'
                  ? breakdownPerspectives
                  : stats.genres;
              const tabs: { id: typeof breakdownTab; label: string; available: boolean }[] = [
                { id: 'genre', label: 'genre', available: stats.genres.length > 0 },
                { id: 'theme', label: 'theme', available: breakdownThemes.length > 0 },
                { id: 'perspective', label: 'persp.', available: breakdownPerspectives.length > 0 },
              ];
              const maxCount = series[0]?.count ?? 1;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
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
                            padding: '0 7px',
                            fontSize: 'var(--text-3xs)',
                            letterSpacing: '0.04em',
                            opacity: t.available ? 1 : 0.35,
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {series.length === 0 ? (
                      <div className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
                        no data yet — backfill via the new sync.
                      </div>
                    ) : (
                      series.slice(0, 6).map(({ name, count }, i) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 'var(--text-2xs)' }}>
                          <span style={{ width: 92, color: i === 0 ? 'var(--paper)' : 'var(--paper-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                          <div style={{ flex: 1, height: 3, background: 'var(--ink-2)', position: 'relative' }}>
                            <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: 'var(--paper-dim)' }} />
                          </div>
                          <span className="t-tnum t-faint" style={{ fontSize: 'var(--text-3xs)', width: 22, textAlign: 'right' }}>{count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* hours by platform */}
        {stats.playtimeByPlatform.length > 0 && (
          <div data-testid="card-platforms" style={{ padding: '14px 16px 0' }}>
            <Marker>// hours by platform</Marker>
            <pre className="ascii t-dim" style={{ marginTop: 8, fontSize: "var(--text-3xs)", lineHeight: 1.55 }}>
              {platformChart}
            </pre>
          </div>
        )}

        {/* activity heatmap */}
        <div data-testid="card-heatmap" style={{ padding: '14px 16px 18px' }}>
          <Marker>// last-played · 16 wks</Marker>
          <div style={{ marginTop: 8 }}>
            <Heatmap weeks={MOBILE_WEEKS} days={7} cells={mobileCells} />
          </div>
        </div>

      </PullableScroll>
    </>
  );
}
