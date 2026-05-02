import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { MobileTabBar } from '../layout/MobileTabBar';
import { Marker } from '../primitives/Marker';
import { Cover } from '../primitives/Cover';
import { Icon } from '../primitives/Icon';
import { Hr } from '../primitives/Hr';
import { Heatmap } from '../primitives/Heatmap';
import { useDashboard } from '../../hooks/useDashboard';
import { minutesToHours, formatRelative, daysUntil, buildAsciiBar } from '../../lib/utils';
import type { PlatformStat, WishlistRelease } from '@hoard/types';

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
  const { data, loading } = useDashboard();

  if (loading || !data) {
    return (
      <MobileFrame>
        <MobileHeader title="hoard" sub="// loading..." />
        <div style={{ flex: 1 }} />
        <MobileTabBar />
      </MobileFrame>
    );
  }

  const { stats, nowPlaying, wishlistCountdown, platforms } = data;
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
    <MobileFrame>
      <MobileHeader
        title="hoard"
        sub={syncSub}
        right={
          <>
            <span style={{ color: 'var(--green)' }}><Icon name="dotO" size={8} fill={true} /></span>
            <Icon name="menu" size={14} />
          </>
        }
      />
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto' }}>

        <div style={{ padding: '14px 16px 4px' }}>
          <Marker>// good evening, andrea</Marker>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
            <span className="t-display bignum" style={{ fontSize: 56, lineHeight: 0.85 }}>{stats.totalGames}</span>
            <div>
              <div className="t-up t-faint" style={{ fontSize: 9 }}>games owned</div>
              <div className="t-mono t-dim" style={{ fontSize: 11 }}>+{stats.weeklyAdded} wk</div>
            </div>
          </div>
        </div>

        {/* now playing */}
        {np && (
          <div style={{ padding: '12px 16px' }}>
            <div className="panel" style={{ padding: 12, display: 'flex', gap: 12 }}>
              <Cover w={70} h={94} label={(np.game.title.split(': ')[1] ?? np.game.title).toUpperCase()} dev={np.game.developer ?? ''} bright />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="dotO" size={7} fill={true} /> now playing
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.15, marginTop: 3 }}>{np.game.title}</div>
                <div className="t-faint" style={{ fontSize: 10, marginTop: 2 }}>
                  {minutesToHours(npTotalMin)} · {formatRelative(np.lastPlayedAt)} · {npDominantPlat.toLowerCase()}
                </div>
                <div className="prog green" style={{ marginTop: 8 }}>
                  <span style={{ width: `${npPct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: 'var(--paper-faint)' }}>
                  <span>{npPct}%</span>
                  <span>{npHltb}</span>
                </div>
              </div>
            </div>
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
                <div className="t-up t-faint" style={{ fontSize: 9, marginTop: 4 }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* hours by platform */}
        {stats.playtimeByPlatform.length > 0 && (
          <div style={{ padding: '14px 16px 0' }}>
            <Marker>// hours by platform</Marker>
            <pre className="ascii t-dim" style={{ marginTop: 8, fontSize: 10, lineHeight: 1.55 }}>
              {asciiChart(stats.playtimeByPlatform)}
            </pre>
          </div>
        )}

        {/* activity */}
        <div style={{ padding: '14px 16px 0' }}>
          <Marker>// activity · 16 wks</Marker>
          <div style={{ marginTop: 8 }}>
            <Heatmap weeks={16} days={7} density={0.55} />
          </div>
        </div>

        {/* wishlist dropping soon */}
        {wishlistCountdown.length > 0 && (
          <div style={{ padding: '18px 16px' }}>
            <Hr kind="dot" />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 }}>
              <Marker>// dropping soon · {wishlistCountdown.length}</Marker>
              <span className="t-amber" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
                    <div style={{ fontSize: 12, lineHeight: 1.1 }}>{w.title}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      <span className="t-tnum" style={{ fontSize: 10, color: urgent ? 'var(--amber)' : 'var(--paper-dim)' }}>{dateStr.split(',')[0]}</span>
                      <span className="t-faint" style={{ fontSize: 10 }}>· {platCodes.join('·')}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="t-tnum" style={{ fontSize: 14, color: urgent ? 'var(--amber)' : 'var(--paper)' }}>
                      {w.releaseDate ? `T-${days}` : 'TBA'}
                    </div>
                    <div className="t-faint" style={{ fontSize: 9 }}>days</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
      <MobileTabBar />
    </MobileFrame>
  );
}
