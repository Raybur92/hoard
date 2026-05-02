import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { useGames } from '../../hooks/useGames';
import { minutesToHours, formatRelative, shortYear } from '../../lib/utils';
import { AddGameModal } from './AddGameModal';
import type { UserGameDetail, GameStatus } from '@hoard/types';

interface GameDisplay {
  id: string;
  title: string;
  developer: string;
  year: number | null;
  platformCode: string;
  playtime: string;
  lastPlayed: string;
  progress: number;
  hltbHours?: number;
  coverUrl: string | null;
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
    developer: ug.game.developer ?? '',
    year: ug.game.releaseYear,
    platformCode,
    playtime: minutesToHours(totalMin),
    lastPlayed: formatRelative(ug.lastPlayedAt),
    progress,
    coverUrl: ug.game.coverUrl,
    ...(ug.hltb?.mainStory ? { hltbHours: Math.round(ug.hltb.mainStory / 60) } : {}),
  };
}

interface ShelfItemProps {
  g: GameDisplay;
  w?: number;
  h?: number;
  isBacklog: boolean;
}

function ShelfItem({ g, w = 130, h = 174, isBacklog }: ShelfItemProps) {
  const navigate = useNavigate();
  const tone = g.progress === 100 ? 'var(--paper)' : g.progress > 0 ? 'var(--green)' : 'var(--paper-faint)';
  return (
    <div style={{ width: w, flex: '0 0 auto', cursor: 'pointer' }} onClick={() => navigate(`/game/${g.id}`)}>
      <div style={{ position: 'relative' }}>
        <Cover w={w} h={h} src={g.coverUrl} label={g.title.toUpperCase()} dev={g.developer} year={shortYear(g.year)} bright={g.progress > 0} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <Plat code={g.platformCode} />
        </div>
        {isBacklog && g.hltbHours != null && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 5px', background: 'rgba(0,0,0,0.78)', border: '1px solid var(--rule-bright)', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.04em', color: 'var(--paper-dim)' }}>
            <span style={{ color: 'var(--paper-faint)', fontSize: 8 }}>HLTB </span>~{g.hltbHours}h
          </div>
        )}
        {g.progress > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', width: `${g.progress}%`, background: tone }} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--paper)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--paper-faint)' }}>
        <span className="t-tnum">{g.playtime}</span>
        <span className="t-tnum">{g.lastPlayed}</span>
      </div>
    </div>
  );
}

function Shelf({ idx, shelf }: { idx: number; shelf: ShelfDisplay }) {
  const navigate = useNavigate();
  const isBacklog = shelf.status === 'Backlog';
  const accent = shelf.tone === 'green' ? 'var(--green)' : shelf.tone === 'amber' ? 'var(--amber)' : shelf.tone === 'red' ? 'var(--red)' : 'var(--paper)';
  const shown = shelf.items.slice(0, 7);
  const remaining = shelf.count - shown.length;
  return (
    <div id={`shelf-${shelf.status}`} style={{ padding: '24px 0' }}>
      <div className="shelf-label">
        <span className="num" style={{ color: accent }}>{String(idx).padStart(2, '0')}</span>
        <span className="name">{shelf.name}</span>
        <span className="t-mono t-faint" style={{ fontSize: 11 }}>· {shelf.count} titles</span>
      </div>
      <div style={{ display: 'flex', gap: 16, overflow: 'hidden', position: 'relative' }}>
        {shown.map(g => <ShelfItem key={g.id} g={g} isBacklog={isBacklog} />)}
        <div
          style={{ width: 130, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: 174, color: 'var(--paper-faint)', fontSize: 11, gap: 6, cursor: 'pointer' }}
          onClick={() => navigate(`/library/${encodeURIComponent(shelf.status)}`)}
        >
          {remaining > 0 && <span style={{ fontSize: 22 }}>+{remaining}</span>}
          <span className="t-up" style={{ fontSize: 9 }}>view all</span>
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--rule-bright)', marginTop: 10, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: 'var(--rule)' }} />
      </div>
    </div>
  );
}

export function LibraryDesktop() {
  const { data, loading, refetch } = useGames({ limit: 100 });
  const [showAddModal, setShowAddModal] = useState(false);
  const { status: statusParam } = useParams<{ status?: string }>();

  useEffect(() => {
    if (!statusParam || loading) return;
    const el = document.getElementById(`shelf-${statusParam}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [statusParam, loading]);

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

  const shelfCounts: Record<string, number> = Object.fromEntries(
    shelves.map(s => [s.status, s.count])
  );

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

  return (
    <div className="app-shell hoard-noise">
      <Sidebar shelfCounts={shelfCounts} />
      <div className="app-main">
        <TopBar crumbs={['hoard', 'library']} />

        {/* filter bar */}
        <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 320 }}>
            <span className="pre">$</span>
            <span style={{ color: 'var(--paper)' }}>find</span>
            <span style={{ color: 'var(--paper-faint)' }}>{data.total} games · type to filter</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--paper-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="search" size={11} /> K
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: 10 }}>view</span>
          <Chip on>shelves</Chip>
          <Chip>grid</Chip>
          <Chip>list</Chip>
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: 10 }}>plat</span>
          <Chip on>all</Chip>
          <Chip><Plat code="ST" /></Chip>
          <Chip><Plat code="PS" /></Chip>
          <Chip><Plat code="XB" /></Chip>
          <Chip><Plat code="GG" /></Chip>
          <span style={{ flex: 1 }} />
          <span className="t-mono t-faint" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            sort: last played <Icon name="arrowD" size={10} />
          </span>
          <Btn sm variant="primary" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={10} /> add game
          </Btn>
        </div>
        {showAddModal && (
          <AddGameModal
            onClose={() => setShowAddModal(false)}
            onAdded={() => { void refetch(); }}
          />
        )}

        {/* shelves */}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 40px' }}>
          {shelves.map((s, i) => (
            <Shelf key={s.status} idx={i + 1} shelf={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
