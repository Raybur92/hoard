import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { MobileTabBar } from '../layout/MobileTabBar';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { useGames } from '../../hooks/useGames';
import { minutesToHours, formatRelative } from '../../lib/utils';
import type { UserGameDetail, GameStatus } from '@hoard/types';

interface GameDisplay {
  id: string;
  title: string;
  platformCode: string;
  playtime: string;
  progress: number;
  hltbHours?: number;
}

interface ShelfDisplay {
  name: string;
  status: GameStatus;
  tone: 'green' | 'amber' | 'red' | null;
  count: number;
  items: GameDisplay[];
}

const SHELF_CONFIG: Array<{ name: string; status: GameStatus; tone: 'green' | 'amber' | 'red' | null }> = [
  { name: 'Now Playing', status: 'Playing',   tone: 'green' },
  { name: 'Backlog',     status: 'Backlog',   tone: null },
  { name: 'Completed',   status: 'Completed', tone: null },
  { name: 'On Hold',     status: 'On Hold',   tone: null },
  { name: 'Dropped',     status: 'Dropped',   tone: 'red' },
  { name: 'Wishlist',    status: 'Wishlist',  tone: 'amber' },
];

function toGameDisplay(ug: UserGameDetail): GameDisplay {
  const totalMin = Object.values(ug.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
  const hltbMin = ug.hltb?.mainStory ?? 0;
  const entries = Object.entries(ug.playtimeByPlatform).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const platformCode = entries[0]?.[0] ?? 'ST';
  const progress = ug.status === 'Completed'
    ? 100
    : hltbMin > 0 ? Math.min(99, Math.round((totalMin / hltbMin) * 100)) : 0;
  return {
    id: ug.id,
    title: ug.game.title,
    platformCode,
    playtime: minutesToHours(totalMin),
    progress,
    ...(ug.hltb?.mainStory ? { hltbHours: Math.round(ug.hltb.mainStory / 60) } : {}),
  };
}

function MobileShelf({ idx, shelf }: { idx: number; shelf: ShelfDisplay }) {
  const accent = shelf.tone === 'green' ? 'var(--green)' : shelf.tone === 'amber' ? 'var(--amber)' : shelf.tone === 'red' ? 'var(--red)' : 'var(--paper)';
  const isBacklog = shelf.status === 'Backlog';
  const shown = shelf.items.slice(0, 6);
  return (
    <div style={{ padding: '14px 0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px' }}>
        <span className="t-display" style={{ fontSize: 18, color: accent, lineHeight: 0.9 }}>{String(idx).padStart(2, '0')}</span>
        <span className="t-up" style={{ fontSize: 12, letterSpacing: '0.14em' }}>{shelf.name}</span>
        <span className="t-mono t-faint" style={{ fontSize: 10 }}>· {shelf.count}</span>
        <span style={{ flex: 1 }} />
        <span className="t-faint" style={{ fontSize: 10 }}>see all ›</span>
      </div>
      <div className="thin-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 16px 0' }}>
        {shown.map(g => (
          <div key={g.id} style={{ width: 84, flex: '0 0 auto' }}>
            <div style={{ position: 'relative' }}>
              <Cover w={84} h={112} label={(g.title.split(/[: ]/)[0] ?? g.title).toUpperCase()} bright={g.progress > 0} />
              <div style={{ position: 'absolute', top: 4, right: 4 }}><Plat code={g.platformCode} /></div>
              {g.progress > 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.3)' }}>
                  <div style={{ height: '100%', width: `${g.progress}%`, background: g.progress === 100 ? 'var(--paper)' : 'var(--green)' }} />
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, marginTop: 5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
            <div style={{ fontSize: 9, color: 'var(--paper-faint)', marginTop: 1, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span>{g.playtime}</span>
              {isBacklog && g.hltbHours != null && <span style={{ color: 'var(--paper-dim)' }}>~{g.hltbHours}h</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: 'var(--rule-bright)', margin: '10px 16px 0' }} />
    </div>
  );
}

export function LibraryMobile() {
  const { data, loading } = useGames({ limit: 100 });

  const grouped = new Map<GameStatus, UserGameDetail[]>();
  if (data) {
    for (const ug of data.games) {
      const arr = grouped.get(ug.status) ?? [];
      arr.push(ug);
      grouped.set(ug.status, arr);
    }
  }

  const shelves: ShelfDisplay[] = SHELF_CONFIG.map(cfg => {
    const items = grouped.get(cfg.status) ?? [];
    return { ...cfg, count: items.length, items: items.map(toGameDisplay) };
  });

  if (loading || !data) {
    return (
      <MobileFrame>
        <MobileHeader title="shelves" sub="// loading..." />
        <div style={{ flex: 1 }} />
        <MobileTabBar />
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <MobileHeader title="shelves" sub={`// ${data.total} titles`} />
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        <Chip on>all</Chip>
        <Chip><Plat code="ST" /></Chip>
        <Chip><Plat code="PS" /></Chip>
        <Chip><Plat code="XB" /></Chip>
        <Chip><Plat code="GG" /></Chip>
        <Chip><Icon name="arrowD" size={10} style={{ marginRight: 4 }} />last played</Chip>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', marginTop: 6 }}>
        {shelves.map((s, i) => (
          <MobileShelf key={s.status} idx={i + 1} shelf={s} />
        ))}
      </div>
      <MobileTabBar />
    </MobileFrame>
  );
}
