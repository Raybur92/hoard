import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { useGames } from '../../hooks/useGames';
import { useShelves } from '../../hooks/useShelves';
import { usePreferences } from '../../contexts/PreferencesContext';
import { minutesToHours } from '../../lib/utils';
import { PullableScroll } from '../primitives/PullableScroll';
import { AddGameModal } from './AddGameModal';
import type { UserGameDetail, GameStatus } from '@hoard/types';

// Mobile cover dimensions per density preference.
// `standard` matches the original 84×112; `cozy` and `dense` mirror the
// desktop ratio scaled down for mobile width budgets.
const COVER_DIMS: Record<string, { w: number; h: number }> = {
  cozy:     { w: 96, h: 128 },
  standard: { w: 84, h: 112 },
  dense:    { w: 72, h: 96 },
};

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

function MobileShelf({ idx, shelf, coverW, coverH }: { idx: number; shelf: ShelfDisplay; coverW: number; coverH: number }) {
  const navigate = useNavigate();
  const accent = shelf.tone === 'green' ? 'var(--green)' : shelf.tone === 'amber' ? 'var(--amber)' : shelf.tone === 'red' ? 'var(--red)' : 'var(--paper)';
  const isBacklog = shelf.status === 'Backlog';
  // Slot count adapts to density: smaller covers fit more per row.
  const visibleSlots = coverW <= 80 ? 4 : coverW >= 96 ? 2 : 3;
  const shown = shelf.items.slice(0, visibleSlots);
  const remaining = shelf.count - shown.length;
  return (
    <div id={`shelf-${shelf.status}`} style={{ padding: '14px 0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px' }}>
        <span className="t-display" style={{ fontSize: "var(--text-md)", color: accent, lineHeight: 0.9 }}>{String(idx).padStart(2, '0')}</span>
        <span className="t-up" style={{ fontSize: "var(--text-xs)", letterSpacing: '0.14em' }}>{shelf.name}</span>
        <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)" }}>· {shelf.count}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, overflow: 'hidden', padding: '12px 16px 0' }}>
        {shown.map(g => (
          <button
            key={g.id}
            type="button"
            aria-label={`Open ${g.title}`}
            onClick={() => navigate(`/game/${g.id}`)}
            style={{ width: coverW, flex: '0 0 auto', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' }}
          >
            <div style={{ position: 'relative' }}>
              <Cover w={coverW} h={coverH} src={g.coverUrl} label={(g.title.split(/[: ]/)[0] ?? g.title).toUpperCase()} bright={g.progress > 0} />
              <div style={{ position: 'absolute', top: 4, right: 4 }}><Plat code={g.platformCode} /></div>
              {g.progress > 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.3)' }}>
                  <div style={{ height: '100%', width: `${g.progress}%`, background: g.progress === 100 ? 'var(--paper)' : 'var(--green)' }} />
                </div>
              )}
            </div>
            <div style={{ fontSize: "var(--text-3xs)", marginTop: 5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
            <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', marginTop: 1, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <span>{g.playtime}</span>
              {isBacklog && g.hltbHours != null && <span style={{ color: 'var(--paper-dim)' }}>~{g.hltbHours}h</span>}
            </div>
          </button>
        ))}
        <button
          type="button"
          aria-label={`View all ${shelf.status} games`}
          onClick={() => navigate(`/library/${encodeURIComponent(shelf.status)}`)}
          style={{ width: coverW, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--rule-bright)', height: coverH, color: 'var(--paper-dim)', fontSize: "var(--text-3xs)", gap: 4, cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}
        >
          {remaining > 0 && <span style={{ fontSize: "var(--text-md)" }}>+{remaining}</span>}
          <span className="t-up" style={{ fontSize: "var(--text-3xs)" }}>view all</span>
        </button>
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
  const { status: statusParam } = useParams<{ status?: string }>();
  const isFiltered = !!statusParam;
  useDocumentTitle(statusParam ? `Library · ${statusParam}` : 'Library');
  const { prefs } = usePreferences();
  const { w: coverW, h: coverH } = COVER_DIMS[prefs.coverDensity] ?? COVER_DIMS['standard']!;

  // Library-only search input (PR A — A1c). Mirrors LibraryDesktop: typing
  // a query swaps the shelves view for a flat result grid scoped to the
  // user's owned games. No `/` shortcut on mobile — just tap the input.
  const [searchInput, setSearchInput] = useState('');
  const trimmedQuery = searchInput.trim();
  const isSearching = !isFiltered && trimmedQuery.length > 0;

  const { data: shelvesData, loading: shelvesLoading, error: shelvesError, refetch: refetchShelves } =
    useShelves(4, { enabled: !isFiltered && !isSearching });
  const { data: filteredData, loading: filteredLoading, error: filteredError, refetch: refetchFiltered } =
    useGames(
      isFiltered ? { status: statusParam as GameStatus, limit: 500 } : undefined,
      { enabled: isFiltered },
    );
  const { data: searchData, loading: searchLoading } =
    useGames(
      isSearching ? { q: trimmedQuery, limit: 100 } : undefined,
      { enabled: isSearching },
    );

  const loading = isFiltered ? filteredLoading : isSearching ? searchLoading : shelvesLoading;
  const error = isFiltered ? filteredError : shelvesError;
  const refetch = isFiltered ? refetchFiltered : refetchShelves;

  const [showAddModal, setShowAddModal] = useState(false);
  const [platFilter, setPlatFilter] = useState<string>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const sortBy: SortBy = (() => {
    const v = searchParams.get('sort');
    return v === 'title' || v === 'playtime' || v === 'lastPlayed' ? v : 'lastPlayed';
  })();
  const setSortBy = (s: SortBy) => {
    const next = new URLSearchParams(searchParams);
    if (s === 'lastPlayed') next.delete('sort'); else next.set('sort', s);
    setSearchParams(next, { replace: true });
  };

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
        <MobileHeader title="shelves" sub="// load failed" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '24px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-2xs)" }}>{`// failed to load library`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", maxWidth: 320, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }

  if (loading || (!isFiltered && !shelvesData) || (isFiltered && !filteredData)) {
    // Skeleton mirrors the real layout (header + chip row + 6 shelves) so
    // the swap to loaded content doesn't jolt.
    if (isFiltered) {
      const cfg = SHELF_CONFIG.find(c => c.status === statusParam);
      const title = (cfg?.name ?? statusParam ?? '').toLowerCase();
      return (
        <>
          <MobileHeader title={title} sub="// loading…" back onBack={() => navigate('/library')} />
          <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Array.from({ length: 12 }).map((_, j) => (
                <div key={j} className="skel" style={{ width: 84, height: 112, flex: '0 0 auto' }} />
              ))}
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <MobileHeader title="shelves" sub="// loading…" />
        <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 32, height: 22 }} />
          <div className="skel" style={{ width: 78, height: 22 }} />
        </div>
        <div className="thin-scroll" style={{ flex: 1, overflow: 'auto', marginTop: 6 }}>
          {SHELF_CONFIG.map((cfg) => (
            <div key={cfg.status} style={{ padding: '14px 0 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
                <div className="skel" style={{ width: 22, height: 16 }} />
                <div className="skel" style={{ width: 90, height: 12 }} />
                <div className="skel" style={{ width: 36, height: 10 }} />
              </div>
              <div style={{ display: 'flex', gap: 10, padding: '12px 16px 0', overflow: 'hidden' }}>
                {[0, 1, 2, 3].map(j => (
                  <div key={j} className="skel" style={{ width: 84, height: 112, flex: '0 0 auto' }} />
                ))}
              </div>
              <div style={{ height: 3, background: 'var(--rule-bright)', margin: '10px 16px 0' }} />
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
    const title = (cfg?.name ?? statusParam).toLowerCase();
    return (
      <>
        <MobileHeader
          title={title}
          sub={`// ${items.length} titles`}
          back
          onBack={() => navigate('/library')}
          right={<Btn sm variant="primary" ariaLabel="Add game" onClick={() => setShowAddModal(true)}><Icon name="plus" size={10} /></Btn>}
        />
        {showAddModal && (
          <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { void refetch(); }} />
        )}
        {/* Filter strip — same chips as the unfiltered view, mirrors desktop's filter bar */}
        <div className="thin-scroll" style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
          <Chip on={platFilter === 'all'} onClick={() => setPlatFilter('all')}>all</Chip>
          <Chip on={platFilter === 'ST'} onClick={() => setPlatFilter(platFilter === 'ST' ? 'all' : 'ST')} ariaLabel="Filter by Steam"><Plat code="ST" /></Chip>
          <Chip on={platFilter === 'PS'} onClick={() => setPlatFilter(platFilter === 'PS' ? 'all' : 'PS')} ariaLabel="Filter by PlayStation"><Plat code="PS" /></Chip>
          <Chip on={platFilter === 'XB'} onClick={() => setPlatFilter(platFilter === 'XB' ? 'all' : 'XB')} ariaLabel="Filter by Xbox"><Plat code="XB" /></Chip>
          <Chip on={platFilter === 'GG'} onClick={() => setPlatFilter(platFilter === 'GG' ? 'all' : 'GG')} ariaLabel="Filter by GOG"><Plat code="GG" /></Chip>
          <Chip onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length]!)} ariaLabel={`Sort by ${SORT_LABELS[sortBy]}, click to change`}>
            <Icon name="arrowD" size={10} style={{ marginRight: 4 }} />{SORT_LABELS[sortBy]}
          </Chip>
        </div>
        <PullableScroll onRefresh={refetch} ariaLabel={`${title} games`} style={{ padding: '12px 16px 20px' }}>
          {items.length === 0 ? (
            <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>// no titles in this shelf yet</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {items.map(g => (
                <button
                  key={g.id}
                  type="button"
                  aria-label={`Open ${g.title}`}
                  onClick={() => navigate(`/game/${g.id}`)}
                  style={{ width: coverW, flex: '0 0 auto', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' }}
                >
                  <div style={{ position: 'relative' }}>
                    <Cover w={coverW} h={coverH} src={g.coverUrl} label={(g.title.split(/[: ]/)[0] ?? g.title).toUpperCase()} bright={g.progress > 0} />
                    <div style={{ position: 'absolute', top: 4, right: 4 }}><Plat code={g.platformCode} /></div>
                    {g.progress > 0 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.3)' }}>
                        <div style={{ height: '100%', width: `${g.progress}%`, background: g.progress === 100 ? 'var(--paper)' : 'var(--green)' }} />
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: "var(--text-3xs)", marginTop: 5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
                  <div style={{ fontSize: "var(--text-2xs)", color: 'var(--paper-dim)', marginTop: 1, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <span>{g.playtime}</span>
                    {isBacklog && g.hltbHours != null && <span style={{ color: 'var(--paper-dim)' }}>~{g.hltbHours}h</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </PullableScroll>
      </>
    );
  }

  return (
    <>
      <MobileHeader
        title="shelves"
        sub={`// ${totalGames} titles`}
        right={<Btn sm variant="primary" ariaLabel="Add game" onClick={() => setShowAddModal(true)}><Icon name="plus" size={10} /></Btn>}
      />
      {showAddModal && (
        <AddGameModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { void refetch(); }}
        />
      )}
      {/* Library-only search (A1c). Sort + plat-filter chips removed from
          the shelves view in PR A (D4) — both remain on the filtered
          single-shelf page where the full set is loaded. */}
      <div style={{ padding: '8px 16px 4px', flexShrink: 0 }}>
        <label htmlFor="library-search-mobile" className="field" style={{ width: '100%', cursor: 'text' }}>
          <span className="pre">$</span>
          <span style={{ color: 'var(--paper)' }}>find</span>
          <input
            id="library-search-mobile"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`${totalGames} games · type to filter`}
            aria-label="Search your library"
            style={{
              flex: 1, minWidth: 0,
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit',
              padding: 0,
            }}
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchInput('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--paper-dim)', cursor: 'pointer', padding: '0 4px', fontSize: 'var(--text-md)', lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </label>
      </div>
      <PullableScroll onRefresh={refetch} ariaLabel={isSearching ? 'Library search results' : 'Library shelves'}>
        {isSearching ? (
          (() => {
            const results = (searchData?.games ?? []).map(toGameDisplay);
            return (
              <div style={{ padding: '12px 16px 20px' }}>
                <div className="t-up t-faint" style={{ fontSize: 'var(--text-2xs)' }}>
                  {searchLoading ? '// searching…' : `// ${results.length} match${results.length === 1 ? '' : 'es'}`}
                </div>
                {results.length === 0 && !searchLoading ? (
                  <p style={{ marginTop: 12, color: 'var(--paper-dim)', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                    no titles in your library match "{trimmedQuery}".
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                    {results.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        aria-label={`Open ${g.title}`}
                        onClick={() => navigate(`/game/${g.id}`)}
                        style={{ width: coverW, flex: '0 0 auto', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' }}
                      >
                        <div style={{ position: 'relative' }}>
                          <Cover w={coverW} h={coverH} src={g.coverUrl} label={(g.title.split(/[: ]/)[0] ?? g.title).toUpperCase()} bright={g.progress > 0} />
                          <div style={{ position: 'absolute', top: 4, right: 4 }}><Plat code={g.platformCode} /></div>
                        </div>
                        <div style={{ fontSize: "var(--text-3xs)", marginTop: 5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        ) : totalGames === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
            <div className="panel" style={{ padding: 20, width: '100%', textAlign: 'center' }}>
              <span className="t-mono t-faint" style={{ fontSize: "var(--text-2xs)" }}>// no titles yet</span>
              <p style={{ marginTop: 10, color: 'var(--paper-dim)', fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                your library is empty. connect a platform or add a game manually.
              </p>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            <MobileShelf key={s.status} idx={i + 1} shelf={s} coverW={coverW} coverH={coverH} />
          ))
        )}
      </PullableScroll>
    </>
  );
}
