import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { useGames } from '../../hooks/useGames';
import { usePreferences } from '../../contexts/PreferencesContext';
import { api } from '../../lib/api';
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
  { name: 'On Hold',     status: 'On Hold',   tone: null },
  { name: 'Completed',   status: 'Completed', tone: null },
  { name: 'Backlog',     status: 'Backlog',   tone: null },
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

const COVER_DIMS: Record<string, { w: number; h: number }> = {
  cozy:     { w: 150, h: 200 },
  standard: { w: 130, h: 174 },
  dense:    { w: 108, h: 144 },
};

interface ShelfItemProps {
  g: GameDisplay;
  w?: number;
  h?: number;
  isBacklog: boolean;
  showHltb: boolean;
}

function ShelfItem({ g, w = 130, h = 174, isBacklog, showHltb }: ShelfItemProps) {
  const navigate = useNavigate();
  const tone = g.progress === 100 ? 'var(--paper)' : g.progress > 0 ? 'var(--green)' : 'var(--paper-faint)';
  return (
    <div style={{ width: w, flex: '0 0 auto', cursor: 'pointer' }} onClick={() => navigate(`/game/${g.id}`)}>
      <div style={{ position: 'relative' }}>
        <Cover w={w} h={h} src={g.coverUrl} label={g.title.toUpperCase()} dev={g.developer} year={shortYear(g.year)} bright={g.progress > 0} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <Plat code={g.platformCode} />
        </div>
        {isBacklog && showHltb && g.hltbHours != null && (
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

interface ShelfProps {
  idx: number;
  shelf: ShelfDisplay;
  coverW: number;
  coverH: number;
  showHltb: boolean;
}

const SHELF_GAP = 16;

function Shelf({ idx, shelf, coverW, coverH, showHltb }: ShelfProps) {
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);
  const [visibleSlots, setVisibleSlots] = useState(8);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const compute = (width: number) => {
      const slots = Math.max(2, Math.floor((width + SHELF_GAP) / (coverW + SHELF_GAP)));
      setVisibleSlots(slots);
    };
    compute(el.clientWidth);
    const ro = new ResizeObserver((entries) => { if (entries[0]) compute(entries[0].contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [coverW]);

  const isBacklog = shelf.status === 'Backlog';
  const accent = shelf.tone === 'green' ? 'var(--green)' : shelf.tone === 'amber' ? 'var(--amber)' : shelf.tone === 'red' ? 'var(--red)' : 'var(--paper)';
  // Reserve last slot for "view all", show the rest with game covers
  const shown = shelf.items.slice(0, visibleSlots - 1);
  const remaining = shelf.count - shown.length;
  return (
    <div id={`shelf-${shelf.status}`} style={{ padding: '24px 0' }}>
      <div className="shelf-label">
        <span className="num" style={{ color: accent }}>{String(idx).padStart(2, '0')}</span>
        <span className="name">{shelf.name}</span>
        <span className="t-mono t-faint" style={{ fontSize: 11 }}>· {shelf.count} titles</span>
      </div>
      <div ref={rowRef} style={{ display: 'flex', gap: SHELF_GAP, overflow: 'hidden' }}>
        {shown.map(g => <ShelfItem key={g.id} g={g} w={coverW} h={coverH} isBacklog={isBacklog} showHltb={showHltb} />)}
        <div
          style={{ width: coverW, flex: `0 0 ${coverW}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: coverH, color: 'var(--paper-faint)', fontSize: 11, gap: 6, cursor: 'pointer' }}
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

type SortBy = 'lastPlayed' | 'title' | 'playtime';

const SORT_LABELS: Record<SortBy, string> = { lastPlayed: 'last played', title: 'title', playtime: 'playtime' };
const SORT_CYCLE: SortBy[] = ['lastPlayed', 'title', 'playtime'];

export function LibraryDesktop() {
  const navigate = useNavigate();
  const { status: statusParam } = useParams<{ status?: string }>();
  const { data, loading, refetch } = useGames(
    statusParam ? { status: statusParam as GameStatus, limit: 2000 } : { limit: 2000 }
  );
  const { prefs, updatePref } = usePreferences();
  const [showAddModal, setShowAddModal] = useState(false);
  const [platFilter, setPlatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortBy>('lastPlayed');
  const [viewMode, setViewMode] = useState<'shelves' | 'grid' | 'list'>(prefs.libraryView);
  const [apiCounts, setApiCounts] = useState<Partial<Record<string, number>>>({});
  const coverDims = COVER_DIMS[prefs.coverDensity] ?? COVER_DIMS['standard']!;

  useEffect(() => {
    void api.gameCounts().then((r) => setApiCounts(r.counts)).catch(() => null);
  }, []);

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

  const shelfCounts: Record<string, number> = Object.fromEntries(
    SHELF_CONFIG.map(cfg => [cfg.status, apiCounts[cfg.status] ?? (grouped.get(cfg.status) ?? []).length])
  );

  const shelves: ShelfDisplay[] = SHELF_CONFIG.map(cfg => {
    const items = applyFilters(grouped.get(cfg.status) ?? []);
    return { ...cfg, count: shelfCounts[cfg.status] ?? items.length, items: items.map(toGameDisplay) };
  });

  if (loading || !data) {
    return (
      <div className="app-shell hoard-noise">
        <Sidebar />
        <div className="app-main">
          <TopBar crumbs={['hoard', 'library']} />
          <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="skel" style={{ width: 140, height: 11 }} />
                <div style={{ display: 'flex', gap: 16 }}>
                  {[0, 1, 2, 3, 4].map(j => (
                    <div key={j} className="skel" style={{ width: 130, height: 174, flex: '0 0 auto' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (statusParam) {
    const cfg = SHELF_CONFIG.find(c => c.status === statusParam);
    const items = applyFilters(grouped.get(statusParam as GameStatus) ?? []).map(toGameDisplay);
    const isBacklog = statusParam === 'Backlog';
    const accent = cfg?.tone === 'green' ? 'var(--green)' : cfg?.tone === 'amber' ? 'var(--amber)' : cfg?.tone === 'red' ? 'var(--red)' : 'var(--paper)';
    return (
      <div className="app-shell hoard-noise">
        <Sidebar shelfCounts={shelfCounts} />
        <div className="app-main">
          <TopBar crumbs={['hoard', 'library', (cfg?.name ?? statusParam).toLowerCase()]} />
          <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Btn sm onClick={() => navigate('/library')}>
              <Icon name="back" size={10} /> shelves
            </Btn>
            <div style={{ width: 1, height: 20, background: 'var(--rule)' }} />
            <span className="t-up" style={{ fontSize: 11, color: accent }}>{cfg?.name ?? statusParam}</span>
            <span className="t-mono t-faint" style={{ fontSize: 11 }}>· {items.length} titles</span>
            <span style={{ flex: 1 }} />
            <Btn sm variant="primary" onClick={() => setShowAddModal(true)}>
              <Icon name="plus" size={10} /> add game
            </Btn>
          </div>
          {showAddModal && (
            <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { void refetch(); }} />
          )}
          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 40px' }}>
            {items.length === 0 ? (
              <span className="t-mono t-faint" style={{ fontSize: 12 }}>// no titles in this shelf yet</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {items.map(g => <ShelfItem key={g.id} g={g} w={coverDims.w} h={coverDims.h} isBacklog={isBacklog} showHltb={prefs.showHltb} />)}
              </div>
            )}
          </div>
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
          <Chip on={viewMode === 'shelves'} onClick={() => { setViewMode('shelves'); void updatePref({ libraryView: 'shelves' }); }}>shelves</Chip>
          <Chip on={viewMode === 'grid'}    onClick={() => { setViewMode('grid');    void updatePref({ libraryView: 'grid' }); }}>grid</Chip>
          <Chip on={viewMode === 'list'}    onClick={() => { setViewMode('list');    void updatePref({ libraryView: 'list' }); }}>list</Chip>
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: 10 }}>plat</span>
          <Chip on={platFilter === 'all'} onClick={() => setPlatFilter('all')}>all</Chip>
          <Chip on={platFilter === 'ST'} onClick={() => setPlatFilter(platFilter === 'ST' ? 'all' : 'ST')}><Plat code="ST" /></Chip>
          <Chip on={platFilter === 'PS'} onClick={() => setPlatFilter(platFilter === 'PS' ? 'all' : 'PS')}><Plat code="PS" /></Chip>
          <Chip on={platFilter === 'XB'} onClick={() => setPlatFilter(platFilter === 'XB' ? 'all' : 'XB')}><Plat code="XB" /></Chip>
          <Chip on={platFilter === 'GG'} onClick={() => setPlatFilter(platFilter === 'GG' ? 'all' : 'GG')}><Plat code="GG" /></Chip>
          <span style={{ flex: 1 }} />
          <span
            className="t-mono t-faint"
            style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length]!)}
          >
            sort: {SORT_LABELS[sortBy]} <Icon name="arrowD" size={10} />
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
            <Shelf key={s.status} idx={i + 1} shelf={s} coverW={coverDims.w} coverH={coverDims.h} showHltb={prefs.showHltb} />
          ))}
        </div>
      </div>
    </div>
  );
}
