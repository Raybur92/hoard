import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { TopBar } from '../layout/TopBar';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { Marker } from '../primitives/Marker';
import { useGames } from '../../hooks/useGames';
import { useShelves } from '../../hooks/useShelves';
import { usePreferences } from '../../contexts/PreferencesContext';
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
    <button
      type="button"
      onClick={() => navigate(`/game/${g.id}`)}
      aria-label={`Open ${g.title}`}
      style={{ width: w, flex: '0 0 auto', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' }}
    >
      <div style={{ position: 'relative' }}>
        <Cover w={w} h={h} src={g.coverUrl} label={g.title.toUpperCase()} dev={g.developer} year={shortYear(g.year)} bright={g.progress > 0} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <Plat code={g.platformCode} />
        </div>
        {isBacklog && showHltb && g.hltbHours != null && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 5px', background: 'rgba(0,0,0,0.78)', border: '1px solid var(--rule-bright)', fontFamily: 'var(--mono)', fontSize: "var(--text-2xs)", letterSpacing: '0.04em', color: 'var(--paper-dim)' }}>
            <span style={{ color: 'var(--paper-dim)', fontSize: "var(--text-3xs)" }}>HLTB </span>~{g.hltbHours}h
          </div>
        )}
        {g.progress > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', width: `${g.progress}%`, background: tone }} />
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: "var(--text-2xs)", color: 'var(--paper)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: "var(--text-2xs)", color: 'var(--paper-dim)' }}>
        <span className="t-tnum">{g.playtime}</span>
        <span className="t-tnum">{g.lastPlayed}</span>
      </div>
    </button>
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
        <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>· {shelf.count} titles</span>
      </div>
      <div ref={rowRef} style={{ display: 'flex', gap: SHELF_GAP, overflow: 'hidden' }}>
        {shown.map(g => <ShelfItem key={g.id} g={g} w={coverW} h={coverH} isBacklog={isBacklog} showHltb={showHltb} />)}
        <button
          type="button"
          onClick={() => navigate(`/library/${encodeURIComponent(shelf.status)}`)}
          aria-label={`View all ${shelf.status} games`}
          style={{ width: coverW, flex: `0 0 ${coverW}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: coverH, color: 'var(--paper-dim)', fontSize: "var(--text-2xs)", gap: 6, cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}
        >
          {remaining > 0 && <span style={{ fontSize: "var(--text-lg)" }}>+{remaining}</span>}
          <span className="t-up" style={{ fontSize: "var(--text-2xs)" }}>view all</span>
        </button>
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
  const isFiltered = !!statusParam;
  useDocumentTitle(statusParam ? `Library · ${statusParam}` : 'Library');

  // Shelves view: top N per status + counts in one round trip.
  const { data: shelvesData, loading: shelvesLoading, error: shelvesError, refetch: refetchShelves } =
    useShelves(12, { enabled: !isFiltered });

  // Filtered single-shelf view: paginated single-status fetch.
  const { data: filteredData, loading: filteredLoading, error: filteredError, refetch: refetchFiltered } =
    useGames(
      isFiltered ? { status: statusParam as GameStatus, limit: 500 } : undefined,
      { enabled: isFiltered },
    );

  const loading = isFiltered ? filteredLoading : shelvesLoading;
  const error = isFiltered ? filteredError : shelvesError;
  const refetch = isFiltered ? refetchFiltered : refetchShelves;

  const { prefs, updatePref } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddModal, setShowAddModal] = useState(false);
  const [platFilter, setPlatFilter] = useState<string>('all');
  // Sort + view-mode persisted in URL so filtered views are shareable.
  // URL trumps preferences when present; otherwise falls back to default / pref.
  const sortBy: SortBy = (() => {
    const v = searchParams.get('sort');
    return v === 'title' || v === 'playtime' || v === 'lastPlayed' ? v : 'lastPlayed';
  })();
  const setSortBy = (s: SortBy) => {
    const next = new URLSearchParams(searchParams);
    if (s === 'lastPlayed') next.delete('sort'); else next.set('sort', s);
    setSearchParams(next, { replace: true });
  };
  const viewMode: 'shelves' | 'grid' | 'list' = (() => {
    const v = searchParams.get('view');
    if (v === 'shelves' || v === 'grid' || v === 'list') return v;
    return prefs.libraryView;
  })();
  const setViewMode = (m: 'shelves' | 'grid' | 'list') => {
    const next = new URLSearchParams(searchParams);
    if (m === prefs.libraryView) next.delete('view'); else next.set('view', m);
    setSearchParams(next, { replace: true });
    void updatePref({ libraryView: m });
  };
  const coverDims = COVER_DIMS[prefs.coverDensity] ?? COVER_DIMS['standard']!;

  const applyFilters = useCallback((games: UserGameDetail[]): UserGameDetail[] => {
    const result = platFilter === 'all' ? games : games.filter(ug => Object.keys(ug.playtimeByPlatform).includes(platFilter));
    if (sortBy === 'title') return [...result].sort((a, b) => a.game.title.localeCompare(b.game.title));
    if (sortBy === 'playtime') return [...result].sort((a, b) => {
      const total = (ug: UserGameDetail) => Object.values(ug.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
      return total(b) - total(a);
    });
    return [...result].sort((a, b) => (b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0) - (a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0));
  }, [platFilter, sortBy]);

  const shelfCounts: Partial<Record<GameStatus, number>> = shelvesData?.counts ?? {};
  const totalGames = (Object.values(shelfCounts) as number[]).reduce((s, n) => s + n, 0);

  const shelves: ShelfDisplay[] = useMemo(() =>
    SHELF_CONFIG.map(cfg => {
      const items = applyFilters(shelvesData?.shelves[cfg.status] ?? []);
      return { ...cfg, count: shelfCounts[cfg.status] ?? items.length, items: items.map(toGameDisplay) };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [shelvesData, applyFilters, JSON.stringify(shelfCounts)]);

  if (error) {
    return (
      <>
        <TopBar crumbs={['hoard', 'library']} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '32px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-xs)" }}>{`// failed to load library`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)", maxWidth: 480, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }

  if (loading || (!isFiltered && !shelvesData) || (isFiltered && !filteredData)) {
    // Skeleton mirrors the real layout (filter bar + 6 shelves with the
    // current cover-density dims) so the swap to loaded content doesn't jolt.
    if (isFiltered) {
      const cfg = SHELF_CONFIG.find(c => c.status === statusParam);
      return (
        <>
          <TopBar crumbs={['hoard', 'library', (cfg?.name ?? statusParam ?? '').toLowerCase()]} />
          <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="skel" style={{ width: 88, height: 24 }} />
            <div style={{ width: 1, height: 20, background: 'var(--rule)' }} />
            <div className="skel" style={{ width: 80, height: 12 }} />
            <div className="skel" style={{ width: 60, height: 11 }} />
            <span style={{ flex: 1 }} />
            <div className="skel" style={{ width: 96, height: 24 }} />
          </div>
          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 40px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {Array.from({ length: 18 }).map((_, j) => (
                <div key={j} className="skel" style={{ width: coverDims.w, height: coverDims.h, flex: '0 0 auto' }} />
              ))}
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <TopBar crumbs={['hoard', 'library']} />
        <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="skel" style={{ width: 320, height: 28 }} />
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <div className="skel" style={{ width: 32, height: 11 }} />
          <div className="skel" style={{ width: 60, height: 22 }} />
          <div className="skel" style={{ width: 50, height: 22 }} />
          <div className="skel" style={{ width: 45, height: 22 }} />
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <div className="skel" style={{ width: 28, height: 11 }} />
          <div className="skel" style={{ width: 38, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <span style={{ flex: 1 }} />
          <div className="skel" style={{ width: 110, height: 14 }} />
          <div className="skel" style={{ width: 96, height: 24 }} />
        </div>
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 40px' }}>
          {SHELF_CONFIG.map((cfg) => (
            <div key={cfg.status} style={{ padding: '24px 0' }}>
              <div className="shelf-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="skel" style={{ width: 22, height: 14 }} />
                <div className="skel" style={{ width: 100, height: 12 }} />
                <div className="skel" style={{ width: 60, height: 10 }} />
              </div>
              <div style={{ display: 'flex', gap: SHELF_GAP, marginTop: 10, overflow: 'hidden' }}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="skel" style={{ width: coverDims.w, height: coverDims.h, flex: '0 0 auto' }} />
                ))}
              </div>
              <div style={{ height: 4, background: 'var(--rule-bright)', marginTop: 10, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: 'var(--rule)' }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (statusParam) {
    const cfg = SHELF_CONFIG.find(c => c.status === statusParam);
    const filteredGames = filteredData?.games ?? [];
    const items = applyFilters(filteredGames).map(toGameDisplay);
    const isBacklog = statusParam === 'Backlog';
    const accent = cfg?.tone === 'green' ? 'var(--green)' : cfg?.tone === 'amber' ? 'var(--amber)' : cfg?.tone === 'red' ? 'var(--red)' : 'var(--paper)';
    return (
      <>
        <TopBar crumbs={['hoard', 'library', (cfg?.name ?? statusParam).toLowerCase()]} />
        <div style={{ padding: '16px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn sm onClick={() => navigate('/library')}>
            <Icon name="back" size={10} /> shelves
          </Btn>
          <div style={{ width: 1, height: 20, background: 'var(--rule)' }} />
          <span className="t-up" style={{ fontSize: "var(--text-2xs)", color: accent }}>{cfg?.name ?? statusParam}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>· {items.length} titles</span>
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
            <span className="t-mono t-faint" style={{ fontSize: "var(--text-xs)" }}>// no titles in this shelf yet</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {items.map(g => <ShelfItem key={g.id} g={g} w={coverDims.w} h={coverDims.h} isBacklog={isBacklog} showHltb={prefs.showHltb} />)}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar crumbs={['hoard', 'library']} />

      {/* filter bar */}
      <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 320 }}>
            <span className="pre">$</span>
            <span style={{ color: 'var(--paper)' }}>find</span>
            <span style={{ color: 'var(--paper-dim)' }}>{totalGames} games · type to filter</span>
            <span style={{ marginLeft: 'auto', fontSize: "var(--text-3xs)", color: 'var(--paper-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="search" size={11} /> K
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>view</span>
          <Chip on={viewMode === 'shelves'} onClick={() => setViewMode('shelves')}>shelves</Chip>
          <Chip on={viewMode === 'grid'}    onClick={() => setViewMode('grid')}>grid</Chip>
          <Chip on={viewMode === 'list'}    onClick={() => setViewMode('list')}>list</Chip>
          <div style={{ width: 1, height: 24, background: 'var(--rule)' }} />
          <span className="t-up t-faint" style={{ fontSize: "var(--text-3xs)" }}>plat</span>
          <Chip on={platFilter === 'all'} onClick={() => setPlatFilter('all')}>all</Chip>
          <Chip on={platFilter === 'ST'} onClick={() => setPlatFilter(platFilter === 'ST' ? 'all' : 'ST')}><Plat code="ST" /></Chip>
          <Chip on={platFilter === 'PS'} onClick={() => setPlatFilter(platFilter === 'PS' ? 'all' : 'PS')}><Plat code="PS" /></Chip>
          <Chip on={platFilter === 'XB'} onClick={() => setPlatFilter(platFilter === 'XB' ? 'all' : 'XB')}><Plat code="XB" /></Chip>
          <Chip on={platFilter === 'GG'} onClick={() => setPlatFilter(platFilter === 'GG' ? 'all' : 'GG')}><Plat code="GG" /></Chip>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="t-mono t-faint"
            aria-label={`Sort by ${SORT_LABELS[sortBy]}, click to change`}
            style={{ fontSize: "var(--text-2xs)", display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'transparent', border: 'none', padding: 4, margin: -4, fontFamily: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
            onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length]!)}
          >
            sort: {SORT_LABELS[sortBy]} <Icon name="arrowD" size={10} />
          </button>
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

      {/* shelves OR empty-state CTA */}
      <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '0 32px 40px' }}>
        {totalGames === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
            <div className="panel" style={{ padding: 32, maxWidth: 480, width: '100%', textAlign: 'center' }}>
              <Marker>// no titles yet</Marker>
              <p style={{ marginTop: 14, color: 'var(--paper-dim)', fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
                your library is empty. connect a platform to sync your games, or add one manually.
              </p>
              <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={() => navigate('/settings/platforms')}>
                  <Icon name="link" size={11} /> connect a platform
                </Btn>
                <Btn onClick={() => setShowAddModal(true)}>
                  <Icon name="plus" size={11} /> add a game
                </Btn>
              </div>
            </div>
          </div>
        ) : (
          shelves.map((s, i) => (
            <Shelf key={s.status} idx={i + 1} shelf={s} coverW={coverDims.w} coverH={coverDims.h} showHltb={prefs.showHltb} />
          ))
        )}
      </div>
    </>
  );
}
