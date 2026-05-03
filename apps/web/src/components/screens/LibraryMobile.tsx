import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MobileFrame } from '../layout/MobileFrame';
import { MobileHeader } from '../layout/MobileHeader';
import { MobileTabBar } from '../layout/MobileTabBar';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { useGames } from '../../hooks/useGames';
import { minutesToHours, formatRelative } from '../../lib/utils';
import { AddGameModal } from './AddGameModal';
import type { UserGameDetail, GameStatus } from '@hoard/types';

interface GameDisplay {
  id: string;
  title: string;
  platformCode: string;
  playtime: string;
  progress: number;
  coverUrl: string | null;
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
    coverUrl: ug.game.coverUrl,
    ...(ug.hltb?.mainStory ? { hltbHours: Math.round(ug.hltb.mainStory / 60) } : {}),
  };
}

function MobileShelf({ idx, shelf }: { idx: number; shelf: ShelfDisplay }) {
  const navigate = useNavigate();
  const accent = shelf.tone === 'green' ? 'var(--green)' : shelf.tone === 'amber' ? 'var(--amber)' : shelf.tone === 'red' ? 'var(--red)' : 'var(--paper)';
  const isBacklog = shelf.status === 'Backlog';
  const shown = shelf.items.slice(0, 3);
  const remaining = shelf.count - shown.length;
  return (
    <div id={`shelf-${shelf.status}`} style={{ padding: '14px 0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px' }}>
        <span className="t-display" style={{ fontSize: 18, color: accent, lineHeight: 0.9 }}>{String(idx).padStart(2, '0')}</span>
        <span className="t-up" style={{ fontSize: 12, letterSpacing: '0.14em' }}>{shelf.name}</span>
        <span className="t-mono t-faint" style={{ fontSize: 10 }}>· {shelf.count}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, overflow: 'hidden', padding: '12px 16px 0' }}>
        {shown.map(g => (
          <div key={g.id} style={{ width: 84, flex: '0 0 auto', cursor: 'pointer' }} onClick={() => navigate(`/game/${g.id}`)}>
            <div style={{ position: 'relative' }}>
              <Cover w={84} h={112} src={g.coverUrl} label={(g.title.split(/[: ]/)[0] ?? g.title).toUpperCase()} bright={g.progress > 0} />
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
        <div
          style={{ width: 84, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: 112, color: 'var(--paper-faint)', fontSize: 10, gap: 4, cursor: 'pointer' }}
          onClick={() => navigate(`/library/${encodeURIComponent(shelf.status)}`)}
        >
          {remaining > 0 && <span style={{ fontSize: 16 }}>+{remaining}</span>}
          <span className="t-up" style={{ fontSize: 8 }}>view all</span>
        </div>
      </div>
      <div style={{ height: 3, background: 'var(--rule-bright)', margin: '10px 16px 0' }} />
    </div>
  );
}

type SortBy = 'lastPlayed' | 'title' | 'playtime';
const SORT_CYCLE: SortBy[] = ['lastPlayed', 'title', 'playtime'];
const SORT_LABELS: Record<SortBy, string> = { lastPlayed: 'last played', title: 'title', playtime: 'playtime' };

export function LibraryMobile() {
  const navigate = useNavigate();
  const { data, loading, refetch } = useGames({ limit: 100 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [platFilter, setPlatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('lastPlayed');
  const { status: statusParam } = useParams<{ status?: string }>();

  const grouped = new Map<GameStatus, UserGameDetail[]>();
  if (data) {
    for (const ug of data.games) {
      const arr = grouped.get(ug.status) ?? [];
      arr.push(ug);
      grouped.set(ug.status, arr);
    }
  }

  function applyFilters(games: UserGameDetail[]): UserGameDetail[] {
    let result = platFilter === 'all' ? games : games.filter(ug => Object.keys(ug.playtimeByPlatform).includes(platFilter));
    if (sortBy === 'title') return [...result].sort((a, b) => a.game.title.localeCompare(b.game.title));
    if (sortBy === 'playtime') return [...result].sort((a, b) => {
      const total = (ug: UserGameDetail) => Object.values(ug.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
      return total(b) - total(a);
    });
    return [...result].sort((a, b) => (b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0) - (a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0));
  }

  const shelves: ShelfDisplay[] = SHELF_CONFIG.map(cfg => {
    const items = applyFilters(grouped.get(cfg.status) ?? []);
    return { ...cfg, count: items.length, items: items.map(toGameDisplay) };
  });

  if (loading || !data) {
    return (
      <MobileFrame>
        <MobileHeader title="shelves" />
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24, overflow: 'hidden' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="skel" style={{ width: 100, height: 10 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                {[0, 1, 2].map(j => (
                  <div key={j} className="skel" style={{ width: 84, height: 112, flex: '0 0 auto' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <MobileTabBar />
      </MobileFrame>
    );
  }

  if (statusParam) {
    const cfg = SHELF_CONFIG.find(c => c.status === statusParam);
    const items = applyFilters(grouped.get(statusParam as GameStatus) ?? []).map(toGameDisplay);
    const isBacklog = statusParam === 'Backlog';
    const title = (cfg?.name ?? statusParam).toLowerCase();
    return (
      <MobileFrame>
        <MobileHeader
          title={title}
          sub={`// ${items.length} titles`}
          back
          onBack={() => navigate('/library')}
          right={<Btn sm variant="primary" onClick={() => setShowAddModal(true)}><Icon name="plus" size={10} /></Btn>}
        />
        {showAddModal && (
          <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { void refetch(); }} />
        )}
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 16px 20px' }}>
          {items.length === 0 ? (
            <span className="t-mono t-faint" style={{ fontSize: 11 }}>// no titles in this shelf yet</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {items.map(g => (
                <div key={g.id} style={{ width: 84, flex: '0 0 auto', cursor: 'pointer' }} onClick={() => navigate(`/game/${g.id}`)}>
                  <div style={{ position: 'relative' }}>
                    <Cover w={84} h={112} src={g.coverUrl} label={(g.title.split(/[: ]/)[0] ?? g.title).toUpperCase()} bright={g.progress > 0} />
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
          )}
        </div>
        <MobileTabBar />
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <MobileHeader
        title="shelves"
        sub={`// ${data.total} titles`}
        right={<Btn sm variant="primary" onClick={() => setShowAddModal(true)}><Icon name="plus" size={10} /></Btn>}
      />
      {showAddModal && (
        <AddGameModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { void refetch(); }}
        />
      )}
      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        <Chip on={platFilter === 'all'} onClick={() => setPlatFilter('all')}>all</Chip>
        <Chip on={platFilter === 'ST'} onClick={() => setPlatFilter(platFilter === 'ST' ? 'all' : 'ST')}><Plat code="ST" /></Chip>
        <Chip on={platFilter === 'PS'} onClick={() => setPlatFilter(platFilter === 'PS' ? 'all' : 'PS')}><Plat code="PS" /></Chip>
        <Chip on={platFilter === 'XB'} onClick={() => setPlatFilter(platFilter === 'XB' ? 'all' : 'XB')}><Plat code="XB" /></Chip>
        <Chip on={platFilter === 'GG'} onClick={() => setPlatFilter(platFilter === 'GG' ? 'all' : 'GG')}><Plat code="GG" /></Chip>
        <Chip onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length]!)}>
          <Icon name="arrowD" size={10} style={{ marginRight: 4 }} />{SORT_LABELS[sortBy]}
        </Chip>
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
