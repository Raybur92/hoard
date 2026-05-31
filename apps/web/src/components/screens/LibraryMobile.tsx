import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { MobileHeader } from '../layout/MobileHeader';
import { Cover } from '../primitives/Cover';
import { Plat } from '../primitives/Plat';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { Btn } from '../primitives/Btn';
import { useGames } from '../../hooks/useGames';
import { useShelves } from '../../hooks/useShelves';
import { useLensIndex } from '../../hooks/useLensIndex';
import { useLensRoute, type LensType } from '../../hooks/useLensRoute';
import { usePreferences } from '../../contexts/PreferencesContext';
import { minutesToHours } from '../../lib/utils';
import { pickTopTagCounts, filterByTag, type TagDimension } from '../../lib/pickTopTags';
import { slugifyTag, findTagBySlug } from '../../lib/tagSlug';
import { FilterPopover } from '../library/FilterPopover';
import { ChangeLensPopover } from '../library/ChangeLensPopover';
import { BrowseByPanel } from '../library/BrowseByPanel';
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
  // B-IGDB-3b2 — lens-aware routing (mirrors LibraryDesktop).
  const lens = useLensRoute();
  const statusParam = lens.type === 'status' ? lens.slug : undefined;
  const isFiltered = lens.type !== null;
  const { data: lensIndex, loading: lensIndexLoading } = useLensIndex();
  const lensCanonical: string | null = (() => {
    if (!lens.slug) return null;
    if (lens.type === 'status') return lens.slug;
    if (!lensIndex) return null;
    const dim = lens.type === 'genre' ? lensIndex.genre
              : lens.type === 'theme' ? lensIndex.theme
              : lens.type === 'perspective' ? lensIndex.perspective
              : null;
    return dim ? findTagBySlug(dim.map((e) => e.name), lens.slug) : null;
  })();
  useDocumentTitle(
    lens.type === null
      ? 'Library'
      : `Library · ${lens.type === 'status' ? statusParam : (lensCanonical ?? lens.slug)}`,
  );
  const { prefs } = usePreferences();
  const { w: coverW, h: coverH } = COVER_DIMS[prefs.coverDensity] ?? COVER_DIMS['standard']!;

  const [searchInput, setSearchInput] = useState('');
  const trimmedQuery = searchInput.trim();
  const isSearching = !isFiltered && trimmedQuery.length > 0;

  const { data: shelvesData, loading: shelvesLoading, error: shelvesError, refetch: refetchShelves } =
    useShelves(4, { enabled: !isFiltered && !isSearching });
  const filteredParams = (() => {
    if (lens.type === 'status' && statusParam)
      return { status: statusParam as GameStatus, limit: 50000 };
    if (lens.type === 'genre' && lensCanonical)
      return { genre: lensCanonical, limit: 50000 };
    if (lens.type === 'theme' && lensCanonical)
      return { theme: lensCanonical, limit: 50000 };
    if (lens.type === 'perspective' && lensCanonical)
      return { perspective: lensCanonical, limit: 50000 };
    return undefined;
  })();
  const filteredEnabled = filteredParams !== undefined;
  const { data: filteredData, loading: filteredLoading, error: filteredError, refetch: refetchFiltered } =
    useGames(filteredParams, { enabled: filteredEnabled });
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

  // B-IGDB-3b1 — IGDB-tag triple secondary filters live in URL params.
  const genreFilter = searchParams.get('genre');
  const themeFilter = searchParams.get('theme');
  const perspectiveFilter = searchParams.get('perspective');
  const setTagFilter = (dimension: 'genre' | 'theme' | 'perspective', value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(dimension); else next.set(dimension, value);
    setSearchParams(next, { replace: true });
  };
  // B-IGDB-3b2 — find input scoped to active lens.
  const findQuery = searchParams.get('q') ?? '';
  const setFindQuery = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim().length === 0) next.delete('q'); else next.set('q', value);
    setSearchParams(next, { replace: true });
  };

  // Reset local platform-filter state on lens change. URL-resident
  // secondaries (genre/theme/perspective/q) are NOT cleared — they're
  // already accurate to the new URL by virtue of being URL state, and
  // the change-lens pivot intentionally carries them across. See
  // LibraryDesktop's matching comment.
  useEffect(() => {
    setPlatFilter('all');
  }, [lens.slug, lens.type]);
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
    let result = platFilter === 'all' ? games : games.filter(ug => Object.keys(ug.playtimeByPlatform).includes(platFilter));
    // B-IGDB-3b1 — IGDB-tag triple secondary filters compose with platform.
    result = filterByTag(result, 'genre', genreFilter);
    result = filterByTag(result, 'theme', themeFilter);
    result = filterByTag(result, 'perspective', perspectiveFilter);
    if (sortBy === 'title') return [...result].sort((a, b) => a.game.title.localeCompare(b.game.title));
    if (sortBy === 'playtime') return [...result].sort((a, b) => {
      const total = (ug: UserGameDetail) => Object.values(ug.playtimeByPlatform).reduce<number>((s, m) => s + (m ?? 0), 0);
      return total(b) - total(a);
    });
    return [...result].sort((a, b) => (b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0) - (a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0));
  }, [platFilter, sortBy, genreFilter, themeFilter, perspectiveFilter]);

  const shelfCounts: Partial<Record<GameStatus, number>> = shelvesData?.counts ?? {};
  const totalGames = (Object.values(shelfCounts) as number[]).reduce((s, n) => s + n, 0);

  const shelves: ShelfDisplay[] = useMemo(() =>
    SHELF_CONFIG.map(cfg => {
      const items = applyFilters(shelvesData?.shelves[cfg.status] ?? []);
      return { ...cfg, count: shelfCounts[cfg.status] ?? items.length, items: items.map(toGameDisplay) };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [shelvesData, applyFilters, JSON.stringify(shelfCounts)]);

  // Modal element rendered at a stable position across all return branches.
  // See LibraryDesktop's matching comment for the rationale — refetch's
  // brief loading flicker would otherwise unmount the modal and remount it
  // on the next render, losing P5 success state.
  const modalElement = showAddModal && (
    <AddGameModal onClose={() => setShowAddModal(false)} onAdded={() => { void refetch(); }} />
  );

  if (error) {
    return (
      <>
        {modalElement}
        <MobileHeader title="shelves" sub="// load failed" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '24px' }}>
          <span className="t-mono t-red" style={{ fontSize: "var(--text-2xs)" }}>{`// failed to load library`}</span>
          <span className="t-mono t-faint" style={{ fontSize: "var(--text-3xs)", maxWidth: 320, textAlign: 'center' }}>{error}</span>
          <Btn sm onClick={() => refetch()}>retry</Btn>
        </div>
      </>
    );
  }

  // B-IGDB-3b2 — slug-not-resolved guard (tag lens).
  if (lens.type && lens.type !== 'status' && !lensIndexLoading && lensCanonical === null) {
    return (
      <>
        {modalElement}
        <MobileHeader title={`${lens.type} not found`} back onBack={() => navigate('/library')} />
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="t-mono t-faint" style={{ fontSize: 'var(--text-xs)' }}>// {lens.type} not found</span>
          <span className="t-mono" style={{ fontSize: 'var(--text-sm)' }}>
            no {lens.type} matches "{lens.slug}"
          </span>
        </div>
      </>
    );
  }

  if (loading || lensIndexLoading || (!isFiltered && !shelvesData) || (isFiltered && filteredEnabled && !filteredData)) {
    // Skeleton mirrors the real layout (header + chip row + 6 shelves) so
    // the swap to loaded content doesn't jolt.
    if (isFiltered) {
      const cfg = lens.type === 'status' ? SHELF_CONFIG.find(c => c.status === statusParam) : null;
      const title = lens.type === 'status'
        ? (cfg?.name ?? statusParam ?? '').toLowerCase()
        : `${lens.type ?? ''} · ${lens.slug ?? ''}`;
      return (
        <>
          {modalElement}
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
        {modalElement}
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

  if (filteredEnabled && lens.type) {
    const cfg = lens.type === 'status' ? SHELF_CONFIG.find(c => c.status === statusParam) : null;
    const displayName = lens.type === 'status'
      ? (cfg?.name ?? statusParam ?? '')
      : (lensCanonical ?? '');
    const title = displayName.toLowerCase();
    const filteredGames = filteredData?.games ?? [];
    // Find query client-side over the loaded set.
    const findTrimmed = findQuery.trim().toLowerCase();
    const findFilteredGames = findTrimmed.length === 0
      ? filteredGames
      : filteredGames.filter((g) => g.game.title.toLowerCase().includes(findTrimmed));
    const items = applyFilters(findFilteredGames).map(toGameDisplay);
    const isBacklog = lens.type === 'status' && statusParam === 'Backlog';
    // Display count.
    const anyFilterActive = platFilter !== 'all'
      || genreFilter !== null
      || themeFilter !== null
      || perspectiveFilter !== null
      || findTrimmed.length > 0;
    const displayCount = anyFilterActive ? items.length : (filteredData?.total ?? items.length);
    // Secondary filter visibility per PAGES_PLAN §4.4.1 — hide the
    // popover for the dimension that's PRIMARY on this lens.
    const secondaryDims: { id: TagDimension; label: string; active: string | null }[] = (
      [
        { id: 'genre',       label: 'genre', active: genreFilter,       hideOnLens: 'genre' },
        { id: 'theme',       label: 'theme', active: themeFilter,       hideOnLens: 'theme' },
        { id: 'perspective', label: 'persp', active: perspectiveFilter, hideOnLens: 'perspective' },
      ] as const
    ).filter((d) => d.hideOnLens !== lens.type)
     .map(({ id, label, active }) => ({ id, label, active }));
    // Change-lens options (same pivot rules as LibraryDesktop —
    // see the matching comment block there for the full rationale).
    const changeLensOptions = ([
      { type: 'status' as LensType,      label: 'status' },
      { type: 'genre' as LensType,       label: 'genre' },
      { type: 'theme' as LensType,       label: 'theme' },
      { type: 'perspective' as LensType, label: 'perspective' },
    ]).map((o) => {
      if (o.type === lens.type) return { ...o, disabled: true };
      if (o.type === 'status') return { ...o, disabled: true }; // deferred
      if (o.type === 'genre' && genreFilter) return { ...o, disabled: false };
      if (o.type === 'theme' && themeFilter) return { ...o, disabled: false };
      if (o.type === 'perspective' && perspectiveFilter) return { ...o, disabled: false };
      return { ...o, disabled: true };
    });
    const handleChangeLens = (target: LensType) => {
      if (target === 'status') return;
      let activeValue: string | null = null;
      if (target === 'genre') activeValue = genreFilter;
      else if (target === 'theme') activeValue = themeFilter;
      else if (target === 'perspective') activeValue = perspectiveFilter;
      if (!activeValue) return;
      const newParams = new URLSearchParams(searchParams);
      newParams.delete(target);
      if (lens.type === 'status' && statusParam) {
        newParams.set('status', statusParam);
      } else if (lens.type && lens.type !== 'status' && lensCanonical) {
        newParams.set(lens.type, lensCanonical);
      }
      const qs = newParams.toString();
      navigate(`/library/by-${target}/${slugifyTag(activeValue)}${qs ? `?${qs}` : ''}`);
    };
    return (
      <>
        {modalElement}
        <MobileHeader
          title={title}
          sub={`// ${lens.type === 'status' ? '' : `${lens.type} · `}${displayCount} titles`}
          back
          onBack={() => navigate('/library')}
          right={<Btn sm variant="primary" ariaLabel="Add game" onClick={() => setShowAddModal(true)}><Icon name="plus" size={10} /></Btn>}
        />
        {/* Filter strip — same chips as the unfiltered view, mirrors desktop's filter bar */}
        <div className="thin-scroll" style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
          <Chip on={platFilter === 'all'} onClick={() => setPlatFilter('all')}>all</Chip>
          <Chip on={platFilter === 'ST'} onClick={() => setPlatFilter(platFilter === 'ST' ? 'all' : 'ST')} ariaLabel="Filter by Steam"><Plat code="ST" /></Chip>
          <Chip on={platFilter === 'PS'} onClick={() => setPlatFilter(platFilter === 'PS' ? 'all' : 'PS')} ariaLabel="Filter by PlayStation"><Plat code="PS" /></Chip>
          <Chip on={platFilter === 'XB'} onClick={() => setPlatFilter(platFilter === 'XB' ? 'all' : 'XB')} ariaLabel="Filter by Xbox"><Plat code="XB" /></Chip>
          <Chip on={platFilter === 'GG'} onClick={() => setPlatFilter(platFilter === 'GG' ? 'all' : 'GG')} ariaLabel="Filter by GOG"><Plat code="GG" /></Chip>
          <Chip on={platFilter === 'IT'} onClick={() => setPlatFilter(platFilter === 'IT' ? 'all' : 'IT')} ariaLabel="Filter by itch.io"><Plat code="IT" /></Chip>
          <Chip on={platFilter === 'EP'} onClick={() => setPlatFilter(platFilter === 'EP' ? 'all' : 'EP')} ariaLabel="Filter by Epic Games"><Plat code="EP" /></Chip>
          <Chip on={platFilter === 'NT'} onClick={() => setPlatFilter(platFilter === 'NT' ? 'all' : 'NT')} ariaLabel="Filter by Nintendo"><Plat code="NT" /></Chip>
          <Chip onClick={() => setSortBy(SORT_CYCLE[(SORT_CYCLE.indexOf(sortBy) + 1) % SORT_CYCLE.length]!)} ariaLabel={`Sort by ${SORT_LABELS[sortBy]}, click to change`}>
            <Icon name="arrowD" size={10} style={{ marginRight: 4 }} />{SORT_LABELS[sortBy]}
          </Chip>
        </div>

        {/* B-IGDB-3b2 — find input + change-lens + secondary filter
            popovers per active primary lens. Find input on its own row
            for breathing room on mobile; popovers + change-lens scroll
            horizontally alongside platform chips. */}
        <div style={{ padding: '6px 16px 0', flexShrink: 0 }}>
          <label htmlFor="library-find-mobile" className="field" style={{ width: '100%', cursor: 'text' }}>
            <span className="pre">$</span>
            <span style={{ color: 'var(--paper)' }}>find</span>
            <input
              id="library-find-mobile"
              type="text"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="title..."
              aria-label="Find within current lens"
              style={{
                flex: 1, minWidth: 0,
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit',
                padding: 0,
              }}
            />
            {findQuery && (
              <button
                type="button"
                aria-label="Clear find"
                onClick={() => setFindQuery('')}
                style={{ background: 'transparent', border: 'none', color: 'var(--paper-dim)', cursor: 'pointer', padding: '0 4px', fontSize: 'var(--text-md)', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </label>
        </div>
        {(() => {
          const fullShelf = filteredData?.games ?? [];
          const rendered = secondaryDims.map((d) => {
            const opts = pickTopTagCounts(fullShelf, d.id);
            if (d.active && !opts.some((o) => o.name === d.active)) {
              opts.unshift({ name: d.active, count: 0 });
            }
            if (opts.length === 0) return null;
            return (
              <div key={d.id} data-testid={`library-${d.id}-filter`} style={{ flexShrink: 0 }}>
                <FilterPopover
                  label={d.label}
                  value={d.active}
                  options={opts}
                  onChange={(next) => setTagFilter(d.id, next)}
                />
              </div>
            );
          }).filter(Boolean);
          // change-lens chip always shown on filtered views (it's the
          // pivot affordance, not a tag filter — disabled options are
          // greyed out within its picker).
          return (
            <div
              className="thin-scroll"
              style={{ padding: '6px 16px 0', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, alignItems: 'center' }}
            >
              <div style={{ flexShrink: 0 }}>
                <ChangeLensPopover current={lens.type} options={changeLensOptions} onPick={handleChangeLens} />
              </div>
              {rendered}
            </div>
          );
        })()}
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
      {modalElement}
      <MobileHeader
        title="shelves"
        sub={`// ${totalGames} titles`}
        right={<Btn sm variant="primary" ariaLabel="Add game" onClick={() => setShowAddModal(true)}><Icon name="plus" size={10} /></Btn>}
      />
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
          <>
            {shelves.map((s, i) => (
              <MobileShelf key={s.status} idx={i + 1} shelf={s} coverW={coverW} coverH={coverH} />
            ))}
            {/* B-IGDB-3b2 — browse-by panel below the shelves. */}
            <div style={{ padding: '0 16px' }}>
              <BrowseByPanel data={lensIndex} />
            </div>
          </>
        )}
      </PullableScroll>
    </>
  );
}
