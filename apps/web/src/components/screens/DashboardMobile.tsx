import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Icon } from '../primitives/Icon';
import { Hr } from '../primitives/Hr';
import { Heatmap } from '../primitives/Heatmap';
import { Btn } from '../primitives/Btn';
import { useDashboard } from '../../hooks/useDashboard';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { PullableScroll } from '../primitives/PullableScroll';
import { minutesToHours, formatRelative, daysUntil, buildAsciiBar } from '../../lib/utils';
import type { PlatformStat, UserGameDetail, WishlistRelease } from '@hoard/types';

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
    const bar = buildAsciiBar(p.pct, 20);
    const label = (PLATFORM_NAMES[p.code] ?? p.code).slice(0, 5).padEnd(5);
    const hours = Math.round(p.minutes / 60).toString().padStart(4);
    return `${label} ${bar} ${hours}`;
  }).join('\n');
}

export function DashboardMobile() {
  useDocumentTitle("Dashboard");
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useDashboard();
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

  if (loading || !data) {
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
  const { stats, nowPlaying, wishlistCountdown, backlogPick, backlogItems, platforms, activity = { weeks: 24, cells: [] } } = data;

  // First-run / empty state: zero games owned. Replace the full dashboard.
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

        {/* now playing — tap the card to open the game detail */}
        {np && (
          <div style={{ padding: '12px 16px' }}>
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
          </div>
        )}

        {/* stat tiles */}
        <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
            {([
              [`${Math.floor(stats.totalPlaytimeMinutes / 60).toLocaleString('en')}h`, 'PLAYTIME',    'dim'],
              [`${stats.completionPct}%`,                                              'COMPLETED',   'green'],
              [String(stats.backlogCount),                                             'BACKLOG',     'amber'],
              [String(stats.playingCount),                                             'PLAYING NOW', null],
            ] as [string, string, string | null][]).map(([v, k, tone], i) => (
              <div key={i} style={{ background: 'var(--ink)', padding: '12px 12px 10px' }}>
                <div className="t-mono t-tnum" style={{ fontSize: 20, fontWeight: 500, color: tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--paper)' }}>{v}</div>
                <div className="t-up t-faint" style={{ fontSize: "var(--text-2xs)", marginTop: 4 }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* hours by platform */}
        {stats.playtimeByPlatform.length > 0 && (
          <div style={{ padding: '14px 16px 0' }}>
            <Marker>// hours by platform</Marker>
            <pre className="ascii t-dim" style={{ marginTop: 8, fontSize: "var(--text-3xs)", lineHeight: 1.55 }}>
              {platformChart}
            </pre>
          </div>
        )}

        {/* activity */}
        <div style={{ padding: '14px 16px 0' }}>
          <Marker>// last-played · 16 wks</Marker>
          <div style={{ marginTop: 8 }}>
            <Heatmap weeks={MOBILE_WEEKS} days={7} cells={mobileCells} />
          </div>
        </div>

        {/* genre breakdown */}
        {stats.genres.length > 0 && (
          <div style={{ padding: '14px 16px 0' }}>
            <Marker>// top genres</Marker>
            <div style={{ marginTop: 8 }}>
              {(() => {
                const maxCount = stats.genres[0]?.count ?? 1;
                return stats.genres.slice(0, 6).map(({ name, count }, i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: "var(--text-2xs)" }}>
                    <span style={{ width: 92, color: i === 0 ? 'var(--paper)' : 'var(--paper-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                    <div style={{ flex: 1, height: 3, background: 'var(--ink-2)', position: 'relative' }}>
                      <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: 'var(--paper-dim)' }} />
                    </div>
                    <span className="t-tnum t-faint" style={{ fontSize: "var(--text-3xs)", width: 22, textAlign: 'right' }}>{count}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* backlog picker — AGENT.md key decision #4 */}
        {displayPick && (
          <div style={{ padding: '18px 16px 4px' }}>
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

        {/* wishlist dropping soon */}
        {wishlistCountdown.length > 0 && (
          <div style={{ padding: '18px 16px' }}>
            <Hr kind="dot" />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 }}>
              <Marker>// dropping soon · {wishlistCountdown.length}</Marker>
              <span className="t-amber" style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={10} fill={true} /> all
              </span>
            </div>
            {wishlistCountdown.map((w: WishlistRelease, i) => {
              const days = daysUntil(w.releaseDate);
              const urgent = days < 30;
              const platCodes = w.platforms.map(toPlatCode);
              const dateStr = w.releaseDate
                ? new Date(w.releaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
                : `TBA ${w.releaseDateCategory}`;
              return (
                <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: i < wishlistCountdown.length - 1 ? '1px dotted var(--rule-bright)' : 'none' }}>
                  <Cover w={36} h={48} label={(w.title.split(' ')[0] ?? w.title).toUpperCase()} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-xs)", lineHeight: 1.1 }}>{w.title}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      <span className="t-tnum" style={{ fontSize: "var(--text-3xs)", color: urgent ? 'var(--amber)' : 'var(--paper-dim)' }}>{dateStr.split(',')[0]}</span>
                      <span className="t-faint" style={{ fontSize: "var(--text-3xs)" }}>· {platCodes.join('·')}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="t-tnum" style={{ fontSize: "var(--text-base)", color: urgent ? 'var(--amber)' : 'var(--paper)' }}>
                      {w.releaseDate ? `T-${days}` : 'TBA'}
                    </div>
                    <div className="t-faint" style={{ fontSize: "var(--text-2xs)" }}>days</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </PullableScroll>
    </>
  );
}
